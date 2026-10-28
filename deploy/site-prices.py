#!/usr/bin/env python3
"""The website's prices from the app's own plans (founder, 28/10/2026 — «a price changed in the app is the price on
luychlat.com»): run by deploy/landing-publish.sh on the copy about to go live. Every price is marked in the page
(data-plan / data-plan-khr, and the structured data for Google); a plan the database does not give keeps the page's own
price — never a guessed one. Never fails the publish.

    python3 deploy/site-prices.py <site dir>                       (reads public.plans with DATABASE_URL from .env)
    python3 deploy/site-prices.py <site dir> --plans-json <file>   (tests: [{"code","price_usd","price_khr"}, …])
"""
import glob
import json
import os
import re
import subprocess
import sys

APP_DIR = "/opt/luysmart"


def usd(v):
    return "$" + format(float(v), ",.2f")


def khr(v):
    return format(int(round(float(v))), ",") + " ៛"


def load_plans(argv):
    if "--plans-json" in argv:
        return json.load(open(argv[argv.index("--plans-json") + 1], encoding="utf-8"))
    url = ""
    for line in open(f"{APP_DIR}/.env", encoding="utf-8"):
        if line.startswith("DATABASE_URL="):
            url = line.split("=", 1)[1].strip().strip('"')
    if not url:
        raise RuntimeError("no DATABASE_URL")
    sql = "select coalesce(json_agg(json_build_object('code', code, 'price_usd', price_usd, 'price_khr', price_khr)), '[]') from public.plans where active;"
    r = subprocess.run(
        ["docker", "run", "--rm", "-i", "-e", "DATABASE_URL", "postgres:17-alpine", "sh", "-c", 'exec psql "$DATABASE_URL" -X -q -At'],
        input=sql, text=True, capture_output=True, timeout=120, env={**os.environ, "DATABASE_URL": url},
    )
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip()[-200:])
    return json.loads(r.stdout.strip() or "[]")


def prices(plans):
    """{"PRO": {"m": (usd, khr), "y": (usd, khr)}, …} — only tiers with both periods, positive prices."""
    by = {p["code"]: p for p in plans}
    out = {}
    for tier in ("PRO", "ULTRA"):
        m, y = by.get(f"{tier}_MONTHLY"), by.get(f"{tier}_YEARLY")
        if not m or not y or float(m["price_usd"]) <= 0 or float(y["price_usd"]) <= 0 or float(m["price_khr"]) <= 0 or float(y["price_khr"]) <= 0:
            continue
        out[tier] = {"m": (usd(m["price_usd"]), khr(m["price_khr"])), "y": (usd(y["price_usd"]), khr(y["price_khr"])), "m_raw": format(float(m["price_usd"]), ".2f")}
    return out


def apply(html, p):
    for tier, v in p.items():
        html = re.sub(
            r'<b data-plan="%s" data-m="[^"]*" data-y="[^"]*">[^<]*</b>' % tier,
            '<b data-plan="%s" data-m="%s" data-y="%s">%s</b>' % (tier, v["m"][0], v["y"][0], v["m"][0]), html)
        html = re.sub(
            r'<p class="riel" data-plan-khr="%s" data-m="[^"]*" data-y="[^"]*">[^<]*</p>' % tier,
            '<p class="riel" data-plan-khr="%s" data-m="%s" data-y="%s">%s</p>' % (tier, v["m"][1], v["y"][1], v["m"][1]), html)
        html = re.sub(r'("name": "%s \(monthly\)", "price": ")[0-9.]+(")' % tier, r'\g<1>%s\g<2>' % v["m_raw"], html)
    return html


def main(argv):
    sys.stdout.reconfigure(encoding="utf-8")  # the ✓ on any console
    site = argv[1]
    p = prices(load_plans(argv))
    pages = [f for f in glob.glob(os.path.join(site, "*.html")) + glob.glob(os.path.join(site, "*", "index.html"))]
    changed = 0
    for f in pages:
        s = open(f, encoding="utf-8").read()
        t = apply(s, p)
        if t != s:
            open(f, "w", encoding="utf-8").write(t)
            changed += 1
    summary = ", ".join(tier + " " + v["m"][0] for tier, v in p.items()) or "none"
    print(f"✓ Prices from the app ({summary}): {changed} page(s) updated")


if __name__ == "__main__":
    try:
        main(sys.argv)
    except Exception as e:  # noqa: BLE001 — the page keeps its own prices
        print(f"! Prices not refreshed ({e}) — the pages keep their own")
