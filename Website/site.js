// luychlat.com — three languages (km / en / zh), the Khmer text is the page itself; the choice is remembered on this
// device (?lang=en|zh also works for shared links). And the pricing period toggle.
(function () {
  var T = {
    en: {
      "skip": "Skip to content",
      "nav.business": "Business", "nav.family": "Family", "nav.pricing": "Pricing", "nav.faq": "FAQ", "nav.open": "Open app",
      "hero.eyebrow": "For Cambodian small shops and families",
      "hero.title": "Your shop's money and your home's money<br><span>clear, in one hand</span>",
      "hero.lead": "Record income, spending, debts and loan due dates in Khmer. Hear a voice announcement when a customer pays by KHQR — and the shop's money never mixes with the household's again.",
      "hero.android": "Download for Android", "hero.web": "Open on iPhone / computer",
      "hero.fine": "Free to start · USD and KHR · ខ្មែរ, English, 中文",
      "ph.total": "Total", "ph.hidden": "hidden when the app opens", "ph.cash": "Cash", "ph.bills": "Bills", "ph.debts": "Debts", "ph.scan": "Scan", "ph.goals": "Goals", "ph.reports": "Reports",
      "ph.sale": "Received 25,000 ៛", "ph.loan": "PPCBank instalment", "ph.loanDue": "Day 5 · $320",
      "mo.title": "Sound familiar?",
      "mo.1": "Shop money goes on household shopping — and at the end of the month nobody knows what the shop really made.",
      "mo.2": "A bank instalment date slips by: a late fee, and a mark on the CBC credit report.",
      "mo.3": "A customer shows a KHQR payment screen — but did the money really arrive?",
      "mo.answer": "App Luy Chlat was born from these everyday moments.",
      "biz.eyebrow": "For business", "biz.title": "Your shop, running itself",
      "biz.1t": "KHQR SoundBox", "biz.1": "Your phone announces «received 25,000 riel» in Khmer when a customer pays by KHQR — sales only.",
      "biz.2t": "Invoices and receipts", "biz.2": "Invoices with your shop's KHQR, as a clean image you send the customer at once.",
      "biz.3t": "Customer and supplier debts", "biz.3": "Who owes what, and when — money to receive and money to pay.",
      "biz.4t": "Bank loan schedules", "biz.4": "Photograph the bank's repayment schedule; the app records it and reminds you before each due date.",
      "biz.5t": "Bank slip scanning", "biz.5": "Photograph a transfer slip; the app reads the amount and the bank — it never guesses.",
      "biz.6t": "Tax estimate", "biz.6": "For small taxpayers — an estimate to confirm with an accountant or the General Department of Taxation.",
      "fam.eyebrow": "For you and your family", "fam.title": "Household money that no longer slips away",
      "fam.1t": "USD and KHR wallets", "fam.1": "Cash, bank accounts and cards in one place, with the National Bank's exchange rate.",
      "fam.2t": "Bills and reminders", "fam.2": "Water, electricity, internet, instalments and fixed deposits — reminded before the day.",
      "fam.3t": "Vehicle documents", "fam.3": "Inspection, road tax and insurance — reminders 30, 15 and 7 days before they expire.",
      "fam.4t": "Savings goals and budgets", "fam.4": "Set a goal, plan a monthly budget, and see your progress every day.",
      "fam.5t": "Shared family account", "fam.5": "Invite your spouse or children to record together (PRO) — personal settings stay private.",
      "fam.6t": "Khmer calendar and Islamic Mode", "fam.6": "Sil days and Khmer festivals. Islamic Mode (optional): prayer times, Zakat and halal finance.",
      "bot.eyebrow": "Telegram Bot", "bot.title": "Send one message, the expense is recorded",
      "bot.lead": "Type or speak in Khmer to @luychlat_bot, as you would to a friend. The bot never shows your balances unless you allow it, and never in a group.",
      "bot.open": "Open @luychlat_bot",
      "bot.m1": "Iced milk coffee 6000", "bot.r1": "✅ Expense recorded: 6,000 ៛ · Drinks", "bot.m2": "🎤 «Fuel, twenty thousand»", "bot.r2": "✅ Expense recorded: 20,000 ៛ · Fuel",
      "tr.title": "Your money is your private business",
      "tr.1": "Balances are hidden when the app opens — shown only when you tap.",
      "tr.2": "Lock the app with a 6-digit code, Face ID or fingerprint.",
      "tr.3": "Business and personal are always kept apart.",
      "tr.4": "Encrypted connections; only you, and the people you invite, see your data.",
      "pr.title": "Clear prices, paid by KHQR", "pr.monthly": "Monthly", "pr.yearly": "Yearly",
      "pr.f1": "2 wallets", "pr.f2": "Business workspace — 90-day trial", "pr.f3": "Telegram Bot and SoundBox", "pr.f4": "5 invoices a month, and reminders",
      "pr.start": "Start free", "pr.popular": "Most popular", "pr.perMonth": "/ month", "pr.perYear": "/ year",
      "pr.p1": "Unlimited wallets and family members", "pr.p2": "AI advisor — 100 questions a month", "pr.p3": "Excel export and the K-Score credit score", "pr.p4": "Unlimited invoices · 1 business workspace",
      "pr.choose": "Choose PRO", "pr.u1": "Everything in PRO", "pr.u2": "Unlimited business workspaces — branches or several shops", "pr.chooseU": "Choose ULTRA",
      "faq.title": "Frequently asked questions",
      "faq.q1": "Is App Luy Chlat free?", "faq.a1": "Yes. FREE is free forever. PRO and ULTRA add more for those who need it, paid by KHQR.",
      "faq.q2": "Does it work on iPhone?", "faq.a2": "Yes. Open app.luychlat.com in Safari, then Share › Add to Home Screen. On Android, install it from app.luychlat.com/download.",
      "faq.q3": "Is my data safe?", "faq.a3": "Every connection uses HTTPS, and the database's security rules let in only you and the members you invite. Your PIN and Face ID stay on your phone.",
      "faq.q4": "Does the SoundBox announce money going out?", "faq.a4": "No. The SoundBox announces sales (money in) only, and respects your phone's Silent and Vibrate modes.",
      "faq.q5": "How do I delete my account?", "faq.a5": "In the app: Settings › Delete account. Details on the", "faq.a5link": "account deletion page",
      "dl.title": "Start today", "dl.lead": "Scan the QR code to download, or tap a button below.", "dl.android": "Download for Android", "dl.web": "Open on iPhone / Web",
      "ft.privacy": "Privacy and terms", "ft.delete": "Delete account", "ft.download": "Download", "ft.community": "Telegram community", "ft.support": "Support"
    },
    zh: {
      "skip": "跳到内容",
      "nav.business": "商家", "nav.family": "家庭", "nav.pricing": "价格", "nav.faq": "常见问题", "nav.open": "打开应用",
      "hero.eyebrow": "为柬埔寨小商家和家庭而做",
      "hero.title": "店里的钱和家里的钱<br><span>一手掌握，清清楚楚</span>",
      "hero.lead": "用高棉语记录收入、支出、欠款和还款日。顾客用 KHQR 付款时语音播报 —— 店里的钱再也不会和家里的钱混在一起。",
      "hero.android": "下载 Android 版", "hero.web": "在 iPhone / 电脑上打开",
      "hero.fine": "免费开始 · 美元和瑞尔 · ខ្មែរ、English、中文",
      "ph.total": "总计", "ph.hidden": "打开应用时隐藏", "ph.cash": "现金", "ph.bills": "账单", "ph.debts": "欠款", "ph.scan": "扫描", "ph.goals": "目标", "ph.reports": "报表",
      "ph.sale": "收到 25,000 ៛", "ph.loan": "PPCBank 分期", "ph.loanDue": "5 号 · $320",
      "mo.title": "是不是很熟悉？",
      "mo.1": "店里的钱拿去买家用，到了月底不知道店里到底赚了多少。",
      "mo.2": "忘了银行分期还款日：被罚款，还影响 CBC 信用记录。",
      "mo.3": "顾客出示 KHQR 付款画面 —— 但钱真的到账了吗？",
      "mo.answer": "App Luy Chlat 正是从这些日常问题中诞生的。",
      "biz.eyebrow": "商家", "biz.title": "让您的店自己运转",
      "biz.1t": "KHQR 语音播报", "biz.1": "顾客用 KHQR 付款时，手机用高棉语播报「收到 25,000 瑞尔」—— 只播报收款。",
      "biz.2t": "发票和收据", "biz.2": "带有本店 KHQR 的发票，生成清晰图片，立即发给顾客。",
      "biz.3t": "客户和供应商欠款", "biz.3": "谁欠多少、何时到期 —— 应收与应付一目了然。",
      "biz.4t": "银行还款计划", "biz.4": "拍下银行的还款计划表，应用自动记录并在到期前提醒。",
      "biz.5t": "扫描转账凭证", "biz.5": "拍下转账凭证，应用读取金额和银行 —— 从不猜测。",
      "biz.6t": "税款估算", "biz.6": "适用于小型纳税人 —— 仅为估算，请与会计师或税务总局核实。",
      "fam.eyebrow": "个人和家庭", "fam.title": "家里的钱，不再不知不觉地花掉",
      "fam.1t": "美元和瑞尔钱包", "fam.1": "现金、银行账户和银行卡集中管理，使用国家银行汇率。",
      "fam.2t": "账单和提醒", "fam.2": "水费、电费、网费、分期和定期存款 —— 提前提醒。",
      "fam.3t": "车辆证件", "fam.3": "年检、路税和保险 —— 到期前 30、15、7 天提醒。",
      "fam.4t": "储蓄目标和预算", "fam.4": "设定目标、规划每月预算，每天看到进度。",
      "fam.5t": "家庭共享账户", "fam.5": "邀请配偶或子女一起记账（PRO）—— 个人设置保持私密。",
      "fam.6t": "高棉历和伊斯兰模式", "fam.6": "持戒日和高棉节日。伊斯兰模式（可选）：礼拜时间、天课和清真理财。",
      "bot.eyebrow": "Telegram 机器人", "bot.title": "发一条消息，支出就记好了",
      "bot.lead": "像给朋友发消息一样，用高棉语打字或说话给 @luychlat_bot。除非您允许，机器人不会显示您的余额，在群组中也绝不显示。",
      "bot.open": "打开 @luychlat_bot",
      "bot.m1": "冰奶咖啡 6000", "bot.r1": "✅ 已记录支出 6,000 ៛ · 饮品", "bot.m2": "🎤「加油，两万」", "bot.r2": "✅ 已记录支出 20,000 ៛ · 燃油",
      "tr.title": "您的钱，是您的隐私",
      "tr.1": "打开应用时余额隐藏 —— 点按后才显示。",
      "tr.2": "用 6 位密码、面容 ID 或指纹锁定应用。",
      "tr.3": "商家与个人账目始终分开。",
      "tr.4": "连接全程加密；只有您和您邀请的人能看到数据。",
      "pr.title": "价格透明，KHQR 付款", "pr.monthly": "按月", "pr.yearly": "按年",
      "pr.f1": "2 个钱包", "pr.f2": "商家工作区 —— 试用 90 天", "pr.f3": "Telegram 机器人和语音播报", "pr.f4": "每月 5 张发票和提醒",
      "pr.start": "免费开始", "pr.popular": "最受欢迎", "pr.perMonth": "/ 月", "pr.perYear": "/ 年",
      "pr.p1": "钱包和家庭成员不限", "pr.p2": "AI 顾问 —— 每月 100 个问题", "pr.p3": "导出 Excel 和 K-Score 信用评分", "pr.p4": "发票不限 · 1 个商家工作区",
      "pr.choose": "选择 PRO", "pr.u1": "包含 PRO 的全部功能", "pr.u2": "商家工作区不限 —— 分店或多家店", "pr.chooseU": "选择 ULTRA",
      "faq.title": "常见问题",
      "faq.q1": "App Luy Chlat 免费吗？", "faq.a1": "是的。FREE 永久免费。PRO 和 ULTRA 为需要更多功能的用户提供，KHQR 付款。",
      "faq.q2": "iPhone 可以用吗？", "faq.a2": "可以。在 Safari 中打开 app.luychlat.com，点按「分享」›「添加到主屏幕」。Android 请从 app.luychlat.com/download 安装。",
      "faq.q3": "我的数据安全吗？", "faq.a3": "所有连接均使用 HTTPS，数据库安全规则只允许您和您邀请的成员访问。密码和面容 ID 只保存在您的手机上。",
      "faq.q4": "语音播报会播报支出吗？", "faq.a4": "不会。只播报收款（进账），并遵从手机的静音和振动模式。",
      "faq.q5": "如何删除账户？", "faq.a5": "在应用中：设置 › 删除账户。详情请见", "faq.a5link": "删除账户页面",
      "dl.title": "今天就开始", "dl.lead": "扫描二维码下载，或点按下方按钮。", "dl.android": "下载 Android 版", "dl.web": "在 iPhone / 网页上打开",
      "ft.privacy": "隐私与条款", "ft.delete": "删除账户", "ft.download": "下载", "ft.community": "Telegram 社区", "ft.support": "客服"
    }
  };
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
    setPeriod(period);
  }

  var period = "m";
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
  apply(fromUrl || saved || "km");

  document.querySelectorAll("[data-lang]").forEach(function (b) {
    b.addEventListener("click", function () {
      var lang = b.getAttribute("data-lang");
      try { localStorage.setItem(KEY, lang); } catch (e) {}
      apply(lang);
    });
  });
  document.querySelectorAll("[data-period]").forEach(function (b) {
    b.addEventListener("click", function () { setPeriod(b.getAttribute("data-period")); });
  });
})();
