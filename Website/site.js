// luychlat.com — three languages (km / en / zh), the Khmer text is the page itself; the choice is remembered on this
// device (?lang=en|zh also works for shared links). And the pricing period toggle.
(function () {
  var T = window.SITE_T || { en: {}, zh: {} };
  if (window.EXTRA_T) for (var l in window.EXTRA_T) for (var k in window.EXTRA_T[l]) (T[l] = T[l] || {})[k] = window.EXTRA_T[l][k];

  var KEY = "luychlat-site-lang";
  var nodes = Array.prototype.slice.call(document.querySelectorAll("[data-i]"));
  var km = {};
  nodes.forEach(function (n) { km[n.getAttribute("data-i")] = n.innerHTML; });
  var titles = { km: document.title };

  function apply(lang) {
    if (!T[lang]) lang = "km";
    document.documentElement.lang = lang;
    nodes.forEach(function (n) {
      var k = n.getAttribute("data-i");
      n.innerHTML = lang === "km" ? km[k] : (T[lang][k] != null ? T[lang][k] : km[k]);
    });
    document.querySelectorAll("[data-lang]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-lang") === lang)); });
    if (window.PAGE_TITLES) document.title = window.PAGE_TITLES[lang] || titles.km;
    phoneDate(lang);
    setPeriod(period);
  }

  var period = "m";
  // The phone shows today's date in the viewer's own calendar, as the app does (founder, 28/10/2026): «ថ្ងៃពុធ 28 តុលា
  // 2026» / "Wednesday, 28 October 2026" / "2026年10月28日 星期三" — 0-9 digits, like the app.
  function phoneDate(lang) {
    var el = document.querySelector(".ph-date");
    if (!el) return;
    var d = new Date();
    var KM_DAYS = ["អាទិត្យ", "ចន្ទ", "អង្គារ", "ពុធ", "ព្រហស្បតិ៍", "សុក្រ", "សៅរ៍"];
    var KM_MONTHS = ["មករា", "កុម្ភៈ", "មីនា", "មេសា", "ឧសភា", "មិថុនា", "កក្កដា", "សីហា", "កញ្ញា", "តុលា", "វិច្ឆិកា", "ធ្នូ"];
    var EN_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    var EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    var ZH_DAYS = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
    el.textContent = lang === "en" ? EN_DAYS[d.getDay()] + ", " + d.getDate() + " " + EN_MONTHS[d.getMonth()] + " " + d.getFullYear()
      : lang === "zh" ? d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日 " + ZH_DAYS[d.getDay()]
      : "ថ្ងៃ" + KM_DAYS[d.getDay()] + " " + d.getDate() + " " + KM_MONTHS[d.getMonth()] + " " + d.getFullYear();
  }
  phoneDate(document.documentElement.lang || "km");

  function setPeriod(p) {
    period = p;
    document.querySelectorAll("[data-period]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-period") === p)); });
    document.querySelectorAll("[data-m][data-y]").forEach(function (n) { n.textContent = n.getAttribute(p === "y" ? "data-y" : "data-m"); });
    var lang = document.documentElement.lang;
    document.querySelectorAll("[data-m-i]").forEach(function (n) {
      var k = n.getAttribute(p === "y" ? "data-y-i" : "data-m-i");
      n.setAttribute("data-i", k);
      n.innerHTML = lang === "km" ? (k === "pr.perYear" ? "/ ឆ្នាំ" : "/ ខែ") : T[lang][k];
    });
  }
  km["pr.perYear"] = "/ ឆ្នាំ";

  var fromUrl = new URLSearchParams(location.search).get("lang");
  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) {}
  // The home page has its own URL per language (/, /en/, /zh/ — scripts/website-i18n.mjs): the text is already in the
  // page, so nothing is swapped; the Khmer home sends someone who chose English or Chinese to their page.
  var fixed = document.documentElement.getAttribute("data-fixed-lang");
  var hrefFor = function (lang) { var b = document.querySelector('[data-lang="' + lang + '"][data-href]'); return b && b.getAttribute("data-href"); };
  if (fixed) {
    document.querySelectorAll("[data-lang]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-lang") === fixed)); });
    setPeriod(period);
    var want = fromUrl || saved;
    if (fixed === "km" && want && want !== "km" && hrefFor(want)) location.replace(hrefFor(want));
  } else {
    apply(fromUrl || saved || "km");
  }

  document.querySelectorAll("[data-lang]").forEach(function (b) {
    b.addEventListener("click", function () {
      var lang = b.getAttribute("data-lang");
      try { localStorage.setItem(KEY, lang); } catch (e) {}
      if (b.getAttribute("data-href")) location.href = b.getAttribute("data-href");
      else apply(lang);
    });
  });
  document.querySelectorAll("[data-period]").forEach(function (b) {
    b.addEventListener("click", function () { setPeriod(b.getAttribute("data-period")); });
  });

  var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // The sales keep coming in on the phone (sample figures).
  var sales = [["25,000 ៛", "KHQR · ABA"], ["$12.50", "KHQR · ACLEDA"], ["8,000 ៛", "KHQR · Wing"], ["$4.75", "KHQR · Bakong"]];
  var n = 0;
  var toast = document.querySelector(".ph-toast");
  if (toast && !still) {
    setInterval(function () {
      n = (n + 1) % sales.length;
      toast.classList.remove("ping");
      void toast.offsetWidth;
      toast.classList.add("ping");
      var amt = toast.querySelector(".amt"), via = toast.querySelector(".via");
      if (amt) amt.textContent = sales[n][0];
      if (via) via.textContent = sales[n][1];
    }, 3200);
  }

  // The phone shows the real app: Business, then Personal.
  var shots = document.querySelectorAll(".shot"), tabs = document.querySelectorAll(".shot-tabs [data-for]"), k = 0;
  if (shots.length > 1 && !still) {
    setInterval(function () {
      shots[k].classList.remove("on");
      k = (k + 1) % shots.length;
      shots[k].classList.add("on");
      var label = shots[k].getAttribute("data-label");
      tabs.forEach(function (t) { t.classList.toggle("on", t.getAttribute("data-for") === label); });
      shots[k].closest(".screen").setAttribute("data-on", label); // the SoundBox sale shows on the Business screen only
    }, 5200);
  }

  // Cards rise into place as they scroll in.
  var items = document.querySelectorAll(".reveal");
  if (!still && "IntersectionObserver" in window) {
    document.documentElement.classList.add("motion");
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var el = e.target;
        el.classList.add("in");
        io.unobserve(el);
        // Settled: back to a plain card, so its own hover lift works again.
        setTimeout(function () { el.classList.remove("reveal", "in"); el.style.transitionDelay = ""; }, 900);
      });
    }, { rootMargin: "0px 0px -8% 0px" });
    items.forEach(function (el, i) { el.style.transitionDelay = (i % 3) * 70 + "ms"; io.observe(el); });
  }
})();
