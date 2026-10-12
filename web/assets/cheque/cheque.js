/* ODICheque — writes and prints Sayad cheques. Everything lives in this browser (localStorage).
   Layout units: millimetres for positions, points for type, so the screen preview and the paper match. */
"use strict";

/* ================= helpers ================= */
const $ = (s, r = document) => r.querySelector(s);
const MM = 96 / 25.4;                       // CSS px per mm
const FA = "۰۱۲۳۴۵۶۷۸۹";
const toFa = s => String(s).replace(/\d/g, d => FA[d]);
const toEn = s => String(s).replace(/[۰-۹]/g, d => FA.indexOf(d)).replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
const digitsOnly = s => toEn(s).replace(/\D/g, "");
const group = (s, sep) => String(s).replace(/\B(?=(\d{3})+(?!\d))/g, sep);
const pad2 = n => String(n).padStart(2, "0");
const uid = () => Math.random().toString(36).slice(2, 9);
const clone = o => JSON.parse(JSON.stringify(o));
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const faMoney = s => toFa(group(s || "0", "٬"));
const faSize = t => `${toFa(t.w)}×${toFa(t.h)}`.replace(/\./g, "٫");
const faSigned = v => toFa(group(v.toString(), "٬")).replace("-", "−");
const LEAF = "assets/cheque/leaf-sample.jpg";
/* Where this page runs. Inside ODiQ (default) people sign in to ODiQ and a manager grants access; the
   standalone ODICheque server sets window.CHEQUE_CONFIG = {standalone: true} and has its own accounts. */
const CFG = { standalone: false, product: "ODICheque", serverName: "ODiQ", loginUrl: "/", ...(window.CHEQUE_CONFIG || {}) };
function toast(msg, type = "") { if (window.OdiqUI) OdiqUI.toast(msg, { type, duration: 3000 }); }
const modal = { open: id => window.OdiqUI && OdiqUI.modal.open(id), close: id => window.OdiqUI && OdiqUI.modal.close(id) };

/* ================= Jalali calendar (jalaali algorithm) ================= */
const div = (a, b) => ~~(a / b), mod = (a, b) => a - ~~(a / b) * b;
const BRK = [-61,9,38,199,426,686,756,818,1111,1181,1210,1635,2060,2097,2192,2262,2324,2394,2456,3178];
function jalCal(jy) {
  let gy = jy + 621, leapJ = -14, jp = BRK[0], jm, jump = 0, n, i;
  for (i = 1; i < BRK.length; i++) { jm = BRK[i]; jump = jm - jp; if (jy < jm) break; leapJ += div(jump, 33) * 8 + div(mod(jump, 33), 4); jp = jm; }
  n = jy - jp;
  leapJ += div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4); if (leap === -1) leap = 4;
  return { leap, gy, march };
}
function g2d(gy, gm, gd) {
  const d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
  return d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
}
function d2g(jdn) {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1, gm = mod(div(i, 153), 12) + 1;
  return { gy: div(j, 1461) - 100100 + div(8 - gm, 6), gm, gd };
}
const j2d = (jy, jm, jd) => { const r = jalCal(jy); return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1; };
function d2j(jdn) {
  const gy = d2g(jdn).gy; let jy = gy - 621; const r = jalCal(jy); let k = jdn - g2d(gy, 3, r.march);
  if (k >= 0) { if (k <= 185) return { y: jy, m: 1 + div(k, 31), d: mod(k, 31) + 1 }; k -= 186; }
  else { jy -= 1; k += 179; if (r.leap === 1) k += 1; }
  return { y: jy, m: 7 + div(k, 30), d: mod(k, 30) + 1 };
}
const monthLen = (y, m) => m <= 6 ? 31 : m <= 11 ? 30 : (jalCal(y).leap === 0 ? 30 : 29);
const todayJ = () => { const t = new Date(); return d2j(g2d(t.getFullYear(), t.getMonth() + 1, t.getDate())); };
const jdnOf = d => j2d(d.y, d.m, d.d);
function addMonths(d, k) {
  let m = d.m - 1 + k; const y = d.y + Math.floor(m / 12); m = mod(m, 12) + 1; if (m <= 0) m += 12;
  return { y, m, d: Math.min(d.d, monthLen(y, m)) };
}
const MONTHS = ["فروردین","اردیبهشت","خرداد","تیر","مرداد","شهریور","مهر","آبان","آذر","دی","بهمن","اسفند"];
const WDAYS = ["دوشنبه","سه‌شنبه","چهارشنبه","پنجشنبه","جمعه","شنبه","یکشنبه"]; // index = jdn % 7
const weekday = d => WDAYS[mod(jdnOf(d), 7)];
const dateStr = d => `${d.y}/${pad2(d.m)}/${pad2(d.d)}`;
function parseJ(str) {                     // "1405/8/19" (any digits) -> {y,m,d} or null
  const m = toEn(str || "").trim().match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if (!m) return null;
  const d = { y: +m[1], m: +m[2], d: +m[3] };
  return d.m >= 1 && d.m <= 12 && d.d >= 1 && d.d <= monthLen(d.y, d.m) ? d : null;
}
function gIsoOf(d) {
  if (typeof d === "string") d = parseJ(d);
  if (!d) return "";
  const g = d2g(jdnOf(d)); return `${g.gy}-${pad2(g.gm)}-${pad2(g.gd)}`;
}
function isoToFa(iso) {                    // printed_at (UTC ISO) -> "۱۴۰۵/۰۷/۲۰ ۱۰:۴۵"
  if (!iso) return "";
  const t = new Date(iso); if (isNaN(t)) return "";
  return toFa(`${dateStr(d2j(g2d(t.getFullYear(), t.getMonth() + 1, t.getDate())))} ${pad2(t.getHours())}:${pad2(t.getMinutes())}`);
}

/* ================= Persian number words ================= */
const ONES = ["","یک","دو","سه","چهار","پنج","شش","هفت","هشت","نه"];
const TEENS = ["ده","یازده","دوازده","سیزده","چهارده","پانزده","شانزده","هفده","هجده","نوزده"];
const TENS = ["","","بیست","سی","چهل","پنجاه","شصت","هفتاد","هشتاد","نود"];
const HUNS = ["","یکصد","دویست","سیصد","چهارصد","پانصد","ششصد","هفتصد","هشتصد","نهصد"];
const SCALES = ["","هزار","میلیون","میلیارد","هزار میلیارد","میلیون میلیارد"];
function three(n) {
  const p = [], h = div(n, 100), r = n % 100;
  if (h) p.push(HUNS[h]);
  if (r >= 10 && r < 20) p.push(TEENS[r - 10]);
  else { if (div(r, 10)) p.push(TENS[div(r, 10)]); if (r % 10) p.push(ONES[r % 10]); }
  return p.join(" و ");
}
function toWords(s) {
  s = String(s).replace(/^0+/, ""); if (!s) return "صفر";
  const g = []; while (s.length) { g.unshift(+s.slice(-3)); s = s.slice(0, -3); }
  const out = []; g.forEach((v, i) => { if (!v) return; const sc = SCALES[g.length - 1 - i]; out.push(three(v) + (sc ? " " + sc : "")); });
  return out.join(" و ");
}
function ordinal(n) {
  const w = toWords(n);
  if (w.endsWith("سه")) return w.slice(0, -2) + "سوم";
  if (w.endsWith("ی")) return w + "‌ام";
  return w + "م";
}
const dateWords = d => `${ordinal(d.d)} ${MONTHS[d.m - 1]} ماه ${toWords(d.y)}`;

/* ================= national id ================= */
function checkId(s) {
  if (!s) return null;
  if (s.length === 10) {
    if (/^(\d)\1{9}$/.test(s)) return { ok: false, msg: "کد ملی معتبر نیست" };
    let sum = 0; for (let i = 0; i < 9; i++) sum += +s[i] * (10 - i);
    const r = sum % 11, c = +s[9];
    return (r < 2 ? c === r : c === 11 - r) ? { ok: true, msg: "کد ملی معتبر است (شخص حقیقی)" } : { ok: false, msg: "رقم کنترل کد ملی درست نیست؛ یک بار دیگر بخوانید" };
  }
  if (s.length === 11) {
    const coef = [29,27,23,19,17], dec = +s[9] + 2; let sum = 0;
    for (let i = 0; i < 10; i++) sum += (+s[i] + dec) * coef[i % 5];
    let r = sum % 11; if (r === 10) r = 0;
    return r === +s[10] ? { ok: true, msg: "شناسهٔ ملی معتبر است (شخص حقوقی)" } : { ok: false, msg: "رقم کنترل شناسهٔ ملی درست نیست" };
  }
  return { ok: false, msg: "کد ملی ۱۰ رقم و شناسهٔ ملی ۱۱ رقم است" };
}

/* ================= banks ================= */
/* Banks that issue Sayad cheques (after the 1399–1400 mergers of Ansar, Hekmat, Ghavamin, Kosar and
   Mehr-e Eghtesad into Sepah). Colours only tint the on-screen preview. */
const BANK_GROUPS = [
  ["بانک‌های دولتی و تخصصی", [
    ["melli","ملی ایران","#1d3f8f"],["sepah","سپه","#1a4f96"],["keshavarzi","کشاورزی","#2f7d3b"],["maskan","مسکن","#c25b12"],
    ["sanat","صنعت و معدن","#1b5e7a"],["tosee-saderat","توسعهٔ صادرات","#0f6a5b"],["tosee-taavon","توسعهٔ تعاون","#2d6a9f"],["post","پست بانک","#2c7a3f"]]],
  ["بانک‌های تجاری و خصوصی", [
    ["mellat","ملت","#c8102e"],["tejarat","تجارت","#1f3c88"],["saderat","صادرات ایران","#26357a"],["refah","رفاه کارگران","#1f5fa8"],
    ["parsian","پارسیان","#8a1538"],["pasargad","پاسارگاد","#b8860b"],["saman","سامان","#2a59a8"],["eghtesad","اقتصاد نوین","#6b2d8a"],
    ["sina","سینا","#1a6aa8"],["shahr","شهر","#c1272d"],["dey","دی","#0e7c86"],["karafarin","کارآفرین","#2e7d32"],
    ["sarmayeh","سرمایه","#9b1c31"],["ayandeh","آینده","#5b2c83"],["gardeshgari","گردشگری","#a32035"],["iranzamin","ایران‌زمین","#7a4e1d"],
    ["khavarmianeh","خاورمیانه","#00796b"],["iran-venezuela","ایران و ونزوئلا","#b71c1c"]]],
  ["قرض‌الحسنه و مؤسسه‌های اعتباری", [
    ["mehr","قرض‌الحسنهٔ مهر ایران","#0b7a3e"],["resalat","قرض‌الحسنهٔ رسالت","#1565c0"],
    ["melal","مؤسسهٔ اعتباری ملل","#1e4f8a"],["noor","مؤسسهٔ اعتباری نور","#24705a"]]],
];
const BANKS = {}; for (const [, list] of BANK_GROUPS) for (const [code, name, color] of list) BANKS[code] = { code, name, color };
const bankName = c => !BANKS[c] ? "—" : ["melal","noor","mehr","resalat"].includes(c) ? BANKS[c].name : "بانک " + BANKS[c].name;
const bankOptions = (sel, withNone) => (withNone ? `<option value="">— بدون بانک —</option>` : "") + BANK_GROUPS.map(([g, list]) =>
  `<optgroup label="${g}">` + list.map(([c]) => `<option value="${c}" ${c === sel ? "selected" : ""}>${esc(bankName(c))}</option>`).join("") + "</optgroup>").join("");

/* ================= fields + standard layout ================= */
const FIELDS = {
  dateNum:     { label: "تاریخ (خانه‌ها)" },
  dateWords:   { label: "تاریخ به حروف" },
  amountWords: { label: "مبلغ به حروف", fill: true },
  payee:       { label: "در وجه", fill: true },
  payeeId:     { label: "کد / شناسهٔ ملی" },
  amountNum:   { label: "مبلغ به عدد" },
  reason:      { label: "بابت", fill: true },
  sayad:       { label: "شناسهٔ صیاد" },
  noEndorse:   { label: "عدم پشت‌نویسی" },
  note:        { label: "توضیحات" },
  hawale:      { label: "خط روی حواله‌کرد", strike: 1 },
  stubDate:    { label: "ته‌چک: تاریخ" },
  stubPayee:   { label: "ته‌چک: گیرنده" },
  stubReason:  { label: "ته‌چک: بابت" },
  stubPrev:    { label: "ته‌چک: مانده قبلی" },
  stubDeposit: { label: "ته‌چک: واریزی" },
  stubSum:     { label: "ته‌چک: جمع" },
  stubAmount:  { label: "ته‌چک: مبلغ چک" },
  stubBal:     { label: "ته‌چک: مانده" },
};
/* Uniform Sayad leaf, measured on the 700×270 px sample image (stub on the left).
   Line fields: x-left, x-right, y of the printed line. Box fields: x-left, x-right, y-top, y-bottom, box count. */
const ON_DEMAND = new Set(["noEndorse", "note", "hawale"]);     // empty unless the cheque sets them
const CORE = new Set(["dateNum", "dateWords", "amountWords", "amountNum", "payee"]);
const FONTS = [["Vazirmatn", "وزیرمتن"], ["Noto Naskh Arabic", "نسخ"], ["Noto Nastaliq Urdu", "نستعلیق"], ["IranNastaliq", "ایران نستعلیق"],
  ["Lalezar", "لاله‌زار"], ["B Nazanin", "ب نازنین"], ["B Mitra", "ب میترا"], ["B Titr", "ب تیتر"], ["IRANSans", "ایران‌سنس"], ["Tahoma", "تاهوما"]];
const STD_W = 207.5, STD_H = 80, IMG_W = 700, IMG_H = 270, LAYOUT_VER = 3;
function defaultFields(W = STD_W, H = STD_H) {
  const sx = W / IMG_W, sy = H / IMG_H;
  const L = (xl, xr, line, size, o = {}) => ({ r: +((IMG_W - xr) * sx).toFixed(1), t: +(line * sy - size * 1.6 * .3528 * .78).toFixed(1),
    w: +((xr - xl) * sx).toFixed(1), size, b: 0, on: 1, al: "right", ...o });
  const B = (xl, xr, yt, yb, n, size, o = {}) => ({ r: +((IMG_W - xr) * sx).toFixed(1), t: +(yt * sy).toFixed(1), w: +((xr - xl) * sx).toFixed(1),
    h: +((yb - yt) * sy).toFixed(1), bx: n, size, b: 1, on: 1, al: "center", ...o });
  const stub = (row, o) => L(60, 150, [80, 98, 117, 135, 153, 172, 190, 208][row], 8.5, o);
  return {
    dateNum:     B(516, 622, 35, 52, 8, 12),
    dateWords:   L(470, 598, 68, 9.5),
    amountWords: L(218, 568, 104, 11, { b: 1 }),
    payee:       L(474, 650, 134, 11),
    payeeId:     L(300, 398, 134, 10.5, { al: "center" }),
    amountNum:   B(200, 393, 178, 200, 15, 12),
    reason:      L(474, 650, 152, 10, { on: 0 }),
    sayad:       L(250, 420, 255, 8, { on: 0 }),
    noEndorse:   L(420, 600, 168, 9, { b: 1, al: "center" }),
    note:        L(410, 640, 214, 8.5),
    hawale:      L(198, 292, 134, 10),
    stubDate:    stub(0, { al: "center" }),
    stubPayee:   stub(1),
    stubReason:  stub(2),
    stubPrev:    stub(3, { al: "center" }),
    stubDeposit: stub(4, { al: "center" }),
    stubSum:     stub(5, { al: "center" }),
    stubAmount:  stub(6, { al: "center", b: 1 }),
    stubBal:     stub(7, { al: "center" }),
  };
}
function baseTpl(o) {
  return { id: uid(), ver: LAYOUT_VER, w: STD_W, h: STD_H, font: "Vazirmatn", digits: 1, fill: 1, hash: 1, rial: 1,
    paper: "cheque", a4r: 1, a4t: 15, offX: 0, offY: 0, imgOp: 100, fields: defaultFields(), extra: {}, tuned: 0, stub: 0, ...o };
}
// bank templates: one per bank, standard layout. custom templates: built by the user from their own leaf.
const bankTpl = bank => baseTpl({ kind: "bank", bank, name: bankName(bank), sample: 1 });

/* ================= state ================= */
const KEY = "chequenegar.v1";
function blankCheque(date, bank, tpl) {
  return { id: uid(), bank: bank || S.lastBank || "melli", tpl: tpl || "", date: date || todayJ(), amount: "", payee: "", payeeId: "", reason: "", sayad: "",
    prev: "", deposit: "", note: "", noEndorse: 0, noHawale: 0, book: "", serial: "" };
}
const DEFAULT_SETTINGS = {
  remindDays: 3, autoPayee: 1,
  receipt: { title: "رسید دریافت چک", org: "", paper: "A5", signA: "امضای پرداخت‌کننده", signB: "نام، امضا و اثر انگشت گیرنده",
    body: "اینجانب {payee} به کد ملی {payeeId}، یک فقره چک {bank} به شمارهٔ صیاد {sayad} به مبلغ {amount} ریال ({amountWords} ریال) با سررسید {dueDate} بابت {reason} از {org} دریافت کردم." },
};
function sampleCheque() {
  return { id: uid(), bank: "melli", tpl: "", date: addMonths(todayJ(), 1), amount: "125000000", payee: "فروشگاه لوازم اداری نمونه",
    payeeId: "", reason: "خرید تجهیزات اداری", sayad: "", prev: "", deposit: "", example: 1 };
}
const IMG = "chequenegar.img.";   // + template id -> leaf photo (data URL)
let S;
let MODE = "local", ME = null, BOOT_NOTE = "";       // "server" when the API answers and this person has access
function loadLocal() {
  S = null;
  try { const s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s && s.queue && s.queue.length) S = s; } catch (e) {}
  if (!S) { const c = sampleCheque(); S = { templates: [], queue: [c], cur: c.id, unit: "toman", issued: [], sel: "amountWords", lastBank: "melli", view: "issue" }; }
  normalize();
}
function normalize() {
  S.payees = S.payees || [];
  S.books = S.books || [];
  S.received = S.received || [];
  S.settings = { ...clone(DEFAULT_SETTINGS), ...(S.settings || {}) };
  S.settings.receipt = { ...DEFAULT_SETTINGS.receipt, ...(S.settings.receipt || {}) };
  S.settings.holidays = { add: [], off: [], ...(S.settings.holidays || {}) };
  if (!S.issued) S.issued = [];
  if (S.history) {            // older local saves kept a plain printed list
    for (const x of S.history) S.issued.unshift({ id: "L" + uid(), bank: x.bank || "", template: "", due_date: x.date, due_on: gIsoOf(x.date), amount: x.amount,
      payee: x.payee || "", payee_id: x.payeeId || "", reason: x.reason || "", sayad: x.sayad || "", note: "", status: "issued", printed_at: "", printed_label: x.at || "" });
    delete S.history;
  }
  // older saves: free-form v1 templates, v2 bank templates without kind, scan photos under another key
  if (S.tplId) { S.templates = S.templates.filter(t => t.bank); delete S.tplId; }
  delete S.base;
  for (const t of S.templates) {
    if (!t.kind) { t.kind = "bank"; t.sample = 1; }
    if (!t.extra) t.extra = {};
    if (t.stub == null) t.stub = 0;            // the stub is usually left blank, so it is off unless a template turns it on
    if (t.imgOp == null) t.imgOp = t.scanOp || 100;
    if (t.ver !== LAYOUT_VER && (t.ver || 0) < 2 && !t.tuned) { t.w = STD_W; t.h = STD_H; t.fields = defaultFields(); }
    t.ver = LAYOUT_VER;
    for (const k in FIELDS) if (!t.fields[k]) t.fields[k] = { ...defaultFields(t.w, t.h)[k], on: ON_DEMAND.has(k) ? 1 : 0 };
    try { const old = localStorage.getItem("chequenegar.scan." + t.id); if (old) { localStorage.setItem(IMG + t.id, old); localStorage.removeItem("chequenegar.scan." + t.id); } } catch (e) {}
  }
  for (const c of S.queue) { if (!c.bank) c.bank = "melli"; if (c.tpl == null) c.tpl = ""; if (c.note == null) c.note = ""; }
  if (!S.queue.find(c => c.id === S.cur)) S.cur = S.queue[0].id;
  if (!S.view || S.view === "history") S.view = "issue";
}
loadLocal();
let saveT;
function save() { clearTimeout(saveT); saveT = setTimeout(MODE === "server" ? sync : saveLocal, MODE === "server" ? 600 : 250); }
function saveLocal() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast("حافظهٔ مرورگر پر است؛ تصویرهای بزرگ را بردارید", "error"); } }

