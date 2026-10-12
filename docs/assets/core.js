/* Neja Cheque — Persian number/date words, Jalali calendar and national-ID check.
   Extracted unchanged from web/assets/cheque/cheque.js for the website tools. */
"use strict";
const FA = "۰۱۲۳۴۵۶۷۸۹";
const toFa = s => String(s).replace(/\d/g, d => FA[d]);
const toEn = s => String(s).replace(/[۰-۹]/g, d => FA.indexOf(d)).replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
const digitsOnly = s => toEn(s).replace(/\D/g, "");
const group = (s, sep) => String(s).replace(/\B(?=(\d{3})+(?!\d))/g, sep);
const pad2 = n => String(n).padStart(2, "0");

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

