// luychlat.com — the helpline chat (founder, 4–5/11/2026: «like Cellcard / AirAsia, in the app, on the website and on the
// sign-in page»). The answers come from the app's own approved knowledge through https://app.luychlat.com/api/helpline/site
// (never a guess, never anyone's money); what it can't answer goes to the team with the visitor's phone or Telegram name.
// Shown only when the «helpline» flag is PUBLIC (Admin › Super), or for the team's own test: luychlat.com/?helpline=test.
// Everything from the server is put on the page as text (textContent), never as HTML.
(function () {
  var API = "https://app.luychlat.com/api/helpline/site";
  var SUPPORT = "https://t.me/luychlat_support";
  var page = document.documentElement.lang || "km";
  var ui = page === "zh" ? "zh" : page === "en" ? "en" : "km";
  var lang = ui === "km" ? "km" : "en";

  var T = {
    title: { km: "ក្រុមការងារ អេប លុយឆ្លាត", en: "App Luy Chlat team", zh: "App Luy Chlat 团队" },
    statusOpen: { km: "ក្រុមការងារកំពុងបម្រើ · ចន្ទ–សុក្រ 08:00–17:00", en: "Our team is here · Mon–Fri 08:00–17:00", zh: "团队在线 · 周一至周五 08:00–17:00" },
    statusClosed: { km: "ឆ្លើយភ្លាមៗ · ក្រុមការងារត្រឡប់មកវិញ ចន្ទ–សុក្រ 08:00", en: "Quick answers now · our team is back Mon–Fri 08:00", zh: "即时解答 · 团队周一至周五 08:00 回来" },
    typing: { km: "កំពុងសរសេរ…", en: "Typing…", zh: "正在输入…" },
    open: { km: "សួរក្រុមការងារ", en: "Ask our team", zh: "咨询我们" },
    hello: {
      km: "ជម្រាបសួរ! ក្រុមការងារ អេប លុយឆ្លាត រីករាយបម្រើ។ សូមជ្រើសសំណួរខាងក្រោម ឬសរសេរចម្ងល់របស់លោកអ្នក។",
      en: "Hello! The App Luy Chlat team is glad to help. Pick a question below or type your own.",
      zh: "您好！App Luy Chlat 团队很乐意为您服务。请选择下面的问题，或输入您的问题（我们用英语回答）。",
    },
    placeholder: { km: "សរសេរចម្ងល់របស់លោកអ្នក…", en: "Type your question…", zh: "输入您的问题…" },
    human: { km: "និយាយជាមួយក្រុមការងារ", en: "Talk to our team", zh: "联系我们的团队" },
    contactAsk: {
      km: "សូមទុកលេខទូរសព្ទ ឬឈ្មោះ Telegram (@…) ដើម្បីឱ្យក្រុមការងារទាក់ទងលោកអ្នកវិញ។",
      en: "Leave your phone number or Telegram username (@…) so our team can get back to you.",
      zh: "请留下您的电话号码或 Telegram 用户名（@…），以便我们的团队联系您。",
    },
    contactPh: { km: "012 345 678 ឬ @username", en: "012 345 678 or @username", zh: "012 345 678 或 @username" },
    send: { km: "ផ្ញើ", en: "Send", zh: "发送" },
    sentOpen: { km: "បានផ្ញើទៅក្រុមការងារហើយ — យើងនឹងទាក់ទងលោកអ្នកវិញឆាប់ៗ។", en: "Sent to our team. We'll get back to you soon.", zh: "已发送给我们的团队，我们会尽快联系您。" },
    sentClosed: {
      km: "បានផ្ញើហើយ។ ក្រុមការងារឆ្លើយ ចន្ទ–សុក្រ ម៉ោង 08:00–17:00 — អាចត្រូវរង់ចាំបន្តិច។",
      en: "Sent. Our team replies Monday–Friday, 08:00–17:00, so it may take a little while.",
      zh: "已发送。我们的团队在周一至周五 08:00–17:00 回复，可能需要稍等。",
    },
    badContact: { km: "សូមបញ្ចូលលេខទូរសព្ទ ឬឈ្មោះ Telegram ឱ្យត្រឹមត្រូវ។", en: "Please enter a valid phone number or Telegram username.", zh: "请输入有效的电话号码或 Telegram 用户名。" },
    failed: { km: "ផ្ញើមិនបានទេ។ សូមសរសេរមកយើងតាម Telegram៖", en: "That didn't go through. Please write to us on Telegram:", zh: "发送失败。请通过 Telegram 联系我们：" },
    close: { km: "បិទ", en: "Close", zh: "关闭" },
  };
  var L = function (k) { return T[k][ui]; };

  var test = false;
  try {
    if (new URLSearchParams(location.search).get("helpline") === "test") sessionStorage.setItem("luychlat-helpline-test", "1");
    test = sessionStorage.getItem("luychlat-helpline-test") === "1";
  } catch {
    // storage off (private window): no test mode
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function icon(paths) {
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("class", "i");
    paths.forEach(function (d) { var p = document.createElementNS(ns, "path"); p.setAttribute("d", d); svg.appendChild(p); });
    return svg;
  }
  var ICON = {
    chat: ["M7.9 20A9 9 0 1 0 4 16.1L2 22z", "M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3", "M12 17h.01"],
    close: ["M18 6 6 18", "M6 6l12 12"],
    send: ["M14.5 21.7a.5.5 0 0 0 .9 0L22 3.5a.5.5 0 0 0-.6-.6L2.3 9.6a.5.5 0 0 0 0 .9l7.6 3.1a2 2 0 0 1 1.1 1.1z", "M21.9 2.1 11 13"],
    team: ["M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"],
  };
  // Only links into the app or this website (the server sends nothing else; checked again here).
  var safeHref = function (h) { return /^https:\/\/(app\.)?luychlat\.com(\/|$)/.test(h) ? h : null; };

  function call(method, body) {
    var url = method === "GET" ? API + "?lang=" + lang + (test ? "&test=1" : "") : API;
    return fetch(url, method === "GET" ? { method: "GET" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return { error: "invalid" }; }); })
      .catch(function () { return { error: "offline" }; });
  }

  var fab, panel, list, input, quick = [], lastQuestion = "", busy = false;

  function scroll() { list.scrollTop = list.scrollHeight; }
  // The team's face beside each reply: the App Luy Chlat logo.
  function avatar(cls) { var img = el("img", cls); img.src = "/logo.png"; img.alt = ""; img.width = 28; img.height = 28; return img; }
  function bubble(from, text) {
    var b = el("div", "hl-msg " + (from === "me" ? "hl-me" : "hl-bot"));
    if (text) b.appendChild(el("p", null, text));
    if (from === "me") list.appendChild(b);
    else { var row = el("div", "hl-row"); row.appendChild(avatar("hl-av")); row.appendChild(b); list.appendChild(row); }
    scroll();
    return b;
  }
  // A reply comes after a short «typing…», like a person answering (founder, 5/11/2026); longer ones a little longer.
  function typingThen(chars, work, show) {
    busy = true;
    var row = el("div", "hl-row hl-typing");
    row.appendChild(avatar("hl-av"));
    var dots = el("span", "hl-msg hl-bot hl-dots");
    dots.setAttribute("aria-label", L("typing"));
    for (var i = 0; i < 3; i++) dots.appendChild(el("span"));
    row.appendChild(dots);
    list.appendChild(row);
    scroll();
    var wait = new Promise(function (r) { setTimeout(r, Math.min(1400, 550 + chars)); });
    Promise.all([work, wait]).then(function (v) { row.remove(); busy = false; show(v[0]); });
  }
  function chips(entries) {
    if (!entries || !entries.length) return;
    var row = el("div", "hl-chips");
    entries.forEach(function (e) {
      var c = el("button", "hl-chip", e.q);
      c.type = "button";
      c.addEventListener("click", function () {
        if (busy) return;
        bubble("me", e.q);
        typingThen((e.a || []).join(" ").length / 2, null, function () { showEntry(e, quick.filter(function (q) { return q.id !== e.id; }).slice(0, 3)); });
      });
      row.appendChild(c);
    });
    list.appendChild(row);
    scroll();
  }
  function showEntry(e, more) {
    var b = bubble("bot");
    b.appendChild(el("p", "hl-q", e.q));
    (e.a || []).forEach(function (p) { b.appendChild(el("p", null, p)); });
    var href = e.link && safeHref(e.link.href);
    if (href) {
      var a = el("a", "hl-link", e.link.label);
      a.href = href;
      if (href.indexOf("https://app.") === 0) { a.target = "_blank"; a.rel = "noopener"; }
      b.appendChild(a);
    }
    chips(more);
  }
  function failed() {
    var b = bubble("bot", L("failed"));
    var a = el("a", "hl-link", "@luychlat_support");
    a.href = SUPPORT; a.target = "_blank"; a.rel = "noopener";
    b.appendChild(a);
  }
  function offerHuman(b) {
    var btn = el("button", "hl-human");
    btn.type = "button";
    btn.appendChild(icon(ICON.team));
    btn.appendChild(document.createTextNode(" " + L("human")));
    btn.addEventListener("click", function () { btn.disabled = true; askContact(); });
    b.appendChild(btn);
    scroll();
  }
  function askContact() {
    var b = bubble("bot", L("contactAsk"));
    var form = el("form", "hl-contact");
    var field = el("input");
    field.type = "text"; field.maxLength = 40; field.placeholder = L("contactPh"); field.autocomplete = "tel"; field.required = true;
    field.setAttribute("aria-label", L("contactPh"));
    var send = el("button", "hl-send-text", L("send"));
    send.type = "submit";
    form.appendChild(field); form.appendChild(send);
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      send.disabled = true;
      call("POST", { send: true, text: lastQuestion, contact: field.value, lang: lang }).then(function (r) {
        send.disabled = false;
        if (r && r.status === "sent") { form.remove(); bubble("bot", r.staffNow ? L("sentOpen") : L("sentClosed")); }
        else if (r && r.error === "contact") bubble("bot", L("badContact"));
        else { form.remove(); failed(); }
      });
    });
    b.appendChild(form);
    scroll();
    field.focus();
  }

  function ask(text) {
    var q = text.trim();
    if (!q || busy) return;
    lastQuestion = q;
    bubble("me", q);
    input.value = "";
    typingThen(300, call("POST", { text: q, lang: lang }), function (r) {
      if (!r || r.error) return failed();
      if (r.kind === "answer" && r.entry) return showEntry(r.entry, r.more);
      var b = bubble("bot", r.text);
      if (r.offerHuman) offerHuman(b);
      else chips(r.more);
    });
  }

  function build(data) {
    quick = data.quick || [];
    fab = el("button", "hl-fab");
    fab.type = "button";
    fab.setAttribute("aria-label", L("open"));
    fab.appendChild(icon(ICON.chat));
    panel = el("div", "hl-panel");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", L("title"));
    panel.hidden = true;
    var head = el("div", "hl-head");
    var face = el("span", "hl-face" + (data.staffNow ? " hl-on" : ""));
    face.appendChild(avatar());
    head.appendChild(face);
    var who = el("span", "hl-who");
    who.appendChild(el("strong", null, L("title")));
    who.appendChild(el("small", null, L(data.staffNow ? "statusOpen" : "statusClosed")));
    head.appendChild(who);
    var x = el("button", "hl-x");
    x.type = "button"; x.setAttribute("aria-label", L("close")); x.appendChild(icon(ICON.close));
    head.appendChild(x);
    list = el("div", "hl-list");
    list.setAttribute("aria-live", "polite");
    var form = el("form", "hl-form");
    input = el("input");
    input.type = "text"; input.maxLength = 300; input.placeholder = L("placeholder"); input.setAttribute("aria-label", L("placeholder"));
    var go = el("button", "hl-go");
    go.type = "submit"; go.setAttribute("aria-label", L("send")); go.appendChild(icon(ICON.send));
    form.appendChild(input); form.appendChild(go);
    panel.appendChild(head); panel.appendChild(list); panel.appendChild(form);
    document.body.appendChild(fab);
    document.body.appendChild(panel);

    bubble("bot", L("hello"));
    chips(quick);
    var toggle = function (on) { panel.hidden = !on; fab.hidden = on; if (on) { scroll(); input.focus(); } else fab.focus(); };
    fab.addEventListener("click", function () { toggle(true); });
    x.addEventListener("click", function () { toggle(false); });
    document.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && !panel.hidden) toggle(false); });
    form.addEventListener("submit", function (ev) { ev.preventDefault(); ask(input.value); });
  }

  call("GET").then(function (r) { if (r && r.open) build(r); });
})();