/* ---- server mode: every shared/private document is PUT when its JSON changes ---- */
async function api(method, url, body) {
  const r = await fetch(url, { method, credentials: "same-origin", headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body) });
  let data = null; try { data = await r.json(); } catch (e) {}
  if (!r.ok) throw new Error((data && data.detail && data.detail.error && data.detail.error.message) || `خطای سرور (${r.status})`);
  return data;
}
const PREF_KEYS = ["cur", "unit", "sel", "lastBank", "view", "edit", "welcomed"];
function docsNow() {
  const out = new Map();
  for (const t of S.templates) if (t.kind === "custom" || t.tuned) out.set("template/" + t.id, t);
  for (const p of S.payees) out.set("payee/" + p.id, p);
  for (const b of S.books) out.set("book/" + b.id, b);
  out.set("settings/main", S.settings);
  out.set("queue/queue", S.queue);
  const prefs = {}; for (const k of PREF_KEYS) prefs[k] = S[k]; out.set("prefs/prefs", prefs);
  return out;
}
const synced = new Map();
let syncing = false, syncAgain = false;
async function sync() {
  if (syncing) { syncAgain = true; return; }
  syncing = true; setSync("busy");
  try {
    const now = docsNow();
    for (const [key, data] of now) {
      const json = JSON.stringify(data); if (synced.get(key) === json) continue;
      const [kind, id] = key.split("/");
      await api("PUT", `/api/cheque/docs/${kind}/${encodeURIComponent(id)}`, data);
      synced.set(key, json);
    }
    for (const key of [...synced.keys()]) if (!now.has(key)) {
      const [kind, id] = key.split("/");
      await api("DELETE", `/api/cheque/docs/${kind}/${encodeURIComponent(id)}`); synced.delete(key);
    }
    setSync("ok");
  } catch (e) { setSync("err", e.message); }
  syncing = false;
  if (syncAgain) { syncAgain = false; sync(); }
}
function setSync(state, msg) {
  const pill = $("#syncPill"); pill.className = "status-pill sync " + (MODE === "server" ? state : "");
  $("#syncTxt").textContent = MODE !== "server" ? "این مرورگر" : state === "busy" ? "در حال ذخیره…" : state === "err" ? "ذخیره نشد" : "ذخیره روی سرور";
  pill.title = MODE !== "server" ? "داده‌ها فقط در همین مرورگر است" : state === "err" ? msg || "" : `${ME.name}، ${ME.role === "manager" ? "مدیر" : "کاربر"} ${CFG.product}؛ داده‌ها روی سرور ${CFG.serverName} ذخیره می‌شود`;
  if (state === "err") toast("ذخیره روی سرور نشد: " + (msg || ""), "error");
}
async function bootServer() {
  let r;
  try { r = await fetch("/api/cheque/bootstrap", { credentials: "same-origin", headers: { Accept: "application/json" } }); } catch (e) { return false; }
  if (r.status === 401) {
    BOOT_NOTE = "login";
    if (CFG.standalone) { location.href = CFG.loginUrl + "?next=" + encodeURIComponent(location.pathname + location.hash); await new Promise(() => {}); }
    return false;
  }
  if (r.status === 403) { BOOT_NOTE = "forbidden"; return false; }
  if (!r.ok || !(r.headers.get("content-type") || "").includes("json")) return false;
  const data = await r.json();
  MODE = "server"; ME = data.me;
  const prefs = data.prefs || {};
  S = { templates: data.templates || [], payees: data.payees || [], settings: data.settings || {}, issued: data.issued || [],
    books: data.books || [], received: data.received || [],
    queue: Array.isArray(data.queue) && data.queue.length ? data.queue : [sampleCheque()], sel: "amountWords", unit: "toman", lastBank: "melli", view: "issue" };
  for (const k of PREF_KEYS) if (prefs[k] !== undefined) S[k] = prefs[k];
  normalize();
  for (const [key, val] of docsNow()) synced.set(key, JSON.stringify(val));
  // what the server already had is in sync; documents normalize() changed go up on the next save
  for (const t of data.templates || []) synced.set("template/" + t.id, JSON.stringify(t));
  return true;
}

function tplForBank(bank) {
  let t = S.templates.find(x => x.kind === "bank" && x.bank === bank);
  if (!t) { t = bankTpl(bank); S.templates.push(t); }
  return t;
}
const customTpls = () => S.templates.filter(t => t.kind === "custom");
function tplOf(ch) { return (ch.tpl && S.templates.find(t => t.id === ch.tpl && t.kind === "custom")) || tplForBank(ch.bank); }
const cur = () => S.queue.find(c => c.id === S.cur) || S.queue[0];
const tpl = () => tplOf(cur());
const tplLabel = t => t.kind === "custom" ? t.name : "استاندارد صیاد";

/* images: a user photo of the leaf, else the bundled sample for standard layouts */
function getImg(t) { if (MODE === "server") return t.img || null; try { return localStorage.getItem(IMG + t.id); } catch (e) { return null; } }
function setImg(t, data) {
  if (MODE === "server") { if (data) t.img = data; else delete t.img; save(); return true; }
  try { if (data) localStorage.setItem(IMG + t.id, data); else localStorage.removeItem(IMG + t.id); return true; } catch (e) { return false; }
}
const bgOf = t => getImg(t) || (t.sample ? LEAF : "");
function readImage(file, cb) {               // downscale so it fits in browser storage
  const rd = new FileReader();
  rd.onload = () => { const img = new Image(); img.onload = () => {
    const k = Math.min(1, 1600 / img.width), c = document.createElement("canvas");
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    cb(c.toDataURL("image/jpeg", .85), img.width / img.height);
  }; img.onerror = () => toast("این فایل تصویر نیست", "error"); img.src = rd.result; };
  rd.readAsDataURL(file);
}
const isStub = k => k.startsWith("stub");
function fieldKeys(t) { return Object.keys(FIELDS).filter(k => t.stub || !isStub(k)).concat(Object.keys(t.extra || {})); }
const metaOf = (t, k) => FIELDS[k] || { label: (t.extra[k] || {}).label || "متن ثابت", extra: 1 };

/* ================= text for each field ================= */
function stubMoney(ch) {      // previous balance + deposit = total; total − this cheque = remaining
  const P = ch.prev ? BigInt(ch.prev) : null, D = ch.deposit ? BigInt(ch.deposit) : null, A = ch.amount ? BigInt(ch.amount) : null;
  const sum = P != null || D != null ? (P || 0n) + (D || 0n) : null;
  return { stubPrev: P, stubDeposit: D, stubSum: sum, stubAmount: A, stubBal: sum != null && A != null ? sum - A : null };
}
// the leaf's money unit: cheques are written in rial; a template for slips or receipts may use toman
const inUnit = (t, rial) => !rial ? rial : t.money === "toman" ? (rial.length > 1 ? rial.slice(0, -1) : "0") : rial;
const unitWord = t => t.money === "toman" ? " تومان" : " ریال";
function fieldText(k, ch, t) {
  const dg = s => t.digits ? toFa(s) : s, sep = t.digits ? "٬" : ",";
  switch (k) {
    case "dateWords": return { tx: dateWords(ch.date) };
    case "dateNum": case "stubDate": return { tx: dg(dateStr(ch.date)), ltr: 1 };
    case "amountWords": return { tx: ch.amount ? toWords(inUnit(t, ch.amount)) + (t.rial ? unitWord(t) : "") : "" };
    case "payee": case "stubPayee": return { tx: ch.payee || "" };
    case "payeeId": return { tx: dg(ch.payeeId || ""), ltr: 1 };
    case "reason": case "stubReason": return { tx: ch.reason || "" };
    case "noEndorse": return { tx: ch.noEndorse ? (t.noEndorseText || "غیرقابل پشت‌نویسی") : "" };
    case "note": return { tx: ch.note || "" };
    case "hawale": return { tx: ch.noHawale ? "—" : "" };
    case "amountNum": { if (!ch.amount) return { tx: "", ltr: 1 }; const v = dg(group(inUnit(t, ch.amount), sep)); return { tx: t.hash ? `#${v}#` : v, ltr: 1 }; }
    case "sayad": return { tx: dg((ch.sayad || "").replace(/(\d{4})(?=\d)/g, "$1 ")), ltr: 1 };
    case "stubPrev": case "stubDeposit": case "stubSum": case "stubAmount": case "stubBal": {
      let v = stubMoney(ch)[k]; if (v != null && t.money === "toman") v = v / 10n;
      return { tx: v == null ? "" : (t.digits ? faSigned(v) : group(v.toString(), ",")), ltr: 1 };
    }
  }
  if (t.extra && t.extra[k]) return { tx: t.extra[k].text || "" };
  return { tx: "" };
}
function boxChars(k, ch, t, n) {      // characters for box fields, left to right; null = empty box
  let s;
  if (k === "dateNum" || k === "stubDate") s = `${ch.date.y}${pad2(ch.date.m)}${pad2(ch.date.d)}`;
  else if (k === "amountNum" || k === "stubAmount") s = inUnit(t, ch.amount || "");
  else s = digitsOnly(fieldText(k, ch, t).tx);
  if (!s || s.length > n) return null;
  const cells = Array(n - s.length).fill(null).concat([...(t.digits ? toFa(s) : s)]);
  if (t.hash && (k === "amountNum" || k === "stubAmount") && s.length < n) cells[n - s.length - 1] = "#";
  return cells;
}
const fontStack = f => `"${f}", "Vazirmatn", Tahoma, sans-serif`;
const mctx = document.createElement("canvas").getContext("2d");
function fitSize(text, f, t, fill) {
  let s = f.size; const avail = (f.w - (fill ? 7 : 0.8)) * MM;
  while (s > 6) { mctx.font = `${f.b ? 700 : 400} ${s}pt ${fontStack(f.font || t.font)}`; if (mctx.measureText(text).width <= avail) break; s -= 0.25; }
  return s;
}

/* ================= build a cheque element ================= */
function buildCheque(ch, t, mode) {        // mode: "ed" | "print" | "test"
  const el = document.createElement("div");
  el.className = "chq" + (mode === "ed" ? " ed" + (S.edit ? "" : " locked") : "") + (mode === "test" ? " test" : "");
  el.style.cssText = `width:${t.w}mm;height:${t.h}mm;font-family:${fontStack(t.font)}`;
  const ox = mode === "ed" ? 0 : +t.offX || 0, oy = mode === "ed" ? 0 : +t.offY || 0;
  if (mode !== "print") {
    const bg = bgOf(t), p = document.createElement("div");
    p.className = "paper" + (bg ? "" : " blank");
    if (bg) { p.style.backgroundImage = `url("${bg}")`; p.style.opacity = mode === "test" ? .3 : (t.imgOp || 100) / 100; }
    el.appendChild(p);
    const b = BANKS[ch.bank];
    if (mode === "ed" && b && bg === LEAF) {     // bank name over the «BANK NAME» placeholder of the sample leaf
      const bn = document.createElement("div"); bn.className = "mk-bank";
      bn.style.cssText = `color:${b.color};right:${(IMG_W - 462) * t.w / IMG_W}mm;top:${47 * t.h / IMG_H}mm;width:${64 * t.w / IMG_W}mm`;
      bn.textContent = bankName(b.code); el.appendChild(bn);
    }
  }
  if (mode === "test") {
    const tick = document.createElement("div"); tick.className = "mk"; tick.style.cssText = "left:2mm;top:1mm;color:#777;font:6pt Tahoma";
    tick.textContent = `آزمایشی — ${t.name} — ${t.w}×${t.h}mm`; el.appendChild(tick);
  }
  for (const k of fieldKeys(t)) {
    const f = t.fields[k]; if (!f || !f.on) continue;
    const meta = metaOf(t, k), v = fieldText(k, ch, t);
    const cells = f.bx ? boxChars(k, ch, t, f.bx) : null;
    const has = f.bx ? !!cells : !!v.tx, perf = f.style === "perf" && has, fill = meta.fill && t.fill && has && !perf;
    if (!has && mode === "ed" && !S.edit && !CORE.has(k)) continue;      // optional empties stay out of the way while filling in
    const d = document.createElement("div");
    d.className = `fld a-${f.al}` + (has ? "" : " empty") + (f.style === "neg" && has ? " neg" : "") + (mode === "ed" && S.edit && S.sel === k ? " sel" : "");
    d.dataset.k = k;
    const dir = f.dir && f.dir !== "auto" ? f.dir : v.ltr ? "ltr" : "rtl";
    const sz = has && !f.bx ? fitSize(v.tx, f, t, fill) : f.size;
    let body;
    if (meta.strike) body = has ? `<span class="strike"></span>` : `<span class="tx">${mode === "ed" ? esc(meta.label) : ""}</span>`;
    else if (f.bx && cells) body = `<span class="cells" dir="ltr">${cells.map(c => `<span>${c == null ? "" : perf ? perfSvg(c, f, t, f.size, "ltr") : esc(c)}</span>`).join("")}</span>`;
    else if (perf) body = perfSvg(v.tx, f, t, sz, dir);
    else {
      const shown = has ? v.tx : (mode === "ed" ? meta.label : "");
      body = `<span class="tx" dir="${dir}">${esc(shown)}</span>` + (fill ? `<span class="fill">${"*".repeat(160)}</span>` : "");
    }
    d.style.cssText = `right:${f.r + ox}mm;top:${f.t + oy}mm;width:${f.w}mm;height:${f.bx ? f.h + "mm" : f.size * 1.6 + "pt"};font-size:${sz}pt;font-weight:${f.b ? 700 : 400}`
      + (f.font ? `;font-family:${fontStack(f.font)}` : "");
    d.innerHTML = body + (mode === "ed" ? `<span class="tag">${esc(meta.label)}</span><span class="hdl" data-h="1"></span>` : "");
    el.appendChild(d);
  }
  return el;
}

