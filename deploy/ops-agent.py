#!/usr/bin/env python3
"""The Control Center's server agent (founder, 28/10/2026 — supabase/migrations/20270268000000_ops_control.sql).

Every minute (root's cron): runs the one command a super admin asked for in the app, if any — only the whitelisted
ones below, never anything the app sends — and, every 5 minutes or after a command, writes the Droplet's health and
security report to public.ops_status for the app's Control Center. Python's standard library and the postgres image
only; the database URL is read from /opt/luysmart/.env and never printed.

  sudo python3 deploy/ops-agent.py            (one run)
  sudo python3 deploy/ops-agent.py install    (the cron, every minute)
"""
import datetime
import glob
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP_DIR = "/opt/luysmart"
STATE = "/var/lib/luysmart-ops"
TAG = "luysmart-ops-agent"

# The only things the app can ask for — each a fixed command on this server.
ACTIONS = {
    "website_republish": ["sh", f"{REPO}/deploy/landing-publish.sh"],
    "website_rollback": ["sh", f"{REPO}/deploy/landing-publish.sh", "rollback"],
    "backup_now": ["sh", f"{REPO}/deploy/db-backup.sh"],
}


def env(name):
    try:
        for line in open(f"{APP_DIR}/.env", encoding="utf-8"):
            if line.startswith(name + "="):
                return line.split("=", 1)[1].strip().strip('"')
    except OSError:
        pass
    return ""


def psql(sql):
    """Runs SQL (stdin) as the database owner; returns the unaligned output."""
    url = env("DATABASE_URL")
    if not url:
        raise RuntimeError("no DATABASE_URL")
    r = subprocess.run(
        ["docker", "run", "--rm", "-i", "-e", "DATABASE_URL", "postgres:17-alpine",
         "sh", "-c", 'exec psql "$DATABASE_URL" -X -q -At -v ON_ERROR_STOP=1'],
        input=sql, text=True, capture_output=True, timeout=120, env={**os.environ, "DATABASE_URL": url},
    )
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip()[-300:])
    return r.stdout


def lit(s):
    """A SQL string literal, dollar-quoted (the tag cannot occur in our own text)."""
    return "$ops$" + str(s).replace("$ops$", "") + "$ops$"


def run(cmd, timeout=600):
    try:
        r = subprocess.run(cmd, text=True, capture_output=True, timeout=timeout)
        return r.returncode, (r.stdout + r.stderr).strip()
    except Exception as e:  # noqa: BLE001 — reported, never raised
        return 1, str(e)


def http(url):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "LuyChlat-ops-agent"})
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, r.read(200_000).decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, ""
    except Exception:  # noqa: BLE001
        return 0, ""


def read(path, default=""):
    try:
        return open(path, encoding="utf-8").read().strip()
    except OSError:
        return default


def cert_days():
    out = {}
    for pem in glob.glob("/etc/letsencrypt/live/*/fullchain.pem"):
        code, text = run(["openssl", "x509", "-enddate", "-noout", "-in", pem], 15)
        m = re.search(r"notAfter=(.+)", text)
        if code == 0 and m:
            end = datetime.datetime.strptime(m.group(1).strip(), "%b %d %H:%M:%S %Y %Z")
            out[os.path.basename(os.path.dirname(pem))] = (end - datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)).days
    return out


def domains():
    """Expiry of our .com domains, from the registry once a day (cached)."""
    cache = f"{STATE}/domains.json"
    try:
        data = json.load(open(cache))
        if data.get("day") == datetime.date.today().isoformat():
            return data["domains"]
    except Exception:  # noqa: BLE001
        pass
    found = {}
    for d in ("luychlat.com", "ibmserp.com"):
        try:
            req = urllib.request.Request(f"https://rdap.verisign.com/com/v1/domain/{d}", headers={"Accept": "application/rdap+json"})
            ev = json.load(urllib.request.urlopen(req, timeout=20))["events"]
            exp = next(e["eventDate"][:10] for e in ev if e["eventAction"] == "expiration")
            found[d] = {"expires": exp, "days": (datetime.date.fromisoformat(exp) - datetime.date.today()).days}
        except Exception:  # noqa: BLE001
            pass
    json.dump({"day": datetime.date.today().isoformat(), "domains": found}, open(cache, "w"))
    return found