// perforated look: the glyph outlines drawn as a row of dots, like a cheque-writer's punch
function perfSvg(text, f, t, sizePt, dir) {
  const px = sizePt * 96 / 72, fam = fontStack(f.font || t.font).replace(/"/g, "'");
  return `<svg class="perf" aria-hidden="true"><text x="50%" y="52%" dominant-baseline="central" text-anchor="middle" direction="${dir}" font-family="${fam}"
    font-size="${px.toFixed(2)}" font-weight="${f.b ? 700 : 400}" fill="none" stroke="#0d1522" stroke-width="${(px * .07).toFixed(2)}"
    stroke-dasharray="0.01 ${(px * .12).toFixed(2)}" stroke-linecap="round">${esc(text)}</text></svg>`;
}

/* ================= editor stage ================= */
const stage = $("#stage"), inner = $("#stageInner");
let scale = 1;
function renderStage() {
  const t = tpl();
  $("#editMode").checked = !!S.edit; $("#layoutCard").hidden = !S.edit;
  $("#stageNote").innerHTML = S.edit
    ? "هر نوشته را بکشید تا روی خط برگه بنشیند. کلیدهای جهت‌نما نیم میلی‌متر جابه‌جا می‌کنند و با Shift دو میلی‌متر. دایرهٔ نارنجی پهنا را عوض می‌کند. تغییرها برای همین قالب ذخیره می‌شوند."
    : "روی هر نوشتهٔ برگه بزنید تا خانهٔ مربوطش در فرم باز شود. اگر نوشته‌ها روی خط‌ها نمی‌نشینند، «ویرایش چیدمان» را روشن کنید.";
  inner.innerHTML = ""; inner.appendChild(buildCheque(cur(), t, "ed"));
  if (!stage.clientWidth) return;
  scale = Math.min(stage.clientWidth / (t.w * MM), 2.4);
  inner.style.transform = `scale(${scale})`;
  stage.style.height = (t.h * MM * scale) + "px";
  $("#sizeChip").textContent = faSize(t) + " mm";

}
new ResizeObserver(() => renderStage()).observe(stage);

let drag = null;
// which form control fills each field: clicking text on the locked preview jumps there
const FIELD_INPUT = { dateNum: "#fDay", dateWords: "#fDay", stubDate: "#fDay", amountWords: "#fAmount", amountNum: "#fAmount", stubAmount: "#fAmount",
  payee: "#fPayee", stubPayee: "#fPayee", payeeId: "#fPid", reason: "#fReason", stubReason: "#fReason", sayad: "#fSayad",
  stubPrev: "#fPrev", stubDeposit: "#fDeposit", stubSum: "#fPrev", stubBal: "#fPrev", noEndorse: "#fNoEndorse", note: "#fNote", hawale: "#fNoHawale" };
function focusInput(sel) {
  const el = $(sel); if (!el) return;
  const det = el.closest("details"); if (det) det.open = true;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.focus({ preventScroll: true });
  const box = el.closest(".field") || el; box.classList.remove("flash"); void box.offsetWidth; box.classList.add("flash");
}
stage.addEventListener("pointerdown", e => {
  const fe = e.target.closest(".fld"); if (!fe) return;
  if (!S.edit) {
    const k = fe.dataset.k;
    if (FIELD_INPUT[k]) { e.preventDefault(); focusInput(FIELD_INPUT[k]); }
    else { S.sel = k; setEdit(true); }
    return;
  }
  const k = fe.dataset.k, f = tpl().fields[k];
  S.sel = k; drag = { k, x: e.clientX, y: e.clientY, r: f.r, t: f.t, w: f.w, h: !!e.target.dataset.h, moved: 0 };
  stage.setPointerCapture(e.pointerId); stage.focus({ preventScroll: true });
  renderStage(); renderInspector(); e.preventDefault();
});
stage.addEventListener("pointermove", e => {
  if (!drag) return;
  const f = tpl().fields[drag.k], dx = (e.clientX - drag.x) / (scale * MM), dy = (e.clientY - drag.y) / (scale * MM);
  const snap = v => Math.round(v * 2) / 2;
  if (drag.h) f.w = Math.max(5, snap(drag.w - dx));
  else { f.r = snap(drag.r - dx); f.t = snap(drag.t + dy); }
  drag.moved = 1; renderStage(); renderInspectorValues();
});
const endDrag = () => { if (drag) { if (drag.moved) tweak(); drag = null; } };
stage.addEventListener("pointerup", endDrag); stage.addEventListener("pointercancel", endDrag);
stage.addEventListener("keydown", e => {
  const f = tpl().fields[S.sel]; if (!f || !S.edit) return;
  const st = e.shiftKey ? 2 : .5, m = { ArrowLeft: ["r", st], ArrowRight: ["r", -st], ArrowUp: ["t", -st], ArrowDown: ["t", st] }[e.key];
  if (!m) return; e.preventDefault(); f[m[0]] = Math.round((f[m[0]] + m[1]) * 2) / 2; renderStage(); renderInspectorValues(); tweak();
});

function setEdit(on) {
  S.edit = !!on; save(); renderStage(); renderInspector();
  if (on) { toast("حالت ویرایش چیدمان: نوشته‌ها را بکشید"); setTimeout(() => $("#layoutCard").scrollIntoView({ behavior: "smooth", block: "nearest" }), 60); }
}
$("#editMode").addEventListener("change", e => setEdit(e.target.checked));
$("#stubMode").addEventListener("change", e => {
  const t = tpl(); t.stub = e.target.checked ? 1 : 0;
  if (!t.stub && isStub(S.sel)) S.sel = "amountWords";
  save(); renderForm(); renderStage(); renderInspector(); renderFlags();
  toast(t.stub ? "ته‌چک هم چاپ می‌شود (برای همین قالب)" : "ته‌چک چاپ نمی‌شود");
});

/* ================= layout inspector ================= */
function tweak() { tpl().tuned = 1; save(); }
function renderInspector() {
  const t = tpl();
  if (!t.fields[S.sel]) S.sel = "amountWords";
  $("#tplName").textContent = "— " + (t.kind === "custom" ? t.name : bankName(t.bank));
  $("#fldList").innerHTML = fieldKeys(t).map(k => `<span class="fld-pill${FIELDS[k] ? "" : " extra"}" data-k="${k}" aria-current="${S.sel === k}">
      <input type="checkbox" data-on="${k}" ${t.fields[k].on ? "checked" : ""} aria-label="چاپ ${esc(metaOf(t, k).label)}">${esc(metaOf(t, k).label)}</span>`).join("");
  const f = t.fields[S.sel], ex = t.extra[S.sel];
  $("#insp").innerHTML = !f ? "" : (ex ? `
    <div class="field" style="grid-column:1/-1"><label for="iTx">متن</label><div class="in-row"><input id="iTx" data-x="text"><button class="btn sm danger" id="iDel" type="button">حذف این متن</button></div></div>
    <div class="field"><label for="iLb">نام برچسب</label><input id="iLb" data-x="label"></div>` : "") + `
    <div class="field"><label for="iR">از راست (mm)</label><input class="num" id="iR" type="number" step="0.5" data-p="r"></div>
    <div class="field"><label for="iT">از بالا (mm)</label><input class="num" id="iT" type="number" step="0.5" data-p="t"></div>
    <div class="field"><label for="iW">پهنا (mm)</label><input class="num" id="iW" type="number" step="0.5" data-p="w"></div>
    <div class="field"><label for="iS">قلم (pt)</label><input class="num" id="iS" type="number" step="0.5" data-p="size"></div>
    <div class="field"><label for="iA">چینش</label><select id="iA" data-p="al"><option value="right">راست</option><option value="center">وسط</option><option value="left">چپ</option></select></div>
    <div class="field"><label for="iB">ضخامت</label><select id="iB" data-p="b"><option value="0">معمولی</option><option value="1">پررنگ</option></select></div>
    <div class="field"><label for="iX">خانه‌ها</label><input class="num" id="iX" type="number" min="0" max="20" data-p="bx" title="۰ = نوشتهٔ معمولی"></div>
    ${f.bx ? `<div class="field"><label for="iH">ارتفاع خانه (mm)</label><input class="num" id="iH" type="number" step="0.5" data-p="h"></div>` : ""}
    <div class="field"><label for="iF">قلم این نوشته</label><select id="iF" data-p="font"><option value="">مثل کل برگه</option>${FONTS.map(([v, n]) => `<option value="${v}">${n}</option>`).join("")}</select></div>
    <div class="field"><label for="iD">جهت</label><select id="iD" data-p="dir"><option value="auto">خودکار</option><option value="rtl">راست به چپ</option><option value="ltr">چپ به راست</option></select></div>
    <div class="field"><label for="iY">سبک چاپ</label><select id="iY" data-p="style"><option value="">معمولی</option><option value="neg">نگاتیو (سفید روی سیاه)</option><option value="perf">پرفراژ (نقطه‌چین)</option></select></div>`;
  if (ex) { $("#iTx").value = ex.text || ""; $("#iLb").value = ex.label || ""; }
  renderInspectorValues();
}
function renderInspectorValues() {
  const f = tpl().fields[S.sel]; if (!f) return;
  const set = (id, v) => { const el = $(id); if (el && document.activeElement !== el) el.value = v; };
  set("#iR", f.r); set("#iT", f.t); set("#iW", f.w); set("#iS", f.size); set("#iA", f.al); set("#iB", f.b); set("#iX", f.bx || 0); set("#iH", f.h || ""); set("#iF", f.font || ""); set("#iD", f.dir || "auto"); set("#iY", f.style || "");
}
$("#fldList").addEventListener("click", e => {
  const on = e.target.dataset.on;
  if (on) { tpl().fields[on].on = e.target.checked ? 1 : 0; S.sel = on; tweak(); }
  else { const p = e.target.closest(".fld-pill"); if (!p) return; S.sel = p.dataset.k; save(); }
  renderInspector(); renderStage();
});
$("#insp").addEventListener("input", e => {
  const t = tpl(), x = e.target.dataset.x;
  if (x) { t.extra[S.sel][x] = e.target.value; tweak(); if (x === "label") $(`.fld-pill[data-k="${S.sel}"]`).lastChild.textContent = e.target.value; renderStage(); return; }
  const p = e.target.dataset.p; if (!p) return; const f = t.fields[S.sel];
  f[p] = ["al", "font", "dir", "style"].includes(p) ? e.target.value : +e.target.value || 0;
  if (p === "font" && f.font && document.fonts) document.fonts.load(`12pt "${f.font}"`).catch(() => {}).then(renderStage);
  if (p === "bx") { if (f.bx && !f.h) f.h = +(f.size * 1.6 * .3528).toFixed(1); renderInspector(); }
  tweak(); renderStage();
});
$("#insp").addEventListener("click", e => {
  if (e.target.id !== "iDel") return;
  const t = tpl(); delete t.extra[S.sel]; delete t.fields[S.sel]; S.sel = "amountWords"; tweak(); renderInspector(); renderStage();
});
$("#addText").addEventListener("click", () => {
  const t = tpl(), k = "x_" + uid();
  t.extra[k] = { label: "متن " + toFa(Object.keys(t.extra).length + 1), text: "متن دلخواه" };
  t.fields[k] = { r: +(t.w / 3).toFixed(1), t: +(t.h / 2).toFixed(1), w: 50, size: 10, b: 0, on: 1, al: "right" };
  S.sel = k; tweak(); renderInspector(); renderStage(); $("#iTx").focus(); $("#iTx").select();
});

/* ================= template settings ================= */
const TF = { tW: "w", tH: "h", tOffX: "offX", tOffY: "offY", tA4r: "a4r", tA4t: "a4t" };
function renderTplForm() {
  const t = tpl();
  for (const id in TF) $("#" + id).value = t[TF[id]];
  $("#tFont").value = t.font; $("#tPaper").value = t.paper;
  $("#tDigits").checked = !!t.digits; $("#tFill").checked = !!t.fill; $("#tHash").checked = !!t.hash; $("#tRial").checked = !!t.rial;
  $("#tMoney").value = t.money || "rial";
  $("#a4Box").hidden = t.paper !== "a4";
  $("#imgOp").value = t.imgOp || 100;
  const own = getImg(t);
  $("#imgDrop").innerHTML = own ? `<img src="${own}" alt="">تصویر برگهٔ شما. برای عوض کردن، تصویر دیگری بیندازید.`
    : (t.sample ? "الان تصویر نمونهٔ چک صیادی زیر پیش‌نمایش است. برای دقت بیشتر، تصویر یا اسکن صاف برگهٔ خودتان را این‌جا بیندازید." : "تصویر یا اسکن صاف یک برگ چک سفید را این‌جا بیندازید یا کلیک کنید.")
      + " تصویر هرگز روی چک چاپ نمی‌شود.";
  $("#imgClear").disabled = !own;
}
for (const id in TF) $("#" + id).addEventListener("input", e => {
  const v = parseFloat(e.target.value), t = tpl(), p = TF[id]; if (isNaN(v) || (p === "w" || p === "h") && v < 20) return;
  if (p === "w" || p === "h") {          // a measured leaf size rescales every field with it
    const k = v / t[p];
    for (const f of Object.values(t.fields)) { if (p === "w") { f.r = +(f.r * k).toFixed(2); f.w = +(f.w * k).toFixed(2); } else { f.t = +(f.t * k).toFixed(2); if (f.h) f.h = +(f.h * k).toFixed(2); } }
  }
  t[p] = v; tweak(); renderStage(); renderInspectorValues();
});
$("#tFont").addEventListener("change", e => { tpl().font = e.target.value; tweak(); (document.fonts ? document.fonts.load(`12pt "${e.target.value}"`) : Promise.resolve()).catch(() => {}).then(renderStage); });
$("#tMoney").addEventListener("change", e => { tpl().money = e.target.value; tweak(); renderStage(); if (e.target.value === "toman") toast("روی چک قانونی مبلغ باید به ریال باشد؛ تومان برای فیش و رسید است."); });
$("#tPaper").addEventListener("change", e => { tpl().paper = e.target.value; $("#a4Box").hidden = e.target.value !== "a4"; tweak(); });
for (const [id, p] of [["tDigits","digits"],["tFill","fill"],["tHash","hash"],["tRial","rial"]])
  $("#" + id).addEventListener("change", e => { tpl()[p] = e.target.checked ? 1 : 0; tweak(); renderAll(); });

function takeImage(file) {
  if (!file) return;
  readImage(file, data => {
    const t = tpl();
    if (!setImg(t, data)) return toast("تصویر بزرگ است و در مرورگر جا نشد", "error");
    t.imgOp = 100; tweak(); renderTplForm(); renderStage(); renderTemplates(); toast("تصویر برگه گذاشته شد", "success");
  });
}
$("#imgFile").addEventListener("change", e => { takeImage(e.target.files[0]); e.target.value = ""; });
dropTarget($("#imgDrop"), takeImage);
$("#imgClear").addEventListener("click", () => { setImg(tpl(), null); renderTplForm(); renderStage(); renderTemplates(); });
$("#imgOp").addEventListener("input", e => { tpl().imgOp = +e.target.value; save(); renderStage(); });
function dropTarget(el, cb) {
  el.addEventListener("dragover", e => { e.preventDefault(); el.classList.add("over"); });
  el.addEventListener("dragleave", () => el.classList.remove("over"));
  el.addEventListener("drop", e => { e.preventDefault(); el.classList.remove("over"); cb(e.dataTransfer.files[0]); });
}

/* ================= cheque form ================= */
const fAmount = $("#fAmount");
const amountDisplay = rial => !rial ? "" : S.unit === "toman" ? group(rial.length > 1 ? rial.slice(0, -1) : "0", ",") : group(rial, ",");
function renderForm() {
  const ch = cur(), t = tpl();
  $("#uT").classList.toggle("active", S.unit === "toman"); $("#uR").classList.toggle("active", S.unit === "rial");
  $("#unitLbl").textContent = S.unit === "toman" ? "(تومان)" : "(ریال)";
  document.querySelectorAll(".u").forEach(u => u.textContent = $("#unitLbl").textContent);
  $("#fBank").innerHTML = bankOptions(ch.bank);
  $("#bankDot").style.color = $("#bankDot").style.background = (BANKS[ch.bank] || {}).color || "var(--line-strong)";
  const mine = customTpls();
  $("#fTpl").innerHTML = `<option value="">استاندارد صیاد — ${esc(bankName(ch.bank))}</option>`
    + (mine.length ? `<optgroup label="قالب‌های من">` + mine.map(x => `<option value="${x.id}" ${x.id === ch.tpl ? "selected" : ""}>${esc(x.name)}</option>`).join("") + `</optgroup>` : "");
  $("#tplHint").innerHTML = t.kind === "custom" ? `قالب شخصی${t.bank ? "، " + esc(bankName(t.bank)) : ""}، ${faSize(t)} mm`
    : t.tuned ? `<span class="good">چیدمان این بانک تنظیم شده است.</span>` : "چیدمان استاندارد؛ یک بار با «چاپ آزمایشی» روی برگهٔ خودتان بسنجید.";
  if (document.activeElement !== fAmount) fAmount.value = amountDisplay(ch.amount);
  for (const [id, p] of [["#fPayee","payee"],["#fReason","reason"],["#fPid","payeeId"]]) if (document.activeElement !== $(id)) $(id).value = ch[p] || "";
  for (const [id, p] of [["#fPrev","prev"],["#fDeposit","deposit"]]) if (document.activeElement !== $(id)) $(id).value = amountDisplay(ch[p] || "");
  if (document.activeElement !== $("#fSayad")) $("#fSayad").value = (ch.sayad || "").replace(/(\d{4})(?=\d)/g, "$1 ");
  if (document.activeElement !== $("#fNote")) $("#fNote").value = ch.note || "";
  $("#fNoEndorse").checked = !!ch.noEndorse; $("#fNoHawale").checked = !!ch.noHawale;
  $("#savePayee").hidden = !ch.payee.trim() || !!findPayee(ch.payee);
  $("#exBadge").hidden = !ch.example;
  const need = [["مبلغ", !!ch.amount], ["گیرنده", !!ch.payee], ["تاریخ", jdnOf(ch.date) >= jdnOf(todayJ())]];
  const done = need.filter(x => x[1]).length, miss = need.filter(x => !x[1]).map(x => x[0]);
  $("#reqBar").style.width = (done / need.length * 100) + "%";
  $("#req").classList.toggle("done", !miss.length);
  $("#reqTxt").textContent = miss.length ? `مانده: ${miss.join("، ")}` : "آمادهٔ چاپ";
  renderPayeeBook();
  const m = stubMoney(ch);
  $("#stubBox").hidden = !t.stub; $("#stubMode").checked = !!t.stub;
  $("#stubHint").innerHTML = m.stubSum == null ? "اگر پر کنید، جمع و ماندهٔ حساب روی ته‌چک حساب و چاپ می‌شود."
    : `جمع <b>${faMoney(m.stubSum.toString())}</b> ریال` + (m.stubBal != null ? `، مانده پس از این چک <b class="${m.stubBal < 0n ? "bad" : ""}">${faSigned(m.stubBal)}</b> ریال` : "");
  renderDate(); renderAmountInfo(); renderPid(); renderBookField();
}
function renderAmountInfo() {
  const r = cur().amount;
  $("#amtWords").textContent = r ? toWords(r) + " ریال" : "مبلغ را وارد کنید";
  $("#amtHint").innerHTML = r
    ? `<b>${faMoney(r)}</b> ریال، ${r.length > 1 ? faMoney(r.slice(0, -1)) : "۰"} تومان` + (S.unit === "toman" && !r.endsWith("0") ? ` <span class="bad">(ریال بر ۱۰ بخش‌پذیر نیست)</span>` : "")
    : "روی برگهٔ چک مبلغ همیشه به ریال نوشته می‌شود.";
}
function renderPid() {
  const r = checkId(cur().payeeId || ""), h = $("#pidHint");
  h.className = "field-hint " + (r ? (r.ok ? "good" : "bad") : ""); h.textContent = r ? r.msg : "";
}
function renderDate() {
  const d = cur().date, len = monthLen(d.y, d.m);
  $("#fDay").innerHTML = Array.from({ length: len }, (_, i) => `<option value="${i + 1}" ${i + 1 === d.d ? "selected" : ""}>${toFa(i + 1)}</option>`).join("");
  $("#fMonth").innerHTML = MONTHS.map((m, i) => `<option value="${i + 1}" ${i + 1 === d.m ? "selected" : ""}>${m}</option>`).join("");
  if (document.activeElement !== $("#fYear")) $("#fYear").value = d.y;
  const g = d2g(jdnOf(d)), diff = jdnOf(d) - jdnOf(todayJ());
  const rel = diff === 0 ? "امروز" : diff > 0 ? toFa(diff) + " روز دیگر" : toFa(-diff) + " روز پیش";
  const hol = holidayOf(d), off = weekday(d) === "جمعه" || hol;
  $("#dateHint").innerHTML = `${weekday(d)}، ${rel}، <span dir="ltr">${g.gy}-${pad2(g.gm)}-${pad2(g.gd)}</span>` + (hol ? `، <span class="bad">تعطیل: ${esc(hol)}</span>` : "");
  $("#dWork").hidden = !off;
}
function setDate(d) { cur().date = { y: d.y, m: d.m, d: Math.min(d.d, monthLen(d.y, d.m)) }; touched(); }
function touched() { delete cur().example; save(); renderForm(); renderStage(); renderQueue(); renderFlags(); }
function moneyInput(el, prop, max) {
  el.addEventListener("input", () => {
    const v = digitsOnly(el.value).replace(/^0+/, "").slice(0, S.unit === "toman" ? max - 1 : max);
    cur()[prop] = v ? (S.unit === "toman" ? v + "0" : v) : "";
    const pos = el.value.length - el.selectionStart; el.value = group(v, ",");
    const p = Math.max(0, el.value.length - pos); el.setSelectionRange(p, p);
    touched();
  });
}
moneyInput(fAmount, "amount", 15); moneyInput($("#fPrev"), "prev", 15); moneyInput($("#fDeposit"), "deposit", 15);
$("#btn000").addEventListener("click", () => { const r = cur().amount; if (!r || r.length >= 13) return; cur().amount = S.unit === "toman" ? r.slice(0, -1) + "0000" : r + "000"; fAmount.value = amountDisplay(cur().amount); touched(); });
$("#uT").addEventListener("click", () => { S.unit = "toman"; save(); renderForm(); });
$("#uR").addEventListener("click", () => { S.unit = "rial"; save(); renderForm(); });
$("#fBank").addEventListener("change", e => { const ch = cur(); ch.bank = e.target.value; S.lastBank = ch.bank; touched(); renderTplForm(); renderInspector(); renderTemplates(); });
$("#fTpl").addEventListener("change", e => { cur().tpl = e.target.value; touched(); renderTplForm(); renderInspector(); });
$("#fNote").addEventListener("input", e => { cur().note = e.target.value; touched(); });
$("#fNoEndorse").addEventListener("change", e => { cur().noEndorse = e.target.checked ? 1 : 0; touched(); });
$("#fNoHawale").addEventListener("change", e => { cur().noHawale = e.target.checked ? 1 : 0; touched(); });
$("#savePayee").addEventListener("click", () => {
  const ch = cur(); upsertPayee({ name: ch.payee.trim(), nid: ch.payeeId, reason: ch.reason }); save(); renderForm(); renderPayees();
  toast(`«${ch.payee.trim()}» در طرف حساب‌ها ذخیره شد`, "success");
});
$("#fPayee").addEventListener("input", e => {
  const ch = cur(); ch.payee = e.target.value;
  const known = payeeBook().find(p => p.payee === ch.payee.trim());   // a name picked from the suggestions fills the rest
  if (known && (known.payeeId && !ch.payeeId || known.reason && !ch.reason)) {
    if (!ch.payeeId && known.payeeId) ch.payeeId = known.payeeId;
    if (!ch.reason && known.reason) ch.reason = known.reason;
    $("#payeeHint").textContent = known.saved ? "کد ملی و «بابت» از طرف حساب‌ها پر شد." : "کد ملی و «بابت» از چک‌های قبلی همین گیرنده پر شد.";
  } else $("#payeeHint").textContent = "";
  touched();
});
function payeeBook() {          // saved payees first, then recent names from the register and the queue
  const seen = new Map();
  for (const p of S.payees) seen.set(p.name.trim(), { payee: p.name.trim(), payeeId: p.nid || "", reason: p.reason || "", saved: 1 });
  for (const x of S.issued.concat(S.queue.filter(c => !c.example).slice().reverse()))
    if (x.payee && !seen.has(x.payee.trim())) seen.set(x.payee.trim(), { payee: x.payee.trim(), payeeId: x.payee_id || x.payeeId || "", reason: x.reason || "" });
  return [...seen.values()].slice(0, 300);
}
const findPayee = name => S.payees.find(p => p.name.trim() === String(name || "").trim());
function upsertPayee(o) {
  const p = findPayee(o.name);
  if (p) { for (const k of ["nid", "reason", "phone", "note"]) if (o[k] && !p[k]) p[k] = o[k]; return p; }
  const n = { id: uid(), name: o.name, nid: o.nid || "", phone: o.phone || "", reason: o.reason || "", note: o.note || "" };
  S.payees.push(n); return n;
}
function renderPayeeBook() {
  $("#payeeList").innerHTML = payeeBook().map(p => `<option value="${esc(p.payee)}">${p.payeeId ? esc(toFa(p.payeeId)) : ""}</option>`).join("");
}
$("#exBadge").addEventListener("click", () => {
  const ch = cur(); Object.assign(ch, blankCheque(ch.date, ch.bank, ch.tpl), { id: ch.id, date: todayJ() }); delete ch.example;
  save(); renderAll(); fAmount.focus(); toast("برگه پاک شد؛ مبلغ را بنویسید");
});
fAmount.addEventListener("focus", () => setTimeout(() => fAmount.select(), 0));
$("#fReason").addEventListener("input", e => { cur().reason = e.target.value; touched(); });
$("#fPid").addEventListener("input", e => { const v = digitsOnly(e.target.value).slice(0, 11); e.target.value = v; cur().payeeId = v; touched(); });
$("#fSayad").addEventListener("input", e => { cur().sayad = digitsOnly(e.target.value).slice(0, 16); touched(); });
$("#fDay").addEventListener("change", e => setDate({ ...cur().date, d: +e.target.value }));
$("#fMonth").addEventListener("change", e => setDate({ ...cur().date, m: +e.target.value }));
$("#fYear").addEventListener("change", e => { const y = +digitsOnly(e.target.value); if (y > 1300 && y < 1600) setDate({ ...cur().date, y }); else renderDate(); });
$("#dToday").addEventListener("click", () => setDate(todayJ()));
$("#dWork").addEventListener("click", () => { setDate(nextWorkday(cur().date)); toast("سررسید به اولین روز کاری بعد رفت"); });
let calView = null;
function renderCal() {
  const { y, m } = calView, sel = cur().date, today = jdnOf(todayJ()), first = j2d(y, m, 1), len = monthLen(y, m);
  const lead = (mod(first, 7) + 2) % 7;                  // Saturday-first week
  let cells = "";
  for (let i = 0; i < lead; i++) cells += "<span></span>";
  for (let d = 1; d <= len; d++) {
    const jd = first + d - 1, hol = holidayOf({ y, m, d });
    const cls = [(mod(jd, 7) === 4) && "fri", hol && "hol", jd === today && "today", sel.y === y && sel.m === m && sel.d === d && "sel", jd < today && "past"].filter(Boolean).join(" ");
    cells += `<button type="button" class="${cls}" data-d="${d}" title="${esc(hol)}" aria-label="${toFa(d)} ${MONTHS[m - 1]}${hol ? "، تعطیل: " + esc(hol) : ""}">${toFa(d)}</button>`;
  }
  $("#calPop").innerHTML = `<div class="cal-head"><button class="icon-btn" type="button" data-nav="-1" aria-label="ماه قبل">›</button>
      <span>${MONTHS[m - 1]} ${toFa(y)}</span><button class="icon-btn" type="button" data-nav="1" aria-label="ماه بعد">‹</button></div>
    <div class="cal-grid">${["ش","ی","د","س","چ","پ","ج"].map(w => `<span class="wd">${w}</span>`).join("")}${cells}</div>
    <div class="cal-foot">${[1, 2, 3, 6, 12].map(k => `<button class="btn sm" type="button" data-add="${k}">${toFa(k)} ماه بعد</button>`).join("")}</div>`;
}
function openCal(on) {
  const pop = $("#calPop"); if (on == null) on = pop.hidden;
  if (on) { calView = { y: cur().date.y, m: cur().date.m }; renderCal(); }
  pop.hidden = !on; $("#dCal").setAttribute("aria-expanded", on);
}
$("#dCal").addEventListener("click", e => { e.stopPropagation(); openCal(); });
$("#calPop").addEventListener("click", e => {
  e.stopPropagation();
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.nav) { const n = addMonths({ ...calView, d: 1 }, +b.dataset.nav); calView = { y: n.y, m: n.m }; renderCal(); return; }
  if (b.dataset.add) { setDate(addMonths(todayJ(), +b.dataset.add)); openCal(false); return; }
  if (b.dataset.d) { setDate({ y: calView.y, m: calView.m, d: +b.dataset.d }); openCal(false); }
});
document.addEventListener("click", e => { if (!$("#calPop").hidden && !e.target.closest("#calPop")) openCal(false); });
$("#dNext").addEventListener("click", () => setDate(addMonths(cur().date, 1)));
$("#dPrev").addEventListener("click", () => setDate(addMonths(cur().date, -1)));

/* ================= validation ================= */
function issues(ch) {
  const out = [];
  if (!ch.amount) out.push(["warn", "بی‌مبلغ"]);
  if (!ch.payee) out.push(["warn", "بی‌گیرنده"]);
  const id = checkId(ch.payeeId || ""); if (id && !id.ok) out.push(["warn", "کد ملی نادرست"]);
  if (jdnOf(ch.date) < jdnOf(todayJ())) out.push(["warn", "تاریخ گذشته"]);
  if (weekday(ch.date) === "جمعه") out.push(["gold", "جمعه"]);
  else if (holidayOf(ch.date)) out.push(["gold", "تعطیل: " + holidayOf(ch.date)]);
  const leaf = leafProblem(ch); if (leaf) out.push(["warn", leaf]);
  if (ch.sayad && ch.sayad.length !== 16) out.push(["warn", "صیاد ناقص"]);
  const bal = stubMoney(ch).stubBal; if (tplOf(ch).stub && bal != null && bal < 0n) out.push(["warn", "مانده منفی"]);
  return out;
}
const pills = list => list.map(([c, t]) => `<span class="status-pill pill-${c}"><span class="dot ${c === "warn" ? "err" : "warn"}"></span>${t}</span>`).join("");
function renderFlags() {
  const f = issues(cur());
  $("#flags").innerHTML = f.length ? pills(f) : `<span class="status-pill pill-ok"><span class="dot ok"></span>آمادهٔ چاپ</span>`;
}

/* ================= queue ================= */
function renderQueue() {
  const q = S.queue;
  $("#sqTitle").textContent = `صف چاپ (${toFa(q.length)} برگ)`;
  $("#sideQueue").innerHTML = q.map(c => `<button class="history-item${c.id === S.cur ? " active" : ""}" type="button" data-id="${c.id}">
      <div class="history-main"><div class="history-name">${esc(c.payee || "— بی‌گیرنده —")}</div>
      <div class="history-time"><span class="q-dot" style="background:${(BANKS[c.bank] || {}).color}"></span>${toFa(dateStr(c.date))}<span class="q-amt">${c.amount ? faMoney(c.amount) : ""}</span></div></div></button>`).join("");
  $("#qBody").innerHTML = q.map((c, i) => {
    const t = tplOf(c), is = issues(c);
    return `<tr class="${c.id === S.cur ? "cur" : ""}" data-id="${c.id}">
      <td class="mono">${toFa(i + 1)}</td>
      <td><a href="#" data-act="open">${esc(c.payee || "— بی‌گیرنده —")}</a>${c.example ? ' <span class="status-pill"><span class="dot warn"></span>نمونه</span>' : ""}</td>
      <td><span class="row"><span class="q-dot dot" style="background:${(BANKS[c.bank] || {}).color}"></span>${esc((BANKS[c.bank] || {}).name || "")}، <span class="muted">${esc(tplLabel(t))}</span></span></td>
      <td class="mono">${toFa(dateStr(c.date))} <span class="muted">${weekday(c.date)}</span></td>
      <td class="num">${c.amount ? faMoney(c.amount) : "—"}</td>
      <td>${is.length ? pills(is) : '<span class="status-pill pill-ok"><span class="dot ok"></span>آماده</span>'}</td>
      <td><span class="row">
        <button class="icon-btn" type="button" data-act="up" title="بالاتر" aria-label="بالاتر">▲</button>
        <button class="icon-btn" type="button" data-act="dup" title="رونوشت" aria-label="رونوشت">⧉</button>
        <button class="icon-btn" type="button" data-act="del" title="حذف" aria-label="حذف">✕</button></span></td></tr>`;
  }).join("");
  let sum = 0n; for (const c of q) if (c.amount) sum += BigInt(c.amount);
  const dated = q.slice().sort((a, b) => jdnOf(a.date) - jdnOf(b.date));
  const bad = q.filter(c => !c.amount || !c.payee).length;
  $("#kCount").textContent = toFa(q.length);
  $("#kBad").innerHTML = bad ? `<span class="kpi-bad">${toFa(bad)} برگ ناقص</span>` : `<span class="kpi-good">همه کامل</span>`;
  $("#kSum").textContent = faMoney(sum.toString());
  $("#kSumT").textContent = sum ? toWords(sum.toString()).split(" و ").slice(0, 2).join(" و ") + (toWords(sum.toString()).split(" و ").length > 2 ? " و …" : "") + " ریال" : "";
  const nx = dated[0], ls = dated[dated.length - 1];
  $("#kNext").textContent = nx ? toFa(dateStr(nx.date)) : "—"; $("#kNextS").textContent = nx ? weekday(nx.date) : "";
  $("#kLast").textContent = ls ? toFa(dateStr(ls.date)) : "—"; $("#kLastS").textContent = ls ? weekday(ls.date) : "";
  $("#qPrint").textContent = q.length > 1 ? `چاپ همهٔ صف (${toFa(q.length)} برگ)` : "چاپ همهٔ صف";
}
$("#sideQueue").addEventListener("click", e => {
  const b = e.target.closest(".history-item"); if (!b) return;
  S.cur = b.dataset.id; save(); renderAll(); go("issue");
  if (window.OdiqUI) OdiqUI.sidebar.closeDrawer();
});
$("#qBody").addEventListener("click", e => {
  const tr = e.target.closest("tr"); const act = e.target.closest("[data-act]")?.dataset.act; if (!tr || !act) return;
  e.preventDefault();
  const id = tr.dataset.id, i = S.queue.findIndex(c => c.id === id);
  if (act === "open") { S.cur = id; save(); renderAll(); go("issue"); return; }
  if (act === "up" && i > 0) [S.queue[i - 1], S.queue[i]] = [S.queue[i], S.queue[i - 1]];
  if (act === "dup") { const c = clone(S.queue[i]); c.id = uid(); delete c.example; c.sayad = ""; S.queue.splice(i + 1, 0, c); }
  if (act === "del") {
    const gone = S.queue.splice(i, 1)[0], prevCur = S.cur; if (!S.queue.length) S.queue.push(blankCheque());
    if (S.cur === id) S.cur = S.queue[Math.min(i, S.queue.length - 1)].id;
    offerUndo(`چک «${gone.payee || "بی‌گیرنده"}» از صف برداشته شد`, () => {
      S.queue = S.queue.filter(c => !(S.queue.length === 1 && !c.amount && !c.payee));
      S.queue.splice(Math.min(i, S.queue.length), 0, gone); S.cur = prevCur;
    });
  }
  save(); renderAll();
});
let undoT, undoFn;
function offerUndo(text, fn) {
  undoFn = fn; $("#undoTxt").textContent = text; $("#undoBar").hidden = false;
  clearTimeout(undoT); undoT = setTimeout(() => { $("#undoBar").hidden = true; undoFn = null; }, 7000);
}
$("#undoBtn").addEventListener("click", () => { if (undoFn) { undoFn(); undoFn = null; save(); renderAll(); toast("برگشت داده شد", "success"); } $("#undoBar").hidden = true; });
function newCheque() { const c = cur(), n = blankCheque(c.date, c.bank, c.tpl); S.queue.push(n); S.cur = n.id; save(); renderAll(); go("issue"); fAmount.focus(); }
$("#navNew").addEventListener("click", newCheque);
$("#qAdd").addEventListener("click", newCheque);

/* series */
function seriesHint() {
  const n = Math.max(1, Math.min(60, +digitsOnly($("#sCount").value) || 1)), ev = Math.max(1, +digitsOnly($("#sEvery").value) || 1), c = cur();
  const last = addMonths(c.date, (n - 1) * ev);
  let per = c.amount || "0";
  if ($("#sTotal").value === "split" && c.amount) per = (BigInt(c.amount) / BigInt(n)).toString();
  $("#sHint").innerHTML = `از روی «${esc(c.payee || "چک فعلی")}»: ${toFa(n)} برگ، از ${toFa(c.date.d)} ${MONTHS[c.date.m - 1]} ${toFa(c.date.y)} تا ${toFa(last.d)} ${MONTHS[last.m - 1]} ${toFa(last.y)}` + (c.amount ? `، هر برگ <b>${faMoney(per)}</b> ریال` : "");
}
for (const id of ["#sCount", "#sEvery", "#sTotal"]) $(id).addEventListener("input", seriesHint);
$("#sGo").addEventListener("click", () => {
  const base = cur(), n = Math.max(1, Math.min(60, +digitsOnly($("#sCount").value) || 1)), ev = Math.max(1, +digitsOnly($("#sEvery").value) || 1);
  if (n < 2) return toast("تعداد باید دست‌کم ۲ باشد", "error");
  let amounts = Array(n).fill(base.amount);
  if ($("#sTotal").value === "split" && base.amount) {        // remainder goes on the first cheque
    const tot = BigInt(base.amount), per = tot / BigInt(n), rem = tot - per * BigInt(n);
    amounts = amounts.map((_, i) => (i === 0 ? per + rem : per).toString());
  }
  const reason = base.reason || "";
  const made = amounts.map((a, i) => ({ ...clone(base), id: uid(), date: addMonths(base.date, i * ev), amount: a, sayad: "",
    reason: $("#sLabel").checked ? `${reason ? reason + " — " : ""}قسط ${ordinal(i + 1)} از ${toWords(n)}` : reason }));
  made.forEach(m => delete m.example);
  if ($("#sWork").checked) for (const m of made) m.date = nextWorkday(m.date);
  const book = S.books.find(b => b.id === base.book);
  if (book) {                                   // consecutive free leaves of the same chequebook
    const taken = new Set([...leafState(book).keys()].filter(k => k !== base.serial));
    const free = leafList(book).filter(x => !taken.has(x));
    made.forEach((m, i) => { m.serial = free[i] || ""; });
  }
  S.queue.splice(S.queue.indexOf(base), 1, ...made); S.cur = made[0].id;
  save(); renderAll(); toast(`${toFa(n)} برگ ساخته شد`, "success");
});

/* ================= templates view ================= */
function thumbStyle(t) { const bg = bgOf(t); return `aspect-ratio:${t.w}/${t.h};` + (bg ? `background-image:url("${bg}")` : ""); }
function renderTemplates() {
  const mine = customTpls(), active = tpl();
  $("#myCount").textContent = toFa(mine.length) + " قالب";
  $("#myTpls").innerHTML = mine.length ? mine.map(t => `<div class="card tpl-card${t.id === active.id ? " active" : ""}" data-id="${t.id}">
      <div class="tpl-thumb" style='${thumbStyle(t)}'>${t.id === active.id ? '<span class="status-pill"><span class="dot ok"></span>در حال استفاده</span>' : ""}</div>
      <div class="tpl-meta"><b>${esc(t.name)}</b><span>${faSize(t)} mm</span></div>
      <div class="muted" style="font-size:12px">${t.bank ? esc(bankName(t.bank)) : "بدون بانک"}، ${toFa(fieldKeys(t).filter(k => t.fields[k].on).length)} نوشته</div>
      <div class="row">
        <button class="btn sm primary" type="button" data-act="use">استفاده و ویرایش</button>
        <button class="btn sm" type="button" data-act="dup">رونوشت</button>
        <button class="btn sm" type="button" data-act="export">فایل</button>
        <button class="btn sm danger" type="button" data-act="del">حذف</button>
      </div></div>`).join("")
    : `<div class="empty" style="min-height:150px;grid-column:1/-1"><strong>هنوز قالبی نساخته‌اید</strong><span>از روی عکس برگهٔ دسته‌چک خودتان یک قالب بسازید؛ نوشته‌ها را روی خط‌ها می‌کشید و برای همیشه ذخیره می‌شود.</span>
       <button class="btn primary" type="button" data-modal-open="newTplModal">+ قالب تازه</button></div>`;
  const tuned = new Set(S.templates.filter(x => x.kind === "bank" && x.tuned).map(x => x.bank));
  $("#bankCount").textContent = `${toFa(Object.keys(BANKS).length)} بانک، ${toFa(tuned.size)} تنظیم‌شده`;
  $("#bankGrid").innerHTML = Object.values(BANKS).map(b => `<button type="button" class="bank-btn" data-bank="${b.code}" aria-current="${active.kind === "bank" && active.bank === b.code}">
      <span class="bank-dot" style="background:${b.color};color:${b.color}"></span><span>${esc(b.name)}</span>${tuned.has(b.code) ? "<small>✓ تنظیم</small>" : ""}</button>`).join("");
}
$("#myTpls").addEventListener("click", e => {
  const card = e.target.closest(".tpl-card"), act = e.target.closest("[data-act]")?.dataset.act; if (!card || !act) return;
  const t = S.templates.find(x => x.id === card.dataset.id);
  if (act === "use") { cur().tpl = t.id; if (t.bank) cur().bank = t.bank; save(); renderAll(); go("issue"); }
  if (act === "dup") { const c = clone(t); c.id = uid(); c.name += " (رونوشت)"; S.templates.push(c); const img = getImg(t); if (img) setImg(c, img); save(); renderAll(); }
  if (act === "export") exportTpl(t);
  if (act === "del") confirmDo(`قالب «${t.name}» حذف شود؟`, "چک‌هایی که این قالب را داشتند به چیدمان استاندارد بانکشان برمی‌گردند.", "حذف قالب", () => {
    const img = getImg(t), users = S.queue.filter(c => c.tpl === t.id).map(c => c.id), at = S.templates.indexOf(t);
    setImg(t, null); S.templates = S.templates.filter(x => x.id !== t.id);
    for (const c of S.queue) if (c.tpl === t.id) c.tpl = "";
    save(); renderAll();
    offerUndo(`قالب «${t.name}» حذف شد`, () => {
      S.templates.splice(at, 0, t); if (img) setImg(t, img);
      for (const c of S.queue) if (users.includes(c.id)) c.tpl = t.id;
    });
  });
});
$("#bankGrid").addEventListener("click", e => {
  const b = e.target.closest(".bank-btn"); if (!b) return;
  const ch = cur(); ch.bank = b.dataset.bank; ch.tpl = ""; S.lastBank = ch.bank; save(); renderAll(); go("issue");
});
$("#tplReset").addEventListener("click", () => {
  const t = tpl();
  confirmDo(`چیدمان «${t.kind === "custom" ? t.name : bankName(t.bank)}» به استاندارد برگردد؟`, "جای همهٔ نوشته‌ها و اندازهٔ برگه به چیدمان استاندارد صیاد برمی‌گردد.", "برگردان", () => {
    t.fields = defaultFields(); t.extra = {}; t.offX = t.offY = 0; t.w = STD_W; t.h = STD_H; t.tuned = 0; save(); renderAll(); toast("به استاندارد برگشت");
  });
});
$("#tplAll").addEventListener("click", () => {
  const src = tpl();
  confirmDo("این چیدمان روی همهٔ بانک‌ها نوشته شود؟", `چیدمان و تنظیمات چاپ «${src.kind === "custom" ? src.name : bankName(src.bank)}» روی هر ${toFa(Object.keys(BANKS).length)} بانک نوشته می‌شود و تنظیم‌های قبلی آن‌ها از بین می‌رود.`, "اعمال روی همه", () => {
    for (const code in BANKS) {
      const t = tplForBank(code); if (t === src) continue;
      const keep = { id: t.id, kind: "bank", bank: t.bank, name: t.name, sample: 1 };
      Object.assign(t, clone(src), keep, { tuned: 1 });
    }
    save(); renderAll(); toast("چیدمان روی همهٔ بانک‌ها گذاشته شد", "success");
  });
});

/* new template */
let ntImage = null, ntRatio = 0;
function resetNewTpl() {
  ntImage = null; ntRatio = 0;
  $("#ntName").value = ""; $("#ntBank").innerHTML = bankOptions(cur().bank, true); $("#ntW").value = STD_W; $("#ntH").value = STD_H;
  $("#ntDrop").textContent = "عکس صاف یا اسکن یک برگ سفید را این‌جا بیندازید یا کلیک کنید";
  document.querySelector('input[name="ntStart"][value="std"]').checked = true;
}
document.addEventListener("click", e => { if (e.target.closest('[data-modal-open="newTplModal"]')) { resetNewTpl(); setTimeout(() => $("#ntName").focus(), 50); } }, true);
function takeNtImage(file) {
  if (!file) return;
  readImage(file, (data, ratio) => {
    ntImage = data; ntRatio = ratio;
    $("#ntDrop").innerHTML = `<img src="${data}" alt="">برای عوض کردن، تصویر دیگری بیندازید`;
    $("#ntW").value = +(parseFloat($("#ntH").value || STD_H) * ratio).toFixed(1);
  });
}
$("#ntImg").addEventListener("change", e => { takeNtImage(e.target.files[0]); e.target.value = ""; });
dropTarget($("#ntDrop"), takeNtImage);
$("#ntH").addEventListener("input", () => { if (ntRatio) $("#ntW").value = +(parseFloat($("#ntH").value || 0) * ntRatio).toFixed(1); });
$("#ntGo").addEventListener("click", () => {
  const name = $("#ntName").value.trim(), w = parseFloat($("#ntW").value), h = parseFloat($("#ntH").value);
  if (!name) { toast("یک نام برای قالب بنویسید", "error"); return $("#ntName").focus(); }
  if (!(w >= 40 && h >= 20)) return toast("اندازهٔ برگه درست نیست", "error");
  const start = document.querySelector('input[name="ntStart"]:checked').value, bank = $("#ntBank").value;
  const t = baseTpl({ kind: "custom", name, bank, w, h, sample: !ntImage && start !== "blank" ? 1 : 0, tuned: 1 });
  if (start === "cur") {
    const src = tpl(), kx = w / src.w, ky = h / src.h;
    t.fields = clone(src.fields); t.extra = clone(src.extra || {});
    for (const f of Object.values(t.fields)) { f.r *= kx; f.w *= kx; f.t *= ky; if (f.h) f.h *= ky; }
    Object.assign(t, { font: src.font, digits: src.digits, fill: src.fill, hash: src.hash, rial: src.rial, paper: src.paper });
  } else {
    t.fields = defaultFields(w, h);
    if (start === "blank") for (const f of Object.values(t.fields)) f.on = 0;
  }
  if (ntImage && !setImg(t, ntImage)) toast("تصویر در مرورگر جا نشد؛ قالب بدون تصویر ساخته شد", "error");
  S.templates.push(t);
  const ch = cur(); ch.tpl = t.id; if (bank) ch.bank = bank;
  S.sel = start === "blank" ? "amountWords" : S.sel;
  S.edit = true; save(); modal.close("newTplModal"); renderAll(); go("issue");
  toast(start === "blank" ? "قالب ساخته شد. از فهرست «چیدمان» نوشته‌ها را روشن کنید و روی خط‌ها بکشید." : "قالب ساخته شد. نوشته‌ها را روی خط‌های برگه بکشید.", "success");
});

/* import / export: a template file carries its leaf image, so it can be shared with colleagues */
function download(name, text, type) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function exportTpl(t) {
  const out = clone(t); delete out.id;
  download(`cheque-template-${t.name}.json`, JSON.stringify({ chequenegar: 3, template: out, image: getImg(t) || null }, null, 1), "application/json");
}
$("#tplImport").addEventListener("change", e => {
  const f = e.target.files[0]; if (!f) return; const rd = new FileReader();
  rd.onload = () => { try {
    const o = JSON.parse(rd.result), src = o.template || o; if (!src.fields || !src.w) throw 0;
    const t = baseTpl({ ...src, id: uid(), kind: "custom", name: src.kind === "bank" ? bankName(src.bank) + " (وارد شده)" : src.name || "قالب وارد شده", tuned: 1 });
    t.extra = t.extra || {};
    for (const k in FIELDS) if (!t.fields[k]) t.fields[k] = { ...defaultFields(t.w, t.h)[k], on: 0 };
    if (o.image && !setImg(t, o.image)) toast("تصویر قالب در مرورگر جا نشد", "error");
    S.templates.push(t); save(); renderAll(); toast(`قالب «${t.name}» اضافه شد`, "success");
  } catch (err) { toast(`این فایل قالب ${CFG.product} نیست`, "error"); } };
  rd.readAsText(f); e.target.value = "";
});

/* generic confirm */
let cfAction = null;
function confirmDo(title, text, yes, fn) { $("#cfTitle").textContent = title; $("#cfText").textContent = text; $("#cfYes").textContent = yes; cfAction = fn; modal.open("confirmModal"); }
$("#cfYes").addEventListener("click", () => { modal.close("confirmModal"); if (cfAction) cfAction(); cfAction = null; });