def capacity():
    """How full things are (founder, 28/10/2026 — «remind me when it is time to act or spend»): the server's RAM and CPU,
    the database, the stored files and the accounts. The app compares them with the limits (src/lib/capacity.ts)."""
    mem = {}
    for line in read("/proc/meminfo").splitlines():
        k, _, v = line.partition(":")
        if v.strip().endswith("kB"):
            mem[k] = int(v.split()[0])
    total, avail = mem.get("MemTotal", 0), mem.get("MemAvailable", 0)
    dockerd_mb = None
    _, pid = run(["pidof", "dockerd"], 15)
    if pid.strip().isdigit():
        m = re.search(r"VmRSS:\s*(\d+)", read(f"/proc/{pid.strip()}/status"))
        dockerd_mb = round(int(m.group(1)) / 1024) if m else None
    out = {
        "cpus": os.cpu_count() or 1,
        "load15": round(os.getloadavg()[2], 2),
        "ram_pct": round((total - avail) * 100 / total) if total else None,
        "ram_total_mb": round(total / 1024) if total else None,
        "dockerd_mb": dockerd_mb,
        # A build's CPU and RAM are not the users' (the deploy and the APK build mark themselves).
        "building": any(os.path.exists(f"{REPO}/deploy/run/{m}") for m in ("building-deploy", "building-apk")),
        # When the last build ended: the 15-minute load average still carries it for a while (28/10/2026 — a «CPU 99%»
        # reminder 7 minutes after a deploy). The deploy log and the APK build log are written to the end of every build.
        "build_ago_s": int(time.time() - max([os.path.getmtime(p) for p in ("/var/log/luysmart-deploy.log", "/var/log/luysmart-apk-build.log") if os.path.exists(p)] or [0])),
    }
    try:
        row = psql(
            "select pg_database_size(current_database()), (select count(*) from pg_stat_activity), "
            "current_setting('max_connections')::int, (select count(*) from auth.users), "
            "(select count(*) from auth.users where last_sign_in_at > now() - interval '30 days'), "
            "(select coalesce(sum((metadata->>'size')::bigint), 0) from storage.objects);"
        ).strip().split("|")
        out.update({
            "db_bytes": int(row[0]), "db_conns": int(row[1]), "db_max_conns": int(row[2]),
            "accounts": int(row[3]), "active_30d": int(row[4]), "storage_bytes": int(row[5]),
        })
    except Exception:  # noqa: BLE001 — the rest of the report still goes out
        pass
    return out


def report():
    site_code, site_body = http("https://luychlat.com/")
    app_code, app_body = http("https://app.luychlat.com/api/health")
    try:
        build = json.loads(app_body).get("build")
    except Exception:  # noqa: BLE001
        build = None
    _, f2b = run(["fail2ban-client", "status", "sshd"], 15)
    banned_now = re.search(r"Currently banned:\s*(\d+)", f2b)
    banned_total = re.search(r"Total banned:\s*(\d+)", f2b)
    _, sshd = run(["sshd", "-T"], 15)
    _, ufw = run(["ufw", "status"], 15)
    manifest = "/var/lib/luychlat-landing/manifest.sha256"
    last_ok = read("/var/lib/luysmart-backup/last-ok")
    deploys = [l for l in read("/var/log/luysmart-deploy.log").splitlines() if l.startswith("✓ Deployed ")]
    disk = shutil.disk_usage("/")
    return {
        "at": int(time.time()),
        "website": {
            "code": site_code,
            "ours": "App Luy Chlat" in site_body,
            "tampered": read("/tmp/luychlat-landing-watch.tamper", "0") == "1",
            "published_at": int(os.path.getmtime(manifest)) if os.path.exists(manifest) else None,
            "watched": os.path.exists(manifest),
        },
        "app": {"code": app_code, "build": build, "last_deploy": deploys[-1][len("✓ Deployed "):] if deploys else None},
        "certs": cert_days(),
        "domains": domains(),
        "backup": {"last_ok": int(last_ok) if last_ok.isdigit() else None, "last": read("/var/lib/luysmart-backup/last.txt") or None},
        "security": {
            "ssh_password_login": "passwordauthentication yes" in sshd.lower(),
            "firewall": "Status: active" in ufw,
            "banned_now": int(banned_now.group(1)) if banned_now else None,
            "banned_total": int(banned_total.group(1)) if banned_total else None,
            "auto_updates": run(["systemctl", "is-active", "unattended-upgrades"], 15)[1] == "active",
        },
        "disk": {"free_gb": round(disk.free / 1e9, 1), "used_pct": round(disk.used * 100 / disk.total)},
        "capacity": capacity(),
    }


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "install":
        cron = subprocess.run(["crontab", "-l"], text=True, capture_output=True).stdout
        if TAG not in cron:
            line = f"* * * * * python3 {REPO}/deploy/ops-agent.py >/dev/null 2>&1 # {TAG}\n"
            subprocess.run(["crontab", "-"], input=cron + line, text=True, check=True)
        print("✓ Control Center agent: every minute")
        return
    os.makedirs(STATE, exist_ok=True)

    # 1. The command a super admin asked for (claimed atomically; one at a time).
    did = False
    out = psql(
        "update public.ops_commands set status = 'running' where id = (select id from public.ops_commands "
        "where status = 'pending' order by requested_at limit 1 for update skip locked) returning id, action;"
    )
    # Only the returned row (id|action) — never a status line such as «UPDATE 0».
    claimed = next((l for l in out.splitlines() if re.fullmatch(r"[0-9a-f-]{36}\|[a-z_]+", l.strip())), "")
    if claimed:
        cid, action = claimed.strip().split("|", 1)
        cmd = ACTIONS.get(action)
        code, out = run(cmd, 900) if cmd else (1, "unknown action")
        status = "done" if code == 0 else "failed"
        psql(f"update public.ops_commands set status = {lit(status)}, result = {lit(out[-1500:])}, done_at = now() where id = {lit(cid)}::uuid;")
        did = True

    # 2. The report — every 5 minutes, and at once after a command.
    if did or time.localtime().tm_min % 5 == 0 or not os.path.exists(f"{STATE}/reported"):
        psql(
            "insert into public.ops_status (key, value, updated_at) values ('summary', "
            f"{lit(json.dumps(report()))}::jsonb, now()) on conflict (key) do update set value = excluded.value, updated_at = now();"
        )
        open(f"{STATE}/reported", "w").write(str(int(time.time())))


if __name__ == "__main__":
    main()