/* ================= printing ================= */
function printCheques(list, test) { printCheques.prep(list, test); return (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => window.print()); }
printCheques.prep = function (list, test) {
  const root = $("#print-root"), sizes = new Map();
  root.innerHTML = "";
  for (const ch of list) {               // each cheque uses its own template; mixed sizes get named @page rules
    const t = tplOf(ch), rot = t.paper === "cheque-rot", a4 = t.paper === "a4";
    const pw = a4 ? 210 : rot ? t.h : t.w, ph = a4 ? 297 : rot ? t.w : t.h, pn = `p${pw}x${ph}`.replace(/\./g, "_");
    if (!sizes.size) sizes.set("", `@page{size:${pw}mm ${ph}mm;margin:0}`);
    sizes.set(pn, `@page ${pn}{size:${pw}mm ${ph}mm;margin:0}`);
    const pg = document.createElement("div"); pg.className = "pg"; pg.style.cssText = `width:${pw}mm;height:${ph}mm;page:${pn}`;
    const c = buildCheque(ch, t, test ? "test" : "print");
    c.style.position = "absolute";
    if (a4) { c.style.right = t.a4r + "mm"; c.style.top = t.a4t + "mm"; }
    else if (rot) { c.style.left = 0; c.style.top = 0; c.style.transformOrigin = "0 0"; c.style.transform = "rotate(90deg) translateY(-100%)"; }
    else { c.style.left = 0; c.style.top = 0; }
    pg.appendChild(c); root.appendChild(pg);
  }
  $("#pageStyle").textContent = [...sizes.values()].join("\n");
};
async function logPrinted(list) {
  const items = list.map(ch => ({ client_id: ch.id, bank: bankName(ch.bank), template: tplLabel(tplOf(ch)), due_date: dateStr(ch.date), due_on: gIsoOf(ch.date),
    amount: ch.amount, payee: ch.payee, payee_id: ch.payeeId, reason: ch.reason, sayad: ch.sayad, note: ch.note || "",
    book_id: ch.book || "", serial: ch.book ? ch.serial || "" : "" }));
  if (MODE === "server") S.issued = (await api("POST", "/api/cheque/issued", { items })).items.concat(S.issued);
  else { const at = new Date().toISOString(); S.issued = items.map(x => ({ ...x, id: "L" + uid(), status: "issued", printed_at: at })).concat(S.issued); }
  if (S.settings.autoPayee) for (const ch of list) if (ch.payee.trim()) upsertPayee({ name: ch.payee.trim(), nid: ch.payeeId, reason: ch.reason });
}
const paperName = t => t.paper === "a4" ? "A4 (برگه روی کاغذ چسبیده)" : `${faSize(t)} mm${t.paper === "cheque-rot" ? "، عمودی" : ""}`;
/* print in two steps: review what goes on paper, then ask how it came out; only confirmed prints are logged */
function openPrint(list, test) {
  const bad = test ? [] : list.filter(c => !c.amount || !c.payee || leafProblem(c));
  const papers = [...new Set(list.map(c => paperName(tplOf(c))))];
  $("#pmTitle").textContent = test ? "چاپ آزمایشی روی کاغذ سفید" : list.length > 1 ? `چاپ ${toFa(list.length)} برگ چک` : "چاپ چک";
  $("#pmBody").innerHTML = (test
      ? `<p class="pm-big">یک کاغذ سفید معمولی در چاپگر بگذارید. نوشته‌ها همراه تصویر کم‌رنگ برگه و کادر هر خانه چاپ می‌شوند. بعد کاغذ را جلوی نور روی برگهٔ واقعی بگذارید و ببینید نوشته‌ها روی خط‌ها می‌نشینند یا نه.</p>`
      : `<div class="pm-list">${list.map(c => { const t = tplOf(c), miss = [!c.amount && "مبلغ", !c.payee && "گیرنده", leafProblem(c)].filter(Boolean);
          return `<div class="pm-row${miss.length ? " bad" : ""}"><b>${esc(c.payee || "— بی‌گیرنده —")}</b><span class="amt">${c.amount ? faMoney(c.amount) : "—"}</span><span>${toFa(dateStr(c.date))}</span>
            <small>${miss.length ? "کم دارد: " + miss.join("، ") : esc(bankName(c.bank)) + "، " + esc(tplLabel(t))}</small></div>`; }).join("")}</div>`)
    + `<div class="pm-check">
        <div>اندازهٔ کاغذ: <b>${papers.map(esc).join(" / ")}</b></div>
        <label><input type="checkbox" class="pm-ok"> در پنجرهٔ چاپ Margins را <b>None</b> و Scale را <b>100%</b> می‌گذارم.</label>
        ${test ? "" : `<label><input type="checkbox" class="pm-ok"> برگهٔ چک را رو به بالا و از سمت درست در چاپگر گذاشته‌ام.</label>`}
      </div>`;
  const ready = () => !bad.length && [...document.querySelectorAll(".pm-ok")].every(x => x.checked);
  $("#pmActions").innerHTML = `<button class="btn primary" id="pmGo" type="button">باز کردن پنجرهٔ چاپ</button><button class="btn" type="button" data-modal-close>انصراف</button>`
    + (bad.length ? `<span class="field-hint bad" style="align-self:center">${toFa(bad.length)} برگ ناقص است؛ اول کاملش کنید.</span>` : "");
  const goBtn = $("#pmGo"); goBtn.disabled = !ready();
  $("#pmBody").onchange = () => { goBtn.disabled = !ready(); };
  goBtn.onclick = () => printCheques(list, test).then(() => afterPrint(list, test));
  modal.open("printModal");
}
function afterPrint(list, test) {
  $("#pmTitle").textContent = test ? "چاپ آزمایشی چطور بود؟" : "چاپ درست درآمد؟";
  $("#pmBody").innerHTML = test
    ? `<p class="pm-big">اگر همهٔ نوشته‌ها کمی به یک سمت رفته‌اند، در «ویرایش چیدمان» ← «برگه و چاپگر» مقدار جابه‌جایی را بنویسید. اگر فقط یکی جابه‌جاست، همان را بکشید.</p>`
    : `<p class="pm-big">اگر چک‌ها درست چاپ شدند، در فهرست «چاپ‌شده‌ها» ثبت می‌شوند. اگر چاپ لغو شد یا خراب درآمد، ثبت نکنید.</p>`;
  $("#pmActions").innerHTML = test
    ? `<button class="btn primary" type="button" id="pmEdit">ویرایش چیدمان</button><button class="btn" type="button" data-modal-close>درست بود</button>`
    : `<button class="btn primary" type="button" id="pmLogDrop">بله؛ ثبت کن و از صف بردار</button>
       <button class="btn" type="button" id="pmLog">بله؛ ثبت کن و در صف بماند</button>
       <button class="btn ghost" type="button" data-modal-close>نه، ثبت نکن</button>`;
  const close = () => modal.close("printModal");
  if (test) $("#pmEdit").onclick = () => { close(); go("issue"); setEdit(true); };
  else {
    const fail = e => toast("ثبت نشد: " + e.message, "error");
    $("#pmLog").onclick = () => logPrinted(list).then(() => { save(); renderAll(); close(); toast(`${toFa(list.length)} برگ ثبت شد`, "success"); }, fail);
    $("#pmLogDrop").onclick = () => logPrinted(list).then(() => {
      const ids = new Set(list.map(c => c.id));
      S.queue = S.queue.filter(c => !ids.has(c.id)); if (!S.queue.length) S.queue.push(blankCheque());
      if (!S.queue.find(c => c.id === S.cur)) S.cur = S.queue[0].id;
      save(); renderAll(); close(); toast(`${toFa(list.length)} برگ ثبت و از صف برداشته شد`, "success");
    }, fail);
  }
}
$("#btnPrint").addEventListener("click", () => openPrint([cur()], false));
$("#qPrint").addEventListener("click", () => openPrint(S.queue, false));
$("#btnTest").addEventListener("click", () => openPrint([cur()], true));
// Ctrl+P opens the review instead of printing the app screen; a print started from the browser menu still gets the current cheque
document.addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "p") { e.preventDefault(); openPrint(S.view === "queue" ? S.queue : [cur()], false); }
  if (e.altKey && e.key.toLowerCase() === "n") { e.preventDefault(); newCheque(); }
  if (e.key === "Escape" && !$("#calPop").hidden) openCal(false);
});
window.addEventListener("beforeprint", () => { if (!$("#print-root").children.length) printCheques.prep([cur()], false); });

/* ================= payees ================= */
let payeeEdit = null;
function renderPayees() {
  const q = toEn($("#pSearch").value.trim()).toLowerCase();
  const counts = new Map(); for (const r of S.issued) counts.set(r.payee.trim(), (counts.get(r.payee.trim()) || 0) + 1);
  const list = S.payees.filter(p => !q || (p.name + " " + p.nid + " " + p.phone + " " + p.reason).toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name, "fa"));
  $("#pBody").innerHTML = list.length ? list.map(p => `<tr data-id="${p.id}">
      <td><b>${esc(p.name)}</b>${p.note ? `<div class="muted" style="font-size:11px">${esc(p.note)}</div>` : ""}</td>
      <td class="mono">${esc(toFa(p.nid || "—"))}</td><td class="mono">${esc(toFa(p.phone || "—"))}</td><td>${esc(p.reason || "—")}</td>
      <td class="mono">${toFa(counts.get(p.name.trim()) || 0)}</td>
      <td><span class="row"><button class="btn sm primary" type="button" data-act="cheque">چک برای او</button>
        <button class="icon-btn" type="button" data-act="edit" title="ویرایش" aria-label="ویرایش">✎</button>
        <button class="icon-btn" type="button" data-act="del" title="حذف" aria-label="حذف">✕</button></span></td></tr>`).join("")
    : `<tr><td colspan="6"><div class="empty" style="min-height:150px"><strong>${q ? "چیزی پیدا نشد" : "هنوز طرف حسابی ندارید"}</strong>
        <span>${q ? "جستجو را کوتاه‌تر کنید." : "با «+ طرف حساب» اضافه کنید، یا بعد از اولین چاپ خودشان اضافه می‌شوند."}</span></div></td></tr>`;
}
$("#pSearch").addEventListener("input", renderPayees);
function openPayee(p) {
  payeeEdit = p || null;
  $("#pyTitle").textContent = p ? "ویرایش طرف حساب" : "طرف حساب تازه";
  $("#pyName").value = p ? p.name : ""; $("#pyId").value = p ? p.nid : ""; $("#pyPhone").value = p ? p.phone : "";
  $("#pyReason").value = p ? p.reason : ""; $("#pyNote").value = p ? p.note : ""; pyIdHint();
  modal.open("payeeModal"); setTimeout(() => $("#pyName").focus(), 50);
}
function pyIdHint() { const r = checkId(digitsOnly($("#pyId").value)); $("#pyIdHint").className = "field-hint " + (r ? (r.ok ? "good" : "bad") : ""); $("#pyIdHint").textContent = r ? r.msg : ""; }
$("#pyId").addEventListener("input", e => { e.target.value = digitsOnly(e.target.value).slice(0, 11); pyIdHint(); });
$("#pAdd").addEventListener("click", () => openPayee(null));
$("#pySave").addEventListener("click", () => {
  const name = $("#pyName").value.trim(); if (!name) { toast("نام را بنویسید", "error"); return $("#pyName").focus(); }
  const other = findPayee(name); if (other && other !== payeeEdit) return toast("این نام از قبل در فهرست هست", "error");
  const o = { name, nid: digitsOnly($("#pyId").value), phone: toEn($("#pyPhone").value.trim()), reason: $("#pyReason").value.trim(), note: $("#pyNote").value.trim() };
  if (payeeEdit) Object.assign(payeeEdit, o); else S.payees.push({ id: uid(), ...o });
  save(); modal.close("payeeModal"); renderPayees(); renderForm(); toast("ذخیره شد", "success");
});
$("#pBody").addEventListener("click", e => {
  const tr = e.target.closest("tr[data-id]"), act = e.target.closest("[data-act]")?.dataset.act; if (!tr || !act) return;
  const p = S.payees.find(x => x.id === tr.dataset.id);
  if (act === "edit") openPayee(p);
  if (act === "cheque") {
    const c = cur(), n = { ...blankCheque(c.date, c.bank, c.tpl), payee: p.name, payeeId: p.nid, reason: p.reason };
    S.queue.push(n); S.cur = n.id; save(); renderAll(); go("issue"); fAmount.focus();
  }
  if (act === "del") {
    const at = S.payees.indexOf(p); S.payees.splice(at, 1); save(); renderPayees();
    offerUndo(`«${p.name}» از طرف حساب‌ها حذف شد`, () => S.payees.splice(at, 0, p));
  }
});

/* ================= register of issued cheques ================= */
const ST_FA = { issued: "صادرشده", cleared: "وصول‌شده", bounced: "برگشتی", void: "باطل" };
const R = { preset: "all", from: "", to: "", q: "", bank: "", status: "" };
const canManage = () => MODE !== "server" || (ME && ME.role === "manager");
function dueInfo() {
  const t = todayJ(), today = gIsoOf(t), end = gIsoOf(d2j(jdnOf(t) + (+S.settings.remindDays || 0)));
  const open = S.issued.filter(r => r.status === "issued");
  return { overdue: open.filter(r => r.due_on && r.due_on < today), soon: open.filter(r => r.due_on >= today && r.due_on <= end), today, end };
}
function presetRange(p) {
  const t = todayJ();
  if (p === "month") return [dateStr({ ...t, d: 1 }), dateStr({ ...t, d: monthLen(t.y, t.m) })];
  if (p === "next") { const n = addMonths({ ...t, d: 1 }, 1); return [dateStr(n), dateStr({ ...n, d: monthLen(n.y, n.m) })]; }
  if (p === "due") return [dateStr(t), dateStr(d2j(jdnOf(t) + (+S.settings.remindDays || 0)))];
  if (p === "overdue") return ["", dateStr(d2j(jdnOf(t) - 1))];
  return ["", ""];
}
function setPreset(p) {
  R.preset = p; [R.from, R.to] = presetRange(p);
  R.status = p === "due" || p === "overdue" ? "issued" : R.status && p === "all" ? "" : R.status;
  $("#rFrom").value = toFa(R.from); $("#rTo").value = toFa(R.to); $("#rStatus").value = R.status;
  document.querySelectorAll("#rPreset .tab").forEach(b => b.classList.toggle("active", b.dataset.p === p));
  renderReports();
}
function filtered() {
  const q = toEn(R.q.trim()).toLowerCase(), from = R.from && parseJ(R.from) ? dateStr(parseJ(R.from)) : "", to = R.to && parseJ(R.to) ? dateStr(parseJ(R.to)) : "";
  return S.issued.filter(r => (!from || r.due_date >= from) && (!to || r.due_date <= to) && (!R.bank || r.bank === R.bank) && (!R.status || r.status === R.status)
    && (!q || [r.payee, r.payee_id, r.sayad, r.reason, r.note].join(" ").toLowerCase().includes(q)))
    .sort((a, b) => a.due_on < b.due_on ? -1 : a.due_on > b.due_on ? 1 : 0);
}
const sumOf = rows => rows.reduce((a, r) => a + BigInt(r.amount || 0), 0n);
function renderReports() {
  const banks = [...new Set(S.issued.map(r => r.bank).filter(Boolean))].sort();
  const keep = R.bank; $("#rBank").innerHTML = `<option value="">همه</option>` + banks.map(b => `<option ${b === keep ? "selected" : ""}>${esc(b)}</option>`).join("");
  const rows = filtered(), { today, end } = dueInfo();
  const open = rows.filter(r => r.status === "issued"), bounced = rows.filter(r => r.status === "bounced");
  $("#rCount").textContent = toFa(rows.length); $("#rCountS").textContent = `${toFa(rows.filter(r => r.status === "cleared").length)} وصول‌شده`;
  $("#rSum").textContent = faMoney(sumOf(rows).toString()); $("#rSumS").textContent = rows.length ? `میانگین ${faMoney((sumOf(rows) / BigInt(rows.length)).toString())}` : "";
  $("#rOpen").textContent = faMoney(sumOf(open).toString()); $("#rOpenS").textContent = `${toFa(open.length)} برگ`;
  $("#rBounced").textContent = toFa(bounced.length); $("#rBouncedS").textContent = bounced.length ? faMoney(sumOf(bounced).toString()) + " ریال" : "";
  const del = canManage();
  $("#rBody").innerHTML = rows.length ? rows.map(r => {
    const cls = r.status === "issued" ? (r.due_on < today ? "overdue" : r.due_on <= end ? "soon" : "") : "";
    return `<tr class="${cls}" data-id="${r.id}">
      <td class="mono">${toFa(r.due_date)}</td>
      <td><b>${esc(r.payee || "—")}</b>${r.payee_id ? `<div class="muted mono" style="font-size:11px">${toFa(r.payee_id)}</div>` : ""}</td>
      <td>${esc(r.bank || "—")}${r.serial ? `<div class="muted mono" style="font-size:11px">سریال ${toFa(r.serial)}</div>` : ""}</td><td class="num">${faMoney(r.amount)}</td>
      <td class="muted" style="white-space:normal;max-width:220px">${esc(r.reason || "")}${r.note ? " — " + esc(r.note) : ""}</td>
      <td><select class="st ${r.status}" data-act="status" aria-label="وضعیت">${Object.entries(ST_FA).map(([k, v]) => `<option value="${k}" ${k === r.status ? "selected" : ""}>${v}</option>`).join("")}</select></td>
      <td class="muted" style="font-size:11px">${r.printed_label ? toFa(r.printed_label) : isoToFa(r.printed_at)}${r.printed_by_name ? "<br>" + esc(r.printed_by_name) : ""}</td>
      <td><span class="row"><button class="btn sm" type="button" data-act="receipt">رسید</button>
        <button class="icon-btn" type="button" data-act="copy" title="کپی به صف چاپ" aria-label="کپی به صف چاپ">⧉</button>
        ${del ? `<button class="icon-btn" type="button" data-act="del" title="حذف از فهرست" aria-label="حذف">✕</button>` : ""}</span></td></tr>`;
  }).join("")
    : `<tr><td colspan="8"><div class="empty" style="min-height:150px"><strong>${S.issued.length ? "با این فیلترها چیزی نیست" : "هنوز چکی ثبت نشده"}</strong>
        <span>${S.issued.length ? "فیلترها را باز کنید یا «همه» را بزنید." : "بعد از هر چاپ، با «بله، ثبت کن» چک این‌جا می‌آید."}</span></div></td></tr>`;
  renderDue();
}
function readFilters() { R.from = $("#rFrom").value; R.to = $("#rTo").value; R.q = $("#rQ").value; R.bank = $("#rBank").value; R.status = $("#rStatus").value; renderReports(); }
for (const id of ["#rFrom", "#rTo", "#rQ"]) $(id).addEventListener("input", () => { R.preset = ""; document.querySelectorAll("#rPreset .tab").forEach(b => b.classList.remove("active")); readFilters(); });
for (const id of ["#rBank", "#rStatus"]) $(id).addEventListener("change", readFilters);
$("#rPreset").addEventListener("click", e => { const b = e.target.closest(".tab"); if (b) setPreset(b.dataset.p); });
function issuedToCheque(r) {
  const code = Object.keys(BANKS).find(c => bankName(c) === r.bank) || cur().bank;
  return { ...blankCheque(parseJ(r.due_date) || todayJ(), code, ""), amount: r.amount, payee: r.payee, payeeId: r.payee_id, reason: r.reason, sayad: r.sayad, note: r.note };
}
async function setStatus(r, status) {
  if (MODE === "server") Object.assign(r, await api("PATCH", `/api/cheque/issued/${r.id}`, { status }));
  else { r.status = status; save(); }
}
$("#rBody").addEventListener("change", e => {
  if (e.target.dataset.act !== "status") return;
  const r = S.issued.find(x => String(x.id) === e.target.closest("tr").dataset.id), was = r.status, now = e.target.value;
  setStatus(r, now).then(() => { renderReports(); offerUndo(`وضعیت «${r.payee}»: ${ST_FA[now]}`, () => setStatus(r, was).then(renderReports)); },
    err => { toast(err.message, "error"); renderReports(); });
});
$("#rBody").addEventListener("click", e => {
  const tr = e.target.closest("tr[data-id]"), act = e.target.closest("button[data-act]")?.dataset.act; if (!tr || !act) return;
  const r = S.issued.find(x => String(x.id) === tr.dataset.id);
  if (act === "receipt") printReceipt(issuedToCheque(r), r.bank);
  if (act === "copy") { const c = issuedToCheque(r); S.queue.push(c); S.cur = c.id; save(); renderAll(); go("issue"); toast("در صف چاپ گذاشته شد؛ تاریخ و مبلغ را بررسی کنید"); }
  if (act === "del") confirmDo("این چک از فهرست حذف شود؟", "فقط ردیف فهرست پاک می‌شود و برای گزارش‌ها و یادآوری دیگر حساب نمی‌شود. برای چک لغوشده بهتر است وضعیت را «باطل» کنید.", "حذف ردیف", async () => {
    try { if (MODE === "server") await api("DELETE", `/api/cheque/issued/${r.id}`); S.issued = S.issued.filter(x => x !== r); save(); renderReports(); toast("حذف شد"); }
    catch (err) { toast(err.message, "error"); }
  });
});
function csvOf(rows) {
  const head = ["due_date", "payee", "payee_id", "bank", "serial", "amount_rial", "reason", "note", "sayad", "status", "printed_at", "printed_by"];
  return "﻿" + [head].concat(rows.map(r => [r.due_date, r.payee, r.payee_id, r.bank, r.serial || "", r.amount, r.reason, r.note, r.sayad, ST_FA[r.status], r.printed_label || isoToFa(r.printed_at), r.printed_by_name || ""]))
    .map(x => x.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
}
$("#rCsv").addEventListener("click", () => { const rows = filtered(); if (!rows.length) return toast("فهرست خالی است"); download(`cheques-${toEn(dateStr(todayJ())).replace(/\//g, "-")}.csv`, csvOf(rows), "text/csv;charset=utf-8"); });
$("#rPrint").addEventListener("click", () => {
  const rows = filtered(); if (!rows.length) return toast("فهرست خالی است");
  const filt = [R.from && "از " + toFa(R.from), R.to && "تا " + toFa(R.to), R.bank, R.status && ST_FA[R.status], R.q && `«${R.q}»`].filter(Boolean).join("، ") || "همهٔ چک‌ها";
  printPage("A4 landscape", 297, 210, `<div class="rp-page"><h1>گزارش چک‌های صادره</h1><div class="sub">${esc(filt)} — تهیه: ${toFa(dateStr(todayJ()))}${ME ? "، " + esc(ME.name) : ""}</div>
    <table><thead><tr><th>#</th><th>سررسید</th><th>در وجه</th><th>کد ملی</th><th>بانک</th><th>مبلغ (ریال)</th><th>بابت</th><th>صیاد</th><th>وضعیت</th></tr></thead>
    <tbody>${rows.map((r, i) => `<tr><td>${toFa(i + 1)}</td><td>${toFa(r.due_date)}</td><td>${esc(r.payee)}</td><td>${toFa(r.payee_id || "")}</td><td>${esc(r.bank)}</td>
      <td>${faMoney(r.amount)}</td><td>${esc(r.reason)}</td><td>${toFa(r.sayad || "")}</td><td>${ST_FA[r.status]}</td></tr>`).join("")}</tbody>
    <tfoot><tr><td colspan="5">جمع ${toFa(rows.length)} برگ</td><td>${faMoney(sumOf(rows).toString())}</td><td colspan="3">${esc(toWords(sumOf(rows).toString()))} ریال</td></tr></tfoot></table></div>`);
});

/* due-date reminders inside the page */
function renderDue() {
  const { overdue, soon } = dueInfo(), rv = recvDue(), n = overdue.length + soon.length, rn = rv.overdue.length + rv.soon.length, days = toFa(+S.settings.remindDays || 0);
  $("#dueBadge").hidden = !n; $("#dueBadge").textContent = toFa(n);
  $("#recvBadge").hidden = !rn; $("#recvBadge").textContent = toFa(rn);
  const low = S.books.filter(b => bookLeft(b) <= 3);
  $("#bookBadge").hidden = !low.length; $("#bookBadge").textContent = "!";
  const strip = $("#dueStrip"); strip.hidden = !n && !rn && !low.length;
  if (strip.hidden) return;
  const parts = [overdue.length && `<b>${toFa(overdue.length)} چک صادره</b> سررسیدش گذشته و هنوز «وصول‌شده» نخورده`,
    soon.length && `<b>${toFa(soon.length)} چک صادره</b> تا ${days} روز آینده سررسید دارد (${faMoney(sumOf(soon).toString())} ریال)`,
    rn && `<b>${toFa(rn)} چک دریافتی</b> سررسید دارد یا گذشته و هنوز وصول نشده (${faMoney(sumOf(rv.overdue.concat(rv.soon)).toString())} ریال)`,
    low.length && `دسته‌چک <b>${low.map(b => esc(b.title)).join("، ")}</b> رو به اتمام است`].filter(Boolean);
  strip.innerHTML = `<span class="grow">🔔 ${parts.join("؛ ")}.</span>`
    + (n ? `<button class="btn sm primary" type="button" data-due="out">صادره‌ها</button>` : "")
    + (rn ? `<button class="btn sm primary" type="button" data-due="in">دریافتی‌ها</button>` : "")
    + (low.length ? `<button class="btn sm" type="button" data-due="books">دسته‌چک‌ها</button>` : "");
  strip.onclick = e => {
    const b = e.target.closest("[data-due]"); if (!b) return;
    if (b.dataset.due === "out") { go("reports"); setPreset(overdue.length ? "overdue" : "due"); }
    if (b.dataset.due === "in") { go("received"); setRvPreset(rv.overdue.length ? "overdue" : "due"); }
    if (b.dataset.due === "books") go("books");
  };
}

/* ================= printing helpers: receipt, report ================= */
function printPage(size, w, h, html) {
  const root = $("#print-root"); root.innerHTML = `<div class="pg" style="width:${w}mm;height:${h}mm">${html}</div>`;
  $("#pageStyle").textContent = `@page{size:${size};margin:0}`;
  return (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => { window.print(); root.innerHTML = ""; });
}
const RC_TAGS = { payee: "نام گیرنده", payeeId: "کد ملی", amount: "مبلغ", amountWords: "مبلغ به حروف", dueDate: "سررسید", dueWords: "سررسید به حروف", bank: "بانک", sayad: "شناسهٔ صیاد", reason: "بابت", today: "تاریخ امروز", org: "سازمان" };
function receiptHtml(ch, bankLabel) {
  const rc = S.settings.receipt, v = {
    payee: ch.payee || "……", payeeId: toFa(ch.payeeId || "……"), amount: faMoney(ch.amount), amountWords: ch.amount ? toWords(ch.amount) : "……",
    dueDate: toFa(dateStr(ch.date)), dueWords: dateWords(ch.date), bank: bankLabel || bankName(ch.bank), sayad: toFa(ch.sayad || "……"), reason: ch.reason || "……",
    today: toFa(dateStr(todayJ())), org: rc.org || "……" };
  const body = esc(rc.body).replace(/\{(\w+)\}/g, (m, k) => v[k] != null ? `<b>${esc(v[k])}</b>` : m);
  const [w, h] = rc.paper === "A4" ? [210, 297] : [148, 210];
  return { w, h, size: rc.paper, html: `<div class="rc-page" style="width:${w}mm;height:${h}mm">
    <h1>${esc(rc.title)}</h1>${rc.org ? `<div class="org">${esc(rc.org)}</div>` : ""}
    <div class="meta"><span>تاریخ: ${v.today}</span><span>شمارهٔ صیاد: ${v.sayad}</span></div>
    <p>${body}</p>
    <table><tr><th>در وجه</th><td>${esc(v.payee)}</td></tr><tr><th>کد / شناسهٔ ملی</th><td>${v.payeeId}</td></tr>
      <tr><th>مبلغ</th><td>${v.amount} ریال<br><small>${esc(v.amountWords)} ریال</small></td></tr>
      <tr><th>سررسید</th><td>${v.dueDate} (${esc(v.dueWords)})</td></tr><tr><th>بانک</th><td>${esc(v.bank)}</td></tr><tr><th>بابت</th><td>${esc(v.reason)}</td></tr></table>
    <div class="rc-signs"><div>${esc(rc.signA)}</div><div>${esc(rc.signB)}</div></div></div>` };
}
function printReceipt(ch, bankLabel) {
  if (!ch.amount || !ch.payee) return toast("برای رسید، مبلغ و گیرنده لازم است", "error");
  const r = receiptHtml(ch, bankLabel); printPage(r.size, r.w, r.h, r.html);
}
$("#btnReceipt").addEventListener("click", () => printReceipt(cur()));

/* ================= settings ================= */
const RC_FIELDS = { rcTitle: "title", rcOrg: "org", rcBody: "body", rcSignA: "signA", rcSignB: "signB", rcPaper: "paper" };
function renderSettings() {
  $("#setMode").textContent = MODE === "server"
    ? `داده‌ها روی سرور ${CFG.serverName} ذخیره می‌شود و بین همهٔ کاربران ${CFG.product} مشترک است. شما: ${ME.name} (${ME.role === "manager" ? "مدیر" : "کاربر"}).`
    : BOOT_NOTE === "login" ? `حالت محلی: داده‌ها فقط در همین مرورگر است. برای کار مشترک و یادآوری، اول وارد ${CFG.serverName} شوید.`
    : BOOT_NOTE === "forbidden" ? `حالت محلی: شما هنوز به ${CFG.product} سرور دسترسی ندارید؛ از مدیر بخواهید شما را اضافه کند.`
    : `حالت محلی: داده‌ها فقط در همین مرورگر است. برای کار چندکاربره، ${CFG.product} را از نشانی ‎/cheque‎ روی سرور ODiQ باز کنید.`;
  const rc = S.settings.receipt;
  for (const id in RC_FIELDS) if (document.activeElement !== $("#" + id)) $("#" + id).value = rc[RC_FIELDS[id]] || "";
  $("#rcTags").innerHTML = Object.entries(RC_TAGS).map(([k, v]) => `<code data-tag="${k}" title="${v}">{${k}}</code>`).join("");
  $("#remDays").value = S.settings.remindDays; $("#autoPayee").checked = !!S.settings.autoPayee;
  renderHolidays();
  const mgr = MODE === "server" && ME.role === "manager";
  $("#baleBox").hidden = !mgr; $("#baleLocal").hidden = MODE === "server";
  $("#membersCard").hidden = !mgr;
  $("#bkNote").textContent = MODE === "server"
    ? (mgr ? "فایل پشتیبان همهٔ قالب‌ها (با تصویرشان)، طرف حساب‌ها، تنظیمات و فهرست چک‌های صادره را دارد. بازگردانی، این‌ها را روی سرور جایگزین می‌کند." : `پشتیبان‌گیری و بازگردانی با مدیر ${CFG.product} است.`)
    : "فایل پشتیبان همه‌چیز این مرورگر را دارد: قالب‌ها و تصویرشان، طرف حساب‌ها، صف، تنظیمات و چک‌های صادره. هر چند وقت یک بار بگیرید.";
  $("#bkSave").disabled = MODE === "server" && !mgr; $("#bkFile").disabled = MODE === "server" && !mgr;
  if (mgr && !settingsLoaded) { settingsLoaded = true; loadMembers(); loadBale(); }
  $("#bkMove").hidden = !(MODE === "server" && hasLocalData());
}
let settingsLoaded = false;
for (const id in RC_FIELDS) $("#" + id).addEventListener("input", e => { S.settings.receipt[RC_FIELDS[id]] = e.target.value; save(); });
$("#rcTags").addEventListener("click", e => {
  const tag = e.target.closest("[data-tag]"); if (!tag) return;
  const ta = $("#rcBody"), at = ta.selectionStart ?? ta.value.length, ins = `{${tag.dataset.tag}}`;
  ta.value = ta.value.slice(0, at) + ins + ta.value.slice(ta.selectionEnd ?? at); ta.focus(); ta.selectionStart = ta.selectionEnd = at + ins.length;
  S.settings.receipt.body = ta.value; save();
});
$("#rcPreview").addEventListener("click", () => { const c = cur().amount && cur().payee ? cur() : { ...sampleCheque(), sayad: "1234567890123456", payeeId: "0499370899" }; printReceipt(c); });
$("#remDays").addEventListener("input", e => { S.settings.remindDays = Math.max(0, Math.min(60, +digitsOnly(e.target.value) || 0)); save(); renderDue(); });
$("#autoPayee").addEventListener("change", e => { S.settings.autoPayee = e.target.checked ? 1 : 0; save(); });

async function loadMembers() {
  if (CFG.standalone) return loadUsers();
  try {
    const { items } = await api("GET", "/api/cheque/members");
    $("#mBody").innerHTML = items.filter(m => m.active).map(m => `<tr data-id="${m.id}"><td>${esc(m.name)}</td><td class="mono">${esc(m.username)}</td>
      <td><select data-act="role" ${m.fixed || m.id === ME.id ? "disabled" : ""} aria-label="دسترسی ${esc(m.name)}">
        <option value="" ${!m.role ? "selected" : ""}>بدون دسترسی</option><option value="operator" ${m.role === "operator" ? "selected" : ""}>کاربر</option>
        <option value="manager" ${m.role === "manager" ? "selected" : ""}>مدیر</option></select></td></tr>`).join("");
  } catch (e) { $("#mBody").innerHTML = `<tr><td colspan="3" class="bad">${esc(e.message)}</td></tr>`; }
}
async function loadUsers() {          // standalone: create accounts, change role, deactivate, reset password
  $("#membersCard .card-hint").textContent = "";
  $("#membersCard .card-note").textContent = "«کاربر» چک می‌نویسد، چاپ می‌کند و وضعیت چک‌ها را عوض می‌کند. «مدیر» افزون بر این، کاربران، یادآوری‌ها، پشتیبان و بازگردانی را هم در اختیار دارد.";
  $("#membersCard thead").innerHTML = "<tr><th>نام</th><th>نام کاربری</th><th>نقش</th><th>وضعیت</th><th></th></tr>";
  try {
    const { items } = await api("GET", "/api/users");
    $("#mBody").innerHTML = items.map(u => `<tr data-id="${u.id}"><td>${esc(u.name)}</td><td class="mono">${esc(u.username)}</td>
      <td><select data-act="urole" ${u.id === ME.id ? "disabled" : ""} aria-label="نقش ${esc(u.name)}"><option value="operator" ${u.role === "operator" ? "selected" : ""}>کاربر</option><option value="manager" ${u.role === "manager" ? "selected" : ""}>مدیر</option></select></td>
      <td><label class="switch"><input type="checkbox" data-act="uactive" ${u.active ? "checked" : ""} ${u.id === ME.id ? "disabled" : ""}><span class="toggle-switch"></span> ${u.active ? "فعال" : "غیرفعال"}</label></td>
      <td><button class="btn sm" type="button" data-act="upass">رمز تازه</button></td></tr>`).join("")
      + `<tr class="add-user"><td><input id="nuName" placeholder="نام و نام خانوادگی"></td><td><input class="num" id="nuUser" placeholder="نام کاربری لاتین"></td>
         <td><select id="nuRole"><option value="operator">کاربر</option><option value="manager">مدیر</option></select></td>
         <td><input class="num" id="nuPass" type="password" autocomplete="new-password" placeholder="رمز (۸ نویسه)"></td>
         <td><button class="btn sm primary" type="button" data-act="uadd">+ افزودن</button></td></tr>`;
  } catch (e) { $("#mBody").innerHTML = `<tr><td colspan="5" class="bad">${esc(e.message)}</td></tr>`; }
}
$("#mBody").addEventListener("click", async e => {
  const act = e.target.closest("[data-act]")?.dataset.act; if (!CFG.standalone || !act) return;
  try {
    if (act === "uadd") {
      await api("POST", "/api/users", { name: $("#nuName").value.trim(), username: $("#nuUser").value.trim(), role: $("#nuRole").value, password: $("#nuPass").value });
      toast("کاربر ساخته شد", "success"); loadUsers();
    }
    if (act === "upass") {
      const id = e.target.closest("tr").dataset.id, pw = Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6).toUpperCase();
      confirmDo("رمز تازه بسازد؟", `رمز این کاربر به «${pw}» عوض می‌شود و از همهٔ دستگاه‌ها بیرون می‌رود. رمز را یادداشت کنید و به خودش بدهید.`, "عوض کن", async () => {
        try { await api("PATCH", `/api/users/${id}`, { password: pw }); toast("رمز عوض شد", "success"); } catch (err) { toast(err.message, "error"); }
      });
    }
  } catch (err) { toast(err.message, "error"); }
});
$("#mBody").addEventListener("change", async e => {
  const act = e.target.dataset.act;
  if (CFG.standalone && (act === "urole" || act === "uactive")) {
    const id = e.target.closest("tr").dataset.id, body = act === "urole" ? { role: e.target.value } : { active: e.target.checked };
    try { await api("PATCH", `/api/users/${id}`, body); toast("به‌روز شد", "success"); } catch (err) { toast(err.message, "error"); }
    return loadUsers();
  }
  const tr = e.target.closest("tr"); if (act !== "role") return;
  try { await api("PUT", `/api/cheque/members/${tr.dataset.id}`, { role: e.target.value || null }); toast("دسترسی به‌روز شد", "success"); }
  catch (err) { toast(err.message, "error"); loadMembers(); }
});
async function loadBale() {
  try {
    const b = await api("GET", "/api/cheque/reminders");
    $("#bEnabled").checked = b.enabled; $("#bHour").value = b.hour; $("#bChats").value = b.chat_ids.join(", ");
    $("#bToken").placeholder = b.has_token ? "ذخیره شده؛ برای عوض کردن بنویسید" : "توکن ربات از BotFather";
    $("#bState").textContent = b.last_sent ? `آخرین ارسال: ${toFa(b.last_sent)}` : "";
    $("#sProvider").innerHTML = Object.entries(b.providers || {}).map(([k, v]) => `<option value="${k}" ${k === b.sms_provider ? "selected" : ""}>${esc(v)}</option>`).join("");
    $("#sEnabled").checked = b.sms_enabled; $("#sSender").value = b.sms_sender; $("#sNumbers").value = b.sms_numbers.join(", ");
    $("#sKey").placeholder = b.has_sms_key ? "ذخیره شده؛ برای عوض کردن بنویسید" : "کلید API از پنل پیامک";
    S.settings.remindDays = S.settings.remindDays ?? b.days;
  } catch (e) { $("#bState").textContent = e.message; }
}
function baleBody() {                     // Bale and SMS settings travel together
  return { enabled: $("#bEnabled").checked, hour: +digitsOnly($("#bHour").value) || 9, days: +S.settings.remindDays || 3, token: $("#bToken").value.trim(),
    chat_ids: toEn($("#bChats").value).split(/[,،\s]+/).filter(Boolean),
    sms_enabled: $("#sEnabled").checked, sms_provider: $("#sProvider").value || "kavenegar", sms_key: $("#sKey").value.trim(),
    sms_sender: toEn($("#sSender").value), sms_numbers: toEn($("#sNumbers").value).split(/[,،\s]+/).filter(Boolean) };
}
$("#smsSave").addEventListener("click", async () => {
  try { await api("PUT", "/api/cheque/reminders", baleBody()); $("#sKey").value = ""; await loadBale(); toast("تنظیم پیامک ذخیره شد", "success"); }
  catch (e) { toast(e.message, "error"); }
});
$("#smsTest").addEventListener("click", async () => {
  try { await api("PUT", "/api/cheque/reminders", baleBody()); $("#sKey").value = ""; const r = await api("POST", "/api/cheque/reminders/test", { channel: "sms" }); toast(`پیامک به ${toFa(r.sent)} شماره فرستاده شد`, "success"); loadBale(); }
  catch (e) { toast(e.message, "error"); }
});
$("#bSave").addEventListener("click", async () => {
  try { await api("PUT", "/api/cheque/reminders", baleBody()); $("#bToken").value = ""; await loadBale(); toast("یادآوری بله ذخیره شد", "success"); }
  catch (e) { toast(e.message, "error"); }
});
$("#bDiscover").addEventListener("click", async () => {
  try {
    const { items } = await api("POST", "/api/cheque/reminders/discover", { token: $("#bToken").value.trim() });
    $("#bFound").innerHTML = items.length ? items.map(c => `<button class="chip" type="button" data-chat="${esc(c.id)}">${esc(c.name || c.id)} <span class="mono">${esc(c.id)}</span></button>`).join("")
      : `<span class="field-hint">گفتگویی پیدا نشد. اول در بله به ربات (یا در گروهی که ربات عضو آن است) یک پیام بدهید.</span>`;
  } catch (e) { toast(e.message, "error"); }
});
$("#bFound").addEventListener("click", e => {
  const c = e.target.closest("[data-chat]"); if (!c) return;
  const list = toEn($("#bChats").value).split(/[,،\s]+/).filter(Boolean); if (!list.includes(c.dataset.chat)) list.push(c.dataset.chat);
  $("#bChats").value = list.join(", "); toast("اضافه شد؛ «ذخیره» را بزنید");
});
$("#bTest").addEventListener("click", async () => {
  try { await api("PUT", "/api/cheque/reminders", baleBody()); const r = await api("POST", "/api/cheque/reminders/test", { channel: "bale" }); toast(`به ${toFa(r.sent)} گفتگو فرستاده شد`, "success"); loadBale(); }
  catch (e) { toast(e.message, "error"); }
});

/* backup / restore */
function hasLocalData() { try { return !!localStorage.getItem(KEY); } catch (e) { return false; } }
$("#bkMove").addEventListener("click", () => {
  let st; try { st = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) {}
  if (!st) return toast("دادهٔ محلی پیدا نشد");
  const images = {}; for (const t of st.templates || []) { try { const i = localStorage.getItem(IMG + t.id); if (i) images[t.id] = i; } catch (e) {} }
  confirmDo("داده‌های این مرورگر به سرور برود؟", "قالب‌های ساخته‌شده و تنظیم‌شده، طرف حساب‌ها و چک‌های صادره‌ای که پیش‌تر در همین مرورگر ثبت شده به داده‌های مشترک سرور اضافه می‌شود.", "انتقال", async () => {
    await importLocal({ state: st, images });
    try { localStorage.setItem(KEY + ".moved", localStorage.getItem(KEY)); localStorage.removeItem(KEY); } catch (e) {}
    renderSettings();
  });
});
$("#bkSave").addEventListener("click", async () => {
  const stamp = toEn(dateStr(todayJ())).replace(/\//g, "-");
  try {
    if (MODE === "server") return download(`chequenegar-backup-${stamp}.json`, JSON.stringify(await api("GET", "/api/cheque/backup")), "application/json");
    const images = {}; for (const t of S.templates) { const i = getImg(t); if (i) images[t.id] = i; }
    download(`chequenegar-backup-${stamp}.json`, JSON.stringify({ chequenegar_local: 1, created_at: new Date().toISOString(), state: S, images }), "application/json");
  } catch (e) { toast(e.message, "error"); }
});
$("#bkFile").addEventListener("change", e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    let o; try { o = JSON.parse(rd.result); } catch (err) { return toast(`این فایل پشتیبان ${CFG.product} نیست`, "error"); }
    if (MODE === "server" && o.chequenegar_backup === 1)
      return confirmDo("بازگردانی روی سرور؟", "قالب‌ها، طرف حساب‌ها، تنظیمات و فهرست چک‌های صادرهٔ سرور با محتوای این فایل جایگزین می‌شود. صف چاپ شخصی کاربران دست نمی‌خورد.", "جایگزین کن", async () => {
        try { const r = await api("POST", "/api/cheque/restore", o); toast(`${toFa(r.docs)} سند و ${toFa(r.issued)} چک بازگردانی شد`, "success"); await bootServer(); renderAll(); }
        catch (err) { toast(err.message, "error"); }
      });
    if (o.chequenegar_local === 1 && MODE === "server")
      return confirmDo("انتقال پشتیبان محلی به سرور؟", "قالب‌ها، طرف حساب‌ها و چک‌های صادرهٔ این فایل به داده‌های سرور اضافه می‌شود (چیزی پاک نمی‌شود).", "اضافه کن", () => importLocal(o));
    if (o.chequenegar_local === 1)
      return confirmDo("بازگردانی پشتیبان؟", "همهٔ داده‌های این مرورگر با محتوای فایل جایگزین می‌شود.", "جایگزین کن", () => {
        S = o.state; normalize(); for (const id in o.images || {}) { try { localStorage.setItem(IMG + id, o.images[id]); } catch (err) {} }
        saveLocal(); renderAll(); toast("بازگردانی شد", "success");
      });
    toast(o.chequenegar_backup === 1 ? "این پشتیبان سرور است؛ فقط مدیر روی سرور می‌تواند بازگردانی‌اش کند" : `این فایل پشتیبان ${CFG.product} نیست`, "error");
  };
  rd.readAsText(f);
});
async function importLocal(o) {           // a browser's local data joins the shared server data
  try {
    const st = o.state || {}, have = new Set(S.templates.map(t => t.id));
    for (const t of st.templates || []) if ((t.kind === "custom" || t.tuned) && !have.has(t.id)) { const c = clone(t); if (o.images && o.images[t.id]) c.img = o.images[t.id]; S.templates.push(c); }
    for (const p of st.payees || []) upsertPayee({ name: p.name, nid: p.nid, phone: p.phone, reason: p.reason, note: p.note });
    for (const b of st.books || []) if (!S.books.find(x => x.id === b.id)) S.books.push(clone(b));
    for (const r of st.received || []) if (r.amount && parseJ(r.due_date)) S.received.unshift(await api("POST", "/api/cheque/received", { ...r, due_on: r.due_on || gIsoOf(r.due_date) }));
    const tmp = { issued: st.issued || [], history: st.history }; if (tmp.history) { const keep = S; S = tmp; normalize(); const items = S.issued; S = keep; tmp.issued = items; }
    const items = tmp.issued.filter(r => r.amount && parseJ(r.due_date)).map(r => ({ ...r, due_on: r.due_on || gIsoOf(r.due_date) }));
    if (items.length) S.issued = (await api("POST", "/api/cheque/issued", { items })).items.concat(S.issued);
    save(); renderAll(); toast("داده‌های محلی به سرور اضافه شد", "success");
  } catch (e) { toast(e.message, "error"); }
}

/* ================= official holidays ================= */
/* Solar dates are fixed; lunar ones come from the browser's Umm al-Qura calendar, which can be a day off
   from Iran's moon sighting, so settings let a manager switch a day off or add the announced one. */
const SOLAR_HOL = { "1/1": "نوروز", "1/2": "نوروز", "1/3": "نوروز", "1/4": "نوروز", "1/12": "روز جمهوری اسلامی", "1/13": "روز طبیعت",
  "3/14": "رحلت امام خمینی", "3/15": "قیام ۱۵ خرداد", "11/22": "پیروزی انقلاب اسلامی", "12/29": "ملی شدن صنعت نفت" };
const LUNAR_HOL = { "1/9": "تاسوعا", "1/10": "عاشورا", "2/20": "اربعین", "2/28": "رحلت پیامبر و شهادت امام حسن", "3/8": "شهادت امام حسن عسکری",
  "3/17": "میلاد پیامبر و امام صادق", "6/3": "شهادت حضرت فاطمه", "7/13": "ولادت امام علی", "7/27": "مبعث", "8/15": "ولادت امام زمان",
  "9/21": "شهادت امام علی", "10/1": "عید فطر", "10/2": "تعطیل عید فطر", "10/25": "شهادت امام صادق", "12/10": "عید قربان", "12/18": "عید غدیر" };
const hijriFmt = (() => {
  try { const f = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura-nu-latn", { day: "numeric", month: "numeric" }); f.formatToParts(new Date()); return f; }
  catch (e) { return null; }
})();
function hijriOf(jdn) {
  const g = d2g(jdn), parts = hijriFmt.formatToParts(new Date(g.gy, g.gm - 1, g.gd, 12));
  return { m: +parts.find(x => x.type === "month").value, d: +parts.find(x => x.type === "day").value };
}
const holCache = new Map();
function holidaysOf(y) {                  // Jalali year -> Map("yyyy/mm/dd" -> {title, lunar})
  if (holCache.has(y)) return holCache.get(y);
  const out = new Map();
  for (const k in SOLAR_HOL) { const [m, d] = k.split("/").map(Number); if (d <= monthLen(y, m)) out.set(dateStr({ y, m, d }), { title: SOLAR_HOL[k] }); }
  if (hijriFmt) {
    for (let jd = j2d(y, 1, 1), end = j2d(y + 1, 1, 1); jd < end; jd++) {
      const h = hijriOf(jd), ds = dateStr(d2j(jd)), t = LUNAR_HOL[h.m + "/" + h.d];
      if (t && !out.has(ds)) out.set(ds, { title: t, lunar: 1 });
      if (h.m === 2 && hijriOf(jd + 1).m === 3) out.set(ds, { title: "شهادت امام رضا", lunar: 1 });   // last day of Safar
    }
  }
  holCache.set(y, out); return out;
}
function holidayOf(d) {
  const ds = dateStr(d), H = S.settings.holidays || {};
  const added = (H.add || []).find(x => x.date === ds); if (added) return added.title || "تعطیل";
  if ((H.off || []).includes(ds)) return "";
  const h = holidaysOf(d.y).get(ds); return h ? h.title : "";
}
const isOffDay = d => weekday(d) === "جمعه" || !!holidayOf(d);
function nextWorkday(d) { let jd = jdnOf(d); for (let i = 0; i < 30; i++, jd++) { const x = d2j(jd); if (!isOffDay(x)) return x; } return d; }
let holYear = 0;
function renderHolidays() {
  const ty = todayJ().y; if (!holYear) holYear = ty;
  $("#holYear").innerHTML = [ty, ty + 1].map(y => `<button class="tab${y === holYear ? " active" : ""}" type="button" data-y="${y}">${toFa(y)}</button>`).join("");
  const H = S.settings.holidays, base = holidaysOf(holYear), rows = [];
  for (const [ds, h] of base) rows.push({ ds, title: h.title, lunar: h.lunar, off: (H.off || []).includes(ds) });
  for (const a of H.add || []) if (a.date.startsWith(holYear + "/")) rows.push({ ds: a.date, title: a.title, custom: 1 });
  rows.sort((a, b) => a.ds < b.ds ? -1 : 1);
  $("#holList").innerHTML = rows.map(r => `<label class="hol${r.off ? " off" : ""}">
      ${r.custom ? `<button class="icon-btn" type="button" data-del="${r.ds}" title="حذف" aria-label="حذف">✕</button>` : `<input type="checkbox" data-ds="${r.ds}" ${r.off ? "" : "checked"} aria-label="تعطیل ${esc(r.title)}">`}
      <span class="mono">${toFa(r.ds.slice(5))} ${weekday(parseJ(r.ds)).slice(0, 2)}</span><span>${esc(r.title)}</span>${r.lunar ? "<small>قمری</small>" : r.custom ? "<small>افزوده</small>" : ""}</label>`).join("")
    + (hijriFmt ? "" : `<div class="field-hint bad">این مرورگر تقویم قمری ندارد؛ فقط تعطیلات شمسی حساب شده است.</div>`);
}
$("#holYear").addEventListener("click", e => { const b = e.target.closest("[data-y]"); if (b) { holYear = +b.dataset.y; renderHolidays(); } });
$("#holList").addEventListener("change", e => {
  const ds = e.target.dataset.ds; if (!ds) return;
  const H = S.settings.holidays; H.off = (H.off || []).filter(x => x !== ds); if (!e.target.checked) H.off.push(ds);
  save(); renderHolidays(); renderFlags(); renderDate();
});
$("#holList").addEventListener("click", e => {
  const ds = e.target.closest("[data-del]")?.dataset.del; if (!ds) return;
  const H = S.settings.holidays; H.add = (H.add || []).filter(x => x.date !== ds); save(); renderHolidays(); renderFlags();
});
$("#holAdd").addEventListener("click", () => {
  const d = parseJ($("#holDate").value); if (!d) return toast("تاریخ را مثل ۱۴۰۵/۰۷/۲۳ بنویسید", "error");
  const H = S.settings.holidays, ds = dateStr(d);
  H.off = (H.off || []).filter(x => x !== ds); H.add = (H.add || []).filter(x => x.date !== ds).concat({ date: ds, title: $("#holTitle").value.trim() || "تعطیل" });
  holYear = d.y; $("#holDate").value = ""; $("#holTitle").value = ""; save(); renderHolidays(); renderFlags(); toast("تعطیل اضافه شد", "success");
});

/* ================= chequebooks ================= */
function leafList(b) {
  const start = +digitsOnly(b.from) || 0, width = String(b.from || "").length;
  return Array.from({ length: +b.count || 0 }, (_, i) => String(start + i).padStart(width, "0"));
}
function leafState(b, exceptId) {          // serial -> {s: used|queued|void, ...}
  const m = new Map();
  for (const r of S.issued) if (r.book_id === b.id && r.serial) m.set(r.serial, { s: "used", r });
  for (const c of S.queue) if (c.id !== exceptId && c.book === b.id && c.serial && !m.has(c.serial)) m.set(c.serial, { s: "queued", c });
  for (const v of b.void || []) if (!m.has(v)) m.set(v, { s: "void" });
  return m;
}
const nextFree = (b, exceptId) => { const st = leafState(b, exceptId); return leafList(b).find(x => !st.has(x)) || ""; };
const bookLeft = b => { const st = leafState(b); return leafList(b).filter(x => !st.has(x) || st.get(x).s === "queued").length; };
function leafProblem(ch) {
  if (!ch.book) return "";
  const b = S.books.find(x => x.id === ch.book); if (!b) return "";
  if (!ch.serial) return "سریال برگ خالی است";
  if (!leafList(b).includes(ch.serial)) return "سریال بیرون از این دسته‌چک";
  const st = leafState(b, ch.id).get(ch.serial);
  return !st ? "" : st.s === "used" ? "این برگ قبلاً چاپ شده" : st.s === "void" ? "این برگ باطل شده" : "این برگ در صف برای چک دیگری است";
}
function renderBookField() {
  const ch = cur(), b = S.books.find(x => x.id === ch.book);
  $("#fBook").innerHTML = `<option value="">— بدون دسته‌چک —</option>`
    + S.books.map(x => `<option value="${x.id}" ${x.id === ch.book ? "selected" : ""}>${esc(x.title)} (${toFa(bookLeft(x))} برگ)</option>`).join("")
    + `<option value="__new">+ تعریف دسته‌چک…</option>`;
  $("#fSerial").hidden = !b;
  if (document.activeElement !== $("#fSerial")) $("#fSerial").value = toFa(ch.serial || "");
  if (!b) { $("#bookHint").textContent = S.books.length ? "" : "با تعریف دسته‌چک، سریال برگ‌ها خودکار پر و شمرده می‌شود."; $("#bookHint").className = "field-hint"; return; }
  const list = leafList(b), pos = list.indexOf(ch.serial), left = bookLeft(b), prob = leafProblem(ch);
  $("#bookHint").className = "field-hint " + (prob ? "bad" : left <= 3 ? "bad" : "");
  $("#bookHint").textContent = prob || `برگ ${toFa(pos + 1)} از ${toFa(list.length)}، ${toFa(left)} برگ مانده${b.series ? `، سری ${toFa(b.series)}` : ""}${left <= 3 ? " — دسته‌چک رو به اتمام است" : ""}`;
}
$("#fBook").addEventListener("change", e => {
  const ch = cur(), v = e.target.value;
  if (v === "__new") { renderBookField(); go("books"); return openBook(null); }
  ch.book = v; const b = S.books.find(x => x.id === v);
  if (b) { ch.bank = b.bank; S.lastBank = b.bank; ch.tpl = b.tpl || ""; ch.serial = nextFree(b, ch.id); } else ch.serial = "";
  touched(); renderTplForm(); renderInspector();
});
$("#fSerial").addEventListener("input", e => { cur().serial = digitsOnly(e.target.value); renderBookField(); renderFlags(); save(); renderQueue(); });

function renderBooks() {
  $("#bookGrid").innerHTML = S.books.length ? S.books.map(b => {
    const st = leafState(b), list = leafList(b), used = list.filter(x => st.get(x)?.s === "used").length, voids = list.filter(x => st.get(x)?.s === "void").length, left = bookLeft(b);
    const bank = BANKS[b.bank] || {};
    return `<div class="card book" data-id="${b.id}">
      <div class="book-head"><div><b>${esc(b.title)}</b><div class="muted"><span class="bank-dot" style="display:inline-block;width:8px;height:8px;background:${bank.color};color:${bank.color};margin-inline-end:6px"></span>${esc(bankName(b.bank))}${b.account ? "، حساب " + toFa(b.account) : ""}</div>
        <div class="muted mono">${b.series ? "سری " + toFa(b.series) + "، " : ""}${toFa(list[0] || "")} تا ${toFa(list[list.length - 1] || "")}</div></div>
        <span class="status-pill ${left <= 3 ? "pill-warn" : "pill-ok"}"><span class="dot ${left <= 3 ? "err" : "ok"}"></span>${toFa(left)} برگ مانده</span></div>
      <div class="bar-track"><div class="bar" style="width:${list.length ? (used + voids) / list.length * 100 : 0}%"></div></div>
      <div class="leafs">${list.map(x => { const v = st.get(x), t = v?.s === "used" ? `${v.r.payee}، ${toFa(v.r.due_date)}` : v?.s === "queued" ? `در صف: ${v.c.payee || "بی‌گیرنده"}` : v?.s === "void" ? "باطل؛ برای برگرداندن بزنید" : "آزاد؛ برای ابطال بزنید";
        return `<button type="button" class="leaf ${v ? v.s : ""}" data-leaf="${x}" title="${esc(t)}">${toFa(x.slice(-4))}</button>`; }).join("")}</div>
      <div class="leaf-legend"><span><i style="background:var(--paper-3)"></i>آزاد</span><span><i style="background:color-mix(in srgb,var(--brand-green) 40%,transparent)"></i>چاپ‌شده ${toFa(used)}</span>
        <span><i style="background:color-mix(in srgb,var(--brand-blue) 40%,transparent)"></i>در صف</span><span><i style="background:color-mix(in srgb,var(--danger) 35%,transparent)"></i>باطل ${toFa(voids)}</span></div>
      <div class="row"><button class="btn sm primary" type="button" data-act="cheque" ${left ? "" : "disabled"}>چک از این دسته</button>
        <button class="btn sm" type="button" data-act="edit">ویرایش</button><button class="btn sm danger" type="button" data-act="del">حذف</button></div></div>`;
  }).join("")
    : `<div class="card"><div class="empty" style="min-height:180px"><strong>هنوز دسته‌چکی تعریف نکرده‌اید</strong>
        <span>بانک، سریال اولین برگ و تعداد برگ‌ها را بدهید؛ بعد در فرم چک، سریال برگ بعدی خودش پر می‌شود.</span>
        <button class="btn primary" type="button" id="bkAdd2">+ دسته‌چک</button></div></div>`;
  const add2 = $("#bkAdd2"); if (add2) add2.onclick = () => openBook(null);
}
$("#bookGrid").addEventListener("click", e => {
  const card = e.target.closest(".book"); if (!card) return;
  const b = S.books.find(x => x.id === card.dataset.id), leaf = e.target.closest("[data-leaf]"), act = e.target.closest("[data-act]")?.dataset.act;
  if (leaf) {
    const x = leaf.dataset.leaf, st = leafState(b).get(x); if (st && st.s !== "void") return;
    b.void = (b.void || []).filter(v => v !== x); if (!st) b.void.push(x);
    save(); renderBooks(); renderBookField(); renderDue();
    return toast(st ? `برگ ${toFa(x)} دوباره آزاد شد` : `برگ ${toFa(x)} باطل شد`);
  }
  if (act === "edit") openBook(b);
  if (act === "cheque") {
    const c = cur(), n = { ...blankCheque(c.date, b.bank, b.tpl || ""), book: b.id }; n.serial = nextFree(b, n.id);
    S.queue.push(n); S.cur = n.id; save(); renderAll(); go("issue"); fAmount.focus();
  }
  if (act === "del") {
    const at = S.books.indexOf(b); S.books.splice(at, 1);
    for (const c of S.queue) if (c.book === b.id) { c.book = ""; c.serial = ""; }
    save(); renderAll(); offerUndo(`دسته‌چک «${b.title}» حذف شد`, () => S.books.splice(at, 0, b));
  }
});
let bookEdit = null;
function openBook(b) {
  bookEdit = b;
  $("#bkTitle").textContent = b ? "ویرایش دسته‌چک" : "دسته‌چک تازه";
  $("#bkName").value = b ? b.title : ""; $("#bkBank").innerHTML = bankOptions(b ? b.bank : cur().bank);
  $("#bkAcc").value = b ? b.account || "" : ""; $("#bkSeries").value = b ? b.series || "" : ""; $("#bkFrom").value = b ? b.from : "";
  $("#bkCount").value = b ? String(b.count) : "25";
  if (![...$("#bkCount").options].some(o => o.value === $("#bkCount").value)) $("#bkCount").insertAdjacentHTML("beforeend", `<option>${b.count}</option>`), $("#bkCount").value = String(b.count);
  $("#bkTpl").innerHTML = `<option value="">استاندارد صیاد بانک</option>` + customTpls().map(t => `<option value="${t.id}" ${b && b.tpl === t.id ? "selected" : ""}>${esc(t.name)}</option>`).join("");
  bkRange(); modal.open("bookModal"); setTimeout(() => $("#bkName").focus(), 50);
}
function bkRange() {
  const from = digitsOnly($("#bkFrom").value), n = +$("#bkCount").value;
  $("#bkRange").textContent = from ? `برگ‌ها: ${toFa(from)} تا ${toFa(String(+from + n - 1).padStart(from.length, "0"))}` : "سریال اولین برگ را از روی دسته‌چک بخوانید (عدد بعد از / روی برگه).";
}
$("#bkFrom").addEventListener("input", bkRange); $("#bkCount").addEventListener("change", bkRange);
$("#bkAdd").addEventListener("click", () => openBook(null));
$("#bkSaveBtn").addEventListener("click", () => {
  const title = $("#bkName").value.trim(), from = digitsOnly($("#bkFrom").value);
  if (!title) { toast("یک نام برای دسته‌چک بنویسید", "error"); return $("#bkName").focus(); }
  if (!from) { toast("سریال اولین برگ لازم است", "error"); return $("#bkFrom").focus(); }
  const o = { title, bank: $("#bkBank").value, account: digitsOnly($("#bkAcc").value), series: digitsOnly($("#bkSeries").value), from, count: +$("#bkCount").value, tpl: $("#bkTpl").value };
  if (bookEdit) Object.assign(bookEdit, o); else S.books.push({ id: uid(), void: [], ...o });
  save(); modal.close("bookModal"); renderAll(); toast("دسته‌چک ذخیره شد", "success");
});

/* ================= received cheques ================= */
const RV_ST = { in_hand: "در دست", deposited: "خوابانده‌شده", cleared: "وصول‌شده", bounced: "برگشتی", returned: "عودت‌شده", spent: "خرج‌شده" };
const RV_OPEN = ["in_hand", "deposited"];
const RV = { preset: "all", q: "" };
function recvDue() {
  const t = todayJ(), today = gIsoOf(t), end = gIsoOf(d2j(jdnOf(t) + (+S.settings.remindDays || 0)));
  const open = S.received.filter(r => RV_OPEN.includes(r.status));
  return { overdue: open.filter(r => r.due_on < today), soon: open.filter(r => r.due_on >= today && r.due_on <= end), today, end };
}
function setRvPreset(p) { RV.preset = p; document.querySelectorAll("#rvPreset .tab").forEach(b => b.classList.toggle("active", b.dataset.p === p)); renderReceived(); }
$("#rvPreset").addEventListener("click", e => { const b = e.target.closest(".tab"); if (b) setRvPreset(b.dataset.p); });
$("#rvQ").addEventListener("input", e => { RV.q = e.target.value; renderReceived(); });
function rvRows() {
  const { today, end } = recvDue(), q = toEn(RV.q.trim()).toLowerCase();
  return S.received.filter(r => {
    const open = RV_OPEN.includes(r.status);
    if (RV.preset === "open" && !open) return false;
    if (RV.preset === "due" && !(open && r.due_on >= today && r.due_on <= end)) return false;
    if (RV.preset === "overdue" && !(open && r.due_on < today)) return false;
    if (RV.preset === "bounced" && r.status !== "bounced") return false;
    return !q || [r.drawer, r.drawer_id, r.sayad, r.serial, r.reason, r.note, r.bank].join(" ").toLowerCase().includes(q);
  }).sort((a, b) => a.due_on < b.due_on ? -1 : a.due_on > b.due_on ? 1 : 0);
}
function renderReceived() {
  const all = S.received, { today, end, overdue, soon } = recvDue(), rows = rvRows();
  const by = st => all.filter(r => r.status === st);
  $("#rvHand").textContent = faMoney(sumOf(by("in_hand")).toString()); $("#rvHandS").textContent = `${toFa(by("in_hand").length)} برگ`;
  $("#rvDep").textContent = faMoney(sumOf(by("deposited")).toString()); $("#rvDepS").textContent = `${toFa(by("deposited").length)} برگ`;
  $("#rvDue").textContent = toFa(overdue.length + soon.length); $("#rvDueS").textContent = overdue.length ? `${toFa(overdue.length)} برگ سررسیدش گذشته` : "";
  $("#rvBounced").textContent = toFa(by("bounced").length); $("#rvBouncedS").textContent = by("bounced").length ? faMoney(sumOf(by("bounced")).toString()) + " ریال" : "";
  const del = canManage();
  $("#rvBody").innerHTML = rows.length ? rows.map(r => {
    const open = RV_OPEN.includes(r.status), cls = open ? (r.due_on < today ? "overdue" : r.due_on <= end ? "soon" : "") : "";
    return `<tr class="${cls}" data-id="${r.id}">
      <td class="mono">${toFa(r.due_date)}</td>
      <td><b>${esc(r.drawer)}</b>${r.drawer_id ? `<div class="muted mono" style="font-size:11px">${toFa(r.drawer_id)}</div>` : ""}</td>
      <td>${esc(r.bank || "—")}${r.branch ? `<div class="muted" style="font-size:11px">${esc(r.branch)}</div>` : ""}</td>
      <td class="num">${faMoney(r.amount)}</td>
      <td class="muted" style="white-space:normal;max-width:200px">${esc(r.reason || "")}${r.note ? " — " + esc(r.note) : ""}</td>
      <td><select class="st ${r.status === "cleared" ? "cleared" : r.status === "bounced" ? "bounced" : open ? "issued" : "void"}" data-act="status" aria-label="وضعیت">${Object.entries(RV_ST).map(([k, v]) => `<option value="${k}" ${k === r.status ? "selected" : ""}>${v}</option>`).join("")}</select></td>
      <td class="muted" style="font-size:11px">${toFa(r.received_date || "")}${r.created_by_name ? "<br>" + esc(r.created_by_name) : ""}</td>
      <td><span class="row"><button class="icon-btn" type="button" data-act="edit" title="ویرایش" aria-label="ویرایش">✎</button>
        ${del ? `<button class="icon-btn" type="button" data-act="del" title="حذف" aria-label="حذف">✕</button>` : ""}</span></td></tr>`;
  }).join("")
    : `<tr><td colspan="8"><div class="empty" style="min-height:150px"><strong>${all.length ? "با این فیلتر چیزی نیست" : "هنوز چک دریافتی ثبت نشده"}</strong>
        <span>${all.length ? "«همه» را بزنید." : "با «+ چک دریافتی» چک‌هایی را که از مشتری‌ها گرفته‌اید ثبت کنید تا سررسیدشان یادآوری شود."}</span></div></td></tr>`;
  renderDue();
}
async function saveReceived(r, changes) {
  if (MODE === "server") return r ? Object.assign(r, await api("PATCH", `/api/cheque/received/${r.id}`, changes)) : S.received.unshift(await api("POST", "/api/cheque/received", changes));
  if (r) Object.assign(r, changes, { updated_at: new Date().toISOString() });
  else S.received.unshift({ id: "L" + uid(), status: "in_hand", created_at: new Date().toISOString(), ...changes });
  save();
}
$("#rvBody").addEventListener("change", e => {
  if (e.target.dataset.act !== "status") return;
  const r = S.received.find(x => String(x.id) === e.target.closest("tr").dataset.id), was = r.status, now = e.target.value;
  saveReceived(r, { status: now }).then(() => { renderReceived(); offerUndo(`«${r.drawer}»: ${RV_ST[now]}`, () => saveReceived(r, { status: was }).then(renderReceived)); },
    err => { toast(err.message, "error"); renderReceived(); });
});
$("#rvBody").addEventListener("click", e => {
  const tr = e.target.closest("tr[data-id]"), act = e.target.closest("button[data-act]")?.dataset.act; if (!tr || !act) return;
  const r = S.received.find(x => String(x.id) === tr.dataset.id);
  if (act === "edit") openRecv(r);
  if (act === "del") confirmDo("این چک دریافتی حذف شود؟", "ردیف برای همیشه از فهرست پاک می‌شود. برای چکی که پس داده‌اید بهتر است وضعیت را «عودت‌شده» کنید.", "حذف", async () => {
    try { if (MODE === "server") await api("DELETE", `/api/cheque/received/${r.id}`); S.received = S.received.filter(x => x !== r); save(); renderReceived(); toast("حذف شد"); }
    catch (err) { toast(err.message, "error"); }
  });
});
let recvEdit = null;
function openRecv(r) {
  recvEdit = r || null;
  $("#rvTitle").textContent = r ? "ویرایش چک دریافتی" : "چک دریافتی تازه";
  $("#bankList").innerHTML = Object.keys(BANKS).map(c => `<option value="${esc(bankName(c))}">`).join("");
  $("#rvStatus").innerHTML = Object.entries(RV_ST).map(([k, v]) => `<option value="${k}">${v}</option>`).join("");
  const v = r || { drawer: "", drawer_id: "", amount: "", due_date: "", bank: "", branch: "", sayad: "", serial: "", received_date: dateStr(todayJ()), reason: "", note: "", status: "in_hand" };
  $("#rvDrawer").value = v.drawer; $("#rvId").value = v.drawer_id; $("#rvAmount").value = amountDisplay(v.amount); $("#rvDue").value = toFa(v.due_date);
  $("#rvBank").value = v.bank; $("#rvBranch").value = v.branch; $("#rvSayad").value = v.sayad; $("#rvSerial").value = v.serial;
  $("#rvGot").value = toFa(v.received_date); $("#rvReason").value = v.reason; $("#rvNote").value = v.note; $("#rvStatus").value = v.status;
  rvHints(); modal.open("recvModal"); setTimeout(() => $("#rvDrawer").focus(), 50);
}
const rvRial = () => { const v = digitsOnly($("#rvAmount").value).replace(/^0+/, ""); return v ? (S.unit === "toman" ? v + "0" : v) : ""; };
function rvHints() {
  const a = rvRial(); $("#rvAmountW").textContent = a ? `${toWords(a)} ریال` : "";
  const d = parseJ($("#rvDue").value); $("#rvDueHint").textContent = d ? `${weekday(d)}${holidayOf(d) ? "، تعطیل: " + holidayOf(d) : ""}` : $("#rvDue").value ? "مثل ۱۴۰۵/۰۸/۱۹" : "";
  $("#rvDueHint").className = "field-hint" + (!d && $("#rvDue").value ? " bad" : "");
  const id = checkId(digitsOnly($("#rvId").value)); $("#rvIdHint").textContent = id ? id.msg : ""; $("#rvIdHint").className = "field-hint " + (id ? (id.ok ? "good" : "bad") : "");
}
for (const id of ["#rvAmount", "#rvDue", "#rvId"]) $(id).addEventListener("input", rvHints);
$("#rvAmount").addEventListener("input", e => { const v = digitsOnly(e.target.value).replace(/^0+/, ""); e.target.value = group(v, ","); });
$("#rvDrawer").addEventListener("change", e => { const p = findPayee(e.target.value); if (p && !$("#rvId").value) { $("#rvId").value = p.nid; rvHints(); } });
$("#rvAdd").addEventListener("click", () => openRecv(null));
$("#rvSave").addEventListener("click", async () => {
  const d = parseJ($("#rvDue").value), amount = rvRial(), drawer = $("#rvDrawer").value.trim();
  if (!drawer) { toast("نام صادرکننده را بنویسید", "error"); return $("#rvDrawer").focus(); }
  if (!amount) { toast("مبلغ را بنویسید", "error"); return $("#rvAmount").focus(); }
  if (!d) { toast("سررسید را مثل ۱۴۰۵/۰۸/۱۹ بنویسید", "error"); return $("#rvDue").focus(); }
  const got = parseJ($("#rvGot").value);
  const o = { drawer, drawer_id: digitsOnly($("#rvId").value), amount, due_date: dateStr(d), due_on: gIsoOf(d), bank: $("#rvBank").value.trim(),
    branch: $("#rvBranch").value.trim(), sayad: digitsOnly($("#rvSayad").value).slice(0, 16), serial: toEn($("#rvSerial").value.trim()),
    received_date: got ? dateStr(got) : "", reason: $("#rvReason").value.trim(), note: $("#rvNote").value.trim(), status: $("#rvStatus").value };
  try { await saveReceived(recvEdit, o); modal.close("recvModal"); renderReceived(); toast("ذخیره شد", "success"); }
  catch (e) { toast(e.message, "error"); }
});
$("#rvCsv").addEventListener("click", () => {
  const rows = rvRows(); if (!rows.length) return toast("فهرست خالی است");
  const head = ["due_date", "drawer", "drawer_id", "bank", "branch", "amount_rial", "sayad", "serial", "status", "received_date", "reason", "note"];
  download("received-cheques.csv", "﻿" + [head].concat(rows.map(r => [r.due_date, r.drawer, r.drawer_id, r.bank, r.branch, r.amount, r.sayad, r.serial, RV_ST[r.status], r.received_date, r.reason, r.note]))
    .map(x => x.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n"), "text/csv;charset=utf-8");
});

/* ================= import cheques from Excel / CSV ================= */
/* .xlsx is a zip of XML: read the first sheet with the browser's own DecompressionStream (no library). */
async function unzip(buf) {
  const dv = new DataView(buf); let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("فایل اکسل خوانا نیست");
  const entries = new Map(), dec = new TextDecoder();
  for (let n = 0, off = dv.getUint32(eocd + 16, true), count = dv.getUint16(eocd + 10, true); n < count; n++) {
    const nlen = dv.getUint16(off + 28, true), xlen = dv.getUint16(off + 30, true), clen = dv.getUint16(off + 32, true);
    entries.set(dec.decode(new Uint8Array(buf, off + 46, nlen)), { method: dv.getUint16(off + 10, true), size: dv.getUint32(off + 20, true), at: dv.getUint32(off + 42, true) });
    off += 46 + nlen + xlen + clen;
  }
  return async name => {
    const e = entries.get(name); if (!e) return null;
    const data = new Uint8Array(buf, e.at + 30 + dv.getUint16(e.at + 26, true) + dv.getUint16(e.at + 28, true), e.size);
    if (e.method === 0) return dec.decode(data);
    return dec.decode(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());
  };
}
async function readXlsx(buf) {
  const get = await unzip(buf), xml = s => new DOMParser().parseFromString(s, "application/xml");
  const wb = xml(await get("xl/workbook.xml")), rels = xml(await get("xl/_rels/workbook.xml.rels"));
  const first = wb.getElementsByTagName("sheet")[0], rid = first.getAttribute("r:id") || first.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
  const rel = [...rels.getElementsByTagName("Relationship")].find(r => r.getAttribute("Id") === rid);
  let target = rel.getAttribute("Target").replace(/^\//, ""); if (!target.startsWith("xl/")) target = "xl/" + target;
  const ssText = await get("xl/sharedStrings.xml");
  const shared = ssText ? [...xml(ssText).getElementsByTagName("si")].map(si => [...si.getElementsByTagName("t")].map(t => t.textContent).join("")) : [];
  const rows = [];
  for (const row of xml(await get(target)).getElementsByTagName("row")) {
    const out = [];
    for (const c of row.getElementsByTagName("c")) {
      const col = (c.getAttribute("r") || "").replace(/\d+/g, "").split("").reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;
      const t = c.getAttribute("t"), v = c.getElementsByTagName("v")[0];
      out[col] = t === "s" ? shared[+v.textContent] : t === "inlineStr" ? [...c.getElementsByTagName("t")].map(x => x.textContent).join("") : v ? v.textContent : "";
    }
    rows.push(Array.from(out, x => x ?? ""));
  }
  return rows;
}
function readCsv(text) {
  text = text.replace(/^﻿/, "");
  const first = text.split(/\r?\n/)[0], sep = [",", ";", "\t"].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
    if (ch === '"') q = true; else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => String(x).trim()));
}
const COLS = {
  payee: ["در وجه", "گیرنده", "نام گیرنده", "طرف حساب", "payee", "name"], payeeId: ["کد ملی", "شناسه ملی", "کد/شناسه ملی", "national id", "nid", "payee_id"],
  amount: ["مبلغ", "مبلغ ریال", "مبلغ (ریال)", "amount", "amount_rial", "rial"], toman: ["مبلغ تومان", "مبلغ (تومان)", "تومان", "toman"],
  date: ["سررسید", "تاریخ", "تاریخ سررسید", "due", "due_date", "date"], reason: ["بابت", "شرح", "reason", "description"],
  bank: ["بانک", "bank"], sayad: ["صیاد", "شناسه صیاد", "شناسه‌ی صیاد", "sayad"], note: ["توضیحات", "یادداشت", "note"], serial: ["سریال", "سریال برگ", "serial"] };
const normHead = s => toEn(String(s || "")).replace(/[‌\s_\-()\/]+/g, "").replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/ٔ|ه‌ی/g, "").toLowerCase();
function bankFromName(name) {
  const n = normHead(name); if (!n) return "";
  return Object.keys(BANKS).find(c => normHead(bankName(c)) === n || normHead(BANKS[c].name) === n || n.includes(normHead(BANKS[c].name))) || "";
}
function excelDate(v) {                  // Jalali text, or an Excel serial (a Gregorian date) -> {y,m,d}
  const d = parseJ(v); if (d) return d;
  const n = +toEn(v); if (n > 20000 && n < 80000) { const t = new Date(Math.round((n - 25569) * 864e5)); return d2j(g2d(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate())); }
  return null;
}
let imported = [];
function prepareImport(rows) {
  const head = rows[0].map(normHead), col = {};
  for (const k in COLS) col[k] = head.findIndex(h => COLS[k].some(a => normHead(a) === h));
  if (col.payee < 0 || (col.amount < 0 && col.toman < 0) || col.date < 0) throw new Error("ستون‌های «در وجه»، «مبلغ» و «سررسید» در سطر اول پیدا نشد. فایل نمونه را ببینید.");
  const base = cur(), at = k => (r => col[k] >= 0 ? String(r[col[k]] ?? "").trim() : "");
  imported = rows.slice(1).map(r => {
    const amt = col.amount >= 0 ? digitsOnly(at("amount")(r)) : (digitsOnly(at("toman")(r)) ? digitsOnly(at("toman")(r)) + "0" : "");
    const d = excelDate(at("date")(r)), bank = bankFromName(at("bank")(r)) || base.bank;
    const ch = { ...blankCheque(d || todayJ(), bank, base.tpl), payee: at("payee")(r), payeeId: digitsOnly(at("payeeId")(r)), amount: amt.replace(/^0+/, ""),
      reason: at("reason")(r), sayad: digitsOnly(at("sayad")(r)).slice(0, 16), note: at("note")(r) };
    const known = findPayee(ch.payee); if (known && !ch.payeeId) ch.payeeId = known.nid;
    ch._err = [!ch.payee && "بی‌گیرنده", !ch.amount && "بی‌مبلغ", !d && "تاریخ نامعتبر"].filter(Boolean).join("، ");
    return ch;
  }).filter(ch => ch.payee || ch.amount);
  const ok = imported.filter(c => !c._err).length;
  $("#imInfo").textContent = `${toFa(imported.length)} ردیف خوانده شد؛ ${toFa(ok)} ردیف سالم است${imported.length - ok ? ` و ${toFa(imported.length - ok)} ردیف ایراد دارد و وارد نمی‌شود` : ""}. بانک هر ردیف اگر خالی باشد، بانک چک فعلی (${bankName(base.bank)}) گذاشته می‌شود.`;
  $("#imBody").innerHTML = imported.map((c, i) => `<tr class="${c._err ? "bad" : ""}"><td>${toFa(i + 1)}</td><td>${esc(c.payee)}</td><td class="num">${c.amount ? faMoney(c.amount) : "—"}</td>
    <td class="mono">${c._err.includes("تاریخ") ? "—" : toFa(dateStr(c.date))}</td><td>${esc(c.reason)}</td><td>${esc((BANKS[c.bank] || {}).name || "")}</td><td>${c._err ? esc(c._err) : "سالم"}</td></tr>`).join("");
  $("#imGo").textContent = `افزودن ${toFa(ok)} برگ به صف`; $("#imGo").disabled = !ok;
  modal.open("importModal");
}
$("#xlFile").addEventListener("change", async e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  try {
    const rows = /\.xlsx$/i.test(f.name) ? await readXlsx(await f.arrayBuffer()) : readCsv(await f.text());
    if (rows.length < 2) throw new Error("فایل خالی است یا فقط سطر عنوان دارد");
    prepareImport(rows);
  } catch (err) { toast(err.message || "این فایل خوانده نشد", "error"); }
});
$("#imGo").addEventListener("click", () => {
  const ok = imported.filter(c => !c._err).map(c => { const x = { ...c }; delete x._err; return x; });
  S.queue = S.queue.filter(c => !(c.example || (!c.amount && !c.payee))).concat(ok); S.cur = ok[0].id;
  save(); modal.close("importModal"); renderAll(); toast(`${toFa(ok.length)} برگ به صف اضافه شد`, "success");
});
$("#imSample").addEventListener("click", () => {
  download("cheque-import-sample.csv", "﻿" + [["در وجه", "کد ملی", "مبلغ (ریال)", "سررسید", "بابت", "بانک", "صیاد", "توضیحات"],
    ["فروشگاه نمونه", "", "125000000", "1405/08/15", "خرید تجهیزات", "ملت", "", ""],
    ["شرکت نمونه", "", "48000000", "1405/09/15", "قسط دوم", "", "", ""]].map(r => r.map(v => `"${v}"`).join(",")).join("\r\n"), "text/csv;charset=utf-8");
});

/* ================= views ================= */
const VIEWS = {
  issue: ["صدور چک", () => `${bankName(cur().bank)}، ${tplLabel(tpl())}`],
  queue: ["صف چاپ", () => `${toFa(S.queue.length)} برگ`],
  templates: ["قالب‌ها", () => `${toFa(customTpls().length)} قالب شخصی، ${toFa(Object.keys(BANKS).length)} بانک`],
  books: ["دسته‌چک‌ها", () => `${toFa(S.books.length)} دسته‌چک`],
  received: ["چک‌های دریافتی", () => `${toFa(S.received.length)} برگ`],
  payees: ["طرف حساب‌ها", () => `${toFa(S.payees.length)} نفر`],
  reports: ["چک‌های صادره", () => `${toFa(S.issued.length)} برگ ثبت‌شده`],
  settings: ["تنظیمات", () => MODE === "server" ? "مشترک روی سرور" : "این مرورگر"],
};
function go(v) {
  S.view = VIEWS[v] ? v : "issue"; save();
  document.querySelectorAll("[data-pane]").forEach(p => p.hidden = p.dataset.pane !== S.view);
  document.querySelectorAll(".sidebar-actions [data-view]").forEach(b => b.classList.toggle("active", b.dataset.view === S.view));
  $("#pageTitle").textContent = VIEWS[S.view][0]; $("#pageSub").textContent = VIEWS[S.view][1]();
  $("#btnTest").hidden = $("#btnReceipt").hidden = S.view !== "issue";
  if (S.view === "settings") renderSettings();
  if (S.view === "reports") renderReports();
  if (S.view === "payees") renderPayees();
  if (S.view === "books") renderBooks();
  if (S.view === "received") renderReceived();
  if (S.view === "issue") requestAnimationFrame(renderStage);
  if (S.view === "queue") seriesHint();
}
document.querySelectorAll(".sidebar-actions [data-view]").forEach(b => b.addEventListener("click", () => { go(b.dataset.view); if (window.OdiqUI) OdiqUI.sidebar.closeDrawer(); }));

function renderAll() {
  renderTplForm(); renderForm(); renderInspector(); renderStage(); renderQueue(); renderFlags(); renderTemplates(); renderPayees(); renderReports(); renderBooks(); renderReceived(); seriesHint();
  if (S.view === "settings") renderSettings();
  $("#welcome").hidden = !!S.welcomed;
  $("#pageSub").textContent = VIEWS[S.view][1]();
}
$("#welcomeX").addEventListener("click", () => { S.welcomed = 1; save(); $("#welcome").hidden = true; });
if (CFG.standalone) {
  const foot = document.querySelector(".sidebar-foot .btn");
  if (foot) {
    foot.removeAttribute("href"); foot.setAttribute("role", "button"); foot.title = "خروج از حساب";
    foot.querySelector(".sidebar-menu-label").textContent = "خروج";
    foot.addEventListener("click", async e => { e.preventDefault(); await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => {}); location.href = CFG.loginUrl; });
  }
}
(async function boot() {
  await bootServer().catch(() => false);
  setSync("ok");
  renderAll(); go(S.view);
  if (location.hash === "#reminders") { go("reports"); setPreset("due"); history.replaceState(null, "", location.pathname); }
  if (BOOT_NOTE === "login") toast("حالت محلی: برای ذخیرهٔ مشترک و یادآوری، وارد ODiQ شوید");
  if (BOOT_NOTE === "forbidden") toast(`به ${CFG.product} سرور دسترسی ندارید؛ فعلاً در حالت محلی کار می‌کنید`);
})();
if (document.fonts) document.fonts.ready.then(renderStage);
