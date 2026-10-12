"""Builds the extra website pages under docs/ (tools, guide) and the sitemap.

    python tools/build_site.py

Every page shares the header, footer, meta tags and structured data; the page bodies live below.
The landing page (docs/index.html) is written by hand. The online demo (/demo/) is copied from web/
by .github/workflows/pages.yml when the site is deployed.
"""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path

SITE = "https://arasouli82-dev.github.io/NejaCheque/"
REPO = "https://github.com/arasouli82-dev/NejaCheque"
DOWNLOAD = REPO + "/releases/latest"
DOCS = Path(__file__).resolve().parent.parent / "docs"
AUTHOR = {"@type": "Person", "name": "علی رسولی‌نژاد", "alternateName": "Ali Rasoulinejad",
          "sameAs": ["https://www.linkedin.com/in/ali-rasoulinejad-bb400b243", "https://github.com/arasouli82-dev"]}

NAV = [("demo/", "چک چاپ آنلاین"), ("adad-be-horouf/", "عدد به حروف"), ("tarikh-be-horouf/", "تاریخ به حروف"),
       ("kod-melli/", "کد ملی"), ("chap-check-sayadi/", "آموزش")]


def page(slug: str, title: str, description: str, h1: str, lead: str, body: str, *, script: str = "",
         faq: list[tuple[str, str]] = (), extra_ld: list[dict] = (), crumb: str = "") -> str:
    url = SITE + slug
    lds = [{"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "نژا چک", "item": SITE},
        {"@type": "ListItem", "position": 2, "name": crumb or h1, "item": url}]}]
    if faq:
        lds.append({"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
            {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in faq]})
    lds += list(extra_ld)
    ld = "\n".join(f'<script type="application/ld+json">{json.dumps(x, ensure_ascii=False)}</script>' for x in lds)
    nav = "".join(f'<a href="../{href}">{text}</a>' for href, text in NAV)
    faq_html = "".join(f"<details><summary>{q}</summary><p>{a}</p></details>" for q, a in faq)
    return f'''<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{description}">
<link rel="canonical" href="{url}">
<link rel="icon" type="image/svg+xml" href="../favicon.svg">
<meta name="theme-color" content="#1B3170">
<meta property="og:type" content="website">
<meta property="og:locale" content="fa_IR">
<meta property="og:site_name" content="نژا چک">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{description}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{SITE}og.jpg">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;700;900&display=swap">
<link rel="stylesheet" href="../assets/site.css">
{ld}
</head>
<body>
<header class="wrap top">
  <a class="brand" href="../"><img src="../favicon.svg" alt="">نژا چک</a>
  <nav>{nav}</nav>
</header>
<main class="wrap page">
  <div class="crumbs"><a href="../">نژا چک</a> / {crumb or h1}</div>
  <h1>{h1}</h1>
  <p class="lead">{lead}</p>
  {body}
  <div class="promo">
    <div><b>نرم‌افزار چک چاپ رایگان</b><p>نژا چک مبلغ و تاریخ را خودش به حروف می‌نویسد و روی برگهٔ چک صیادی همهٔ بانک‌ها چاپ می‌کند. رایگان.</p></div>
    <a class="btn" href="../demo/">امتحان آنلاین</a>
    <a class="btn" href="{DOWNLOAD}">دانلود رایگان</a>
  </div>
  {f'<section style="border:0;padding-block:36px 0"><h2>پرسش‌های رایج</h2>{faq_html}</section>' if faq else ''}
</main>
<footer>
  <div class="wrap">
    <span>نژا چک، ساختهٔ <a href="https://www.linkedin.com/in/ali-rasoulinejad-bb400b243">علی رسولی‌نژاد</a> · نژا</span>
    <span><a href="../adad-be-horouf/">عدد به حروف</a> · <a href="../tarikh-be-horouf/">تاریخ به حروف</a> · <a href="../kod-melli/">بررسی کد ملی</a> · <a href="../chap-check-sayadi/">آموزش چک چاپ</a> · <a href="{REPO}">گیت‌هاب</a></span>
  </div>
</footer>
<script src="../assets/core.js"></script>
<script>
const $ = s => document.querySelector(s);
function copyBtn(btn, get) {{
  btn.addEventListener("click", () => {{
    const t = get(); if (!t) return;
    const done = () => {{ const old = btn.textContent; btn.textContent = "کپی شد"; setTimeout(() => btn.textContent = old, 1200); }};
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(done, () => {{
      const r = document.createRange(); r.selectNodeContents(btn.previousElementSibling); getSelection().removeAllRanges(); getSelection().addRange(r); }});
  }});
}}
{script}
</script>
</body>
</html>
'''


def tool_app(name: str, description: str, slug: str) -> dict:
    return {"@context": "https://schema.org", "@type": "WebApplication", "name": name, "url": SITE + slug,
            "applicationCategory": "UtilitiesApplication", "operatingSystem": "All", "inLanguage": "fa",
            "offers": {"@type": "Offer", "price": "0", "priceCurrency": "IRR"}, "description": description, "author": AUTHOR}


PAGES = {}

# ---------------------------------------------------------------- number to words
d = "تبدیل آنلاین و رایگان عدد و مبلغ به حروف فارسی؛ برای چک، قرارداد و فاکتور. ریال و تومان، با ارقام فارسی یا انگلیسی، بدون نصب."
PAGES["adad-be-horouf/"] = page(
    "adad-be-horouf/", "تبدیل عدد به حروف فارسی | مبلغ به حروف برای چک (آنلاین)", d,
    "تبدیل عدد به حروف", "عدد یا مبلغ را بنویسید تا همان لحظه به حروف فارسی تبدیل شود؛ مناسب نوشتن مبلغ چک، قرارداد و فاکتور.",
    '''<div class="tool">
    <label for="n">عدد یا مبلغ</label>
    <input id="n" inputmode="numeric" autocomplete="off" placeholder="مثلاً ۱۲۵۰۰۰۰۰۰" value="125000000">
    <div class="row">
      <div><label for="u">واحد</label><select id="u"><option value="">بدون واحد</option><option value="rial" selected>ریال</option><option value="toman">تومان</option><option value="t2r">مبلغ تومان است؛ به ریال بنویس</option></select></div>
    </div>
    <div><div class="out" id="w" aria-live="polite"></div><button class="copy" id="cw" type="button">کپی متن</button></div>
    <div class="out small" id="x"></div>
  </div>''',
    script='''
const n = $("#n"), u = $("#u");
function run() {
  let v = digitsOnly(n.value).replace(/^0+/, "");
  if (v.length > 18) v = v.slice(0, 18);
  if (!v) { $("#w").textContent = n.value.trim() ? "فقط رقم بنویسید" : ""; $("#x").textContent = ""; return; }
  let unit = u.value, words;
  if (unit === "t2r") { v = v + "0"; unit = "rial"; }
  words = toWords(v) + (unit === "rial" ? " ریال" : unit === "toman" ? " تومان" : "");
  $("#w").textContent = words;
  const fa = toFa(group(v, "٬"));
  $("#x").textContent = unit === "rial" ? `${fa} ریال = ${toFa(group(v.length > 1 ? v.slice(0, -1) : "0", "٬"))} تومان` : unit === "toman" ? `${fa} تومان = ${toFa(group(v + "0", "٬"))} ریال` : fa;
}
n.addEventListener("input", run); u.addEventListener("change", run); run();
copyBtn($("#cw"), () => $("#w").textContent);''',
    faq=[("مبلغ چک باید به ریال نوشته شود یا تومان؟", "مبلغ چک صیادی به ریال نوشته می‌شود. اگر مبلغ را به تومان دارید، گزینهٔ «مبلغ تومان است؛ به ریال بنویس» را انتخاب کنید."),
         ("«صد» درست است یا «یکصد»؟", "هر دو درست است، اما در چک و اسناد مالی «یکصد» رایج‌تر است تا جایی برای دست‌کاری نماند؛ این ابزار «یکصد» می‌نویسد."),
         ("تا چه عددی را تبدیل می‌کند؟", "تا ۱۸ رقم، یعنی تا میلیون میلیارد."),
         ("عددها به جایی فرستاده می‌شوند؟", "نه. همهٔ تبدیل در مرورگر خود شما انجام می‌شود و چیزی به اینترنت فرستاده نمی‌شود.")],
    extra_ld=[tool_app("تبدیل عدد به حروف فارسی", d, "adad-be-horouf/")], crumb="تبدیل عدد به حروف")

# ---------------------------------------------------------------- date to words
d = "تبدیل آنلاین تاریخ شمسی به حروف (مثل «نوزدهم آبان ماه یک هزار و چهارصد و پنج») برای چک و اسناد، و تبدیل تاریخ میلادی به شمسی."
PAGES["tarikh-be-horouf/"] = page(
    "tarikh-be-horouf/", "تبدیل تاریخ به حروف | تاریخ شمسی به حروف برای چک و تبدیل میلادی به شمسی", d,
    "تبدیل تاریخ به حروف", "تاریخ شمسی را بدهید تا به حروف نوشته شود؛ همان شکلی که در چک و قرارداد لازم است. تاریخ میلادی را هم به شمسی تبدیل می‌کند.",
    '''<div class="tool">
    <label for="j">تاریخ شمسی</label>
    <input id="j" inputmode="numeric" autocomplete="off" placeholder="۱۴۰۵/۰۸/۱۹">
    <div><div class="out" id="w" aria-live="polite"></div><button class="copy" id="cw" type="button">کپی متن</button></div>
    <div class="out small" id="x"></div>
  </div>
  <div class="tool" style="margin-top:16px">
    <label for="g">یا تاریخ میلادی</label>
    <input id="g" type="date">
    <div class="out small" id="gx"></div>
  </div>''',
    script='''
const j = $("#j"), g = $("#g");
j.value = toFa(dateStr(todayJ()));
function run() {
  const d = parseJ(j.value);
  if (!d) { $("#w").textContent = j.value.trim() ? "تاریخ را مثل ۱۴۰۵/۰۸/۱۹ بنویسید" : ""; $("#x").textContent = ""; return; }
  $("#w").textContent = dateWords(d);
  const gd = d2g(jdnOf(d)), diff = jdnOf(d) - jdnOf(todayJ());
  const rel = diff === 0 ? "امروز" : diff > 0 ? toFa(diff) + " روز دیگر" : toFa(-diff) + " روز پیش";
  $("#x").textContent = `${weekday(d)}، ${rel} · میلادی: ${gd.gy}-${pad2(gd.gm)}-${pad2(gd.gd)}`;
}
g.addEventListener("input", () => {
  if (!g.value) return;
  const [y, m, dd] = g.value.split("-").map(Number), d = d2j(g2d(y, m, dd));
  j.value = toFa(dateStr(d)); run();
  $("#gx").textContent = `شمسی: ${toFa(dateStr(d))}، ${weekday(d)}`;
});
j.addEventListener("input", run); run();
copyBtn($("#cw"), () => $("#w").textContent);''',
    faq=[("تاریخ چک را چطور به حروف بنویسم؟", "روز را با عدد ترتیبی (مثل «نوزدهم»)، بعد نام ماه و واژهٔ «ماه» و سپس سال را کامل به حروف بنویسید: «نوزدهم آبان ماه یک هزار و چهارصد و پنج»."),
         ("سال را «هزار و چهارصد» بنویسم یا «یک هزار و چهارصد»؟", "در چک و اسناد رسمی «یک هزار و چهارصد و …» رایج‌تر و مطمئن‌تر است."),
         ("کبیسه بودن سال حساب می‌شود؟", "بله. تبدیل با الگوریتم دقیق تقویم جلالی انجام می‌شود و سال‌های کبیسه را درست حساب می‌کند.")],
    extra_ld=[tool_app("تبدیل تاریخ به حروف", d, "tarikh-be-horouf/")], crumb="تبدیل تاریخ به حروف")

# ---------------------------------------------------------------- national id
d = "بررسی آنلاین درستی کد ملی ۱۰ رقمی و شناسهٔ ملی ۱۱ رقمی اشخاص حقوقی با رقم کنترل؛ رایگان و بدون فرستادن اطلاعات."
PAGES["kod-melli/"] = page(
    "kod-melli/", "بررسی صحت کد ملی و شناسه ملی (آنلاین و رایگان)", d,
    "بررسی درستی کد ملی و شناسهٔ ملی", "کد ملی ۱۰ رقمی یا شناسهٔ ملی ۱۱ رقمی شرکت را بنویسید تا با رقم کنترل بررسی شود. پیش از نوشتن چک یا قرارداد، اشتباه تایپی را بگیرید.",
    '''<div class="tool">
    <label for="c">کد ملی یا شناسهٔ ملی</label>
    <input id="c" inputmode="numeric" maxlength="11" autocomplete="off" placeholder="۱۰ یا ۱۱ رقم">
    <div class="out" id="r" aria-live="polite"></div>
  </div>''',
    script='''
const c = $("#c");
function run() {
  const v = digitsOnly(c.value).slice(0, 11), r = checkId(v), out = $("#r");
  out.className = "out" + (r ? (r.ok ? " ok" : " bad") : "");
  out.textContent = r ? r.msg : "";
}
c.addEventListener("input", run);''',
    faq=[("این ابزار کد ملی را از سامانهٔ ثبت احوال استعلام می‌کند؟", "نه. فقط درستی ساختار کد را با رقم کنترل بررسی می‌کند؛ یعنی اشتباه تایپی را پیدا می‌کند، نه این‌که کد متعلق به چه کسی است."),
         ("شناسهٔ ملی شرکت‌ها هم بررسی می‌شود؟", "بله. شناسهٔ ملی ۱۱ رقمی اشخاص حقوقی هم با الگوریتم رقم کنترل خودش بررسی می‌شود."),
         ("کد ملی من جایی ذخیره یا فرستاده می‌شود؟", "نه. بررسی کاملاً در مرورگر خود شما انجام می‌شود.")],
    extra_ld=[tool_app("بررسی صحت کد ملی", d, "kod-melli/")], crumb="بررسی کد ملی")

# ---------------------------------------------------------------- guide
d = "آموزش قدم‌به‌قدم چاپ چک صیادی با پرینتر معمولی یا لیزری A4: ابزار رایگان، تنظیم برگه، چاپ آزمایشی، نکته‌های امنیتی و ثبت در سامانهٔ صیاد."
steps = [
    ("نرم‌افزار چک چاپ را آماده کنید", "نژا چک را رایگان دانلود و نصب کنید، یا همین حالا نسخهٔ آنلاین آن را در مرورگر باز کنید."),
    ("بانک را انتخاب کنید", "چک‌های صیادی جدید در همهٔ بانک‌ها یک چیدمان دارند. بانک خود را انتخاب کنید تا قالب درست بیاید."),
    ("مشخصات چک را بنویسید", "مبلغ، تاریخ سررسید و نام گیرنده را وارد کنید. مبلغ و تاریخ خودکار به حروف نوشته می‌شوند."),
    ("یک چاپ آزمایشی بگیرید", "روی کاغذ سفید چاپ کنید و جلوی نور روی برگهٔ چک بگذارید. اگر نوشته‌ها جابه‌جا بودند، در «ویرایش چیدمان» تنظیمشان کنید."),
    ("برگه را در چاپگر بگذارید", "برگهٔ چک را از سینی دستی بدهید، یا با چسب کاغذی روی یک A4 بچسبانید. در پنجرهٔ چاپ، Margins را None و Scale را ۱۰۰٪ بگذارید."),
    ("چک را در سامانهٔ صیاد ثبت کنید", "پس از چاپ و امضا، چک را از اپ یا اینترنت‌بانک بانک خود در سامانهٔ صیاد ثبت کنید."),
]
howto = {"@context": "https://schema.org", "@type": "HowTo", "name": "چاپ چک صیادی با پرینتر معمولی", "description": d,
         "image": SITE + "screenshot.jpg", "totalTime": "PT5M",
         "tool": [{"@type": "HowToTool", "name": "چاپگر معمولی یا لیزری A4"}, {"@type": "HowToTool", "name": "نرم‌افزار رایگان نژا چک"}],
         "step": [{"@type": "HowToStep", "position": i + 1, "name": n, "text": t} for i, (n, t) in enumerate(steps)]}
article = {"@context": "https://schema.org", "@type": "Article", "headline": "آموزش چاپ چک صیادی با پرینتر معمولی", "description": d,
           "image": SITE + "og.jpg", "author": AUTHOR, "inLanguage": "fa", "datePublished": "2026-10-12", "dateModified": date.today().isoformat(),
           "mainEntityOfPage": SITE + "chap-check-sayadi/"}
steps_html = "".join(f"<li><b>{n}</b><span>{t}</span></li>" for n, t in steps)
PAGES["chap-check-sayadi/"] = page(
    "chap-check-sayadi/", "آموزش چک چاپ: چاپ چک صیادی با پرینتر معمولی (رایگان، قدم‌به‌قدم)", d,
    "آموزش چاپ چک صیادی با پرینتر معمولی", "برای چاپ چک صیادی به چاپگر مخصوص یا نرم‌افزار چک چاپ پولی نیاز ندارید. در شش قدم، با همان چاپگر اداره چک تمیز و بی‌غلط چاپ کنید.",
    f'''<ol class="steps">{steps_html}</ol>
  <div class="article">
    <h2>چرا نوشتن چک با دست یا Word دردسر دارد؟</h2>
    <p>مبلغ به حروف زیاد اشتباه نوشته می‌شود، خط‌خوردگی چک را بی‌اعتبار یا مشکوک می‌کند، و در Word نوشته‌ها روی خط‌های برگه نمی‌نشینند. یک نرم‌افزار چاپ چک این سه مشکل را با هم حل می‌کند: حروف را بی‌غلط می‌نویسد و جای هر نوشته را به میلی‌متر روی برگه نگه می‌دارد.</p>
    <img src="../screenshot.jpg" width="1440" height="900" loading="lazy" alt="پیش‌نمایش چاپ چک صیادی در نژا چک">
    <h2>اندازهٔ برگهٔ چک صیادی</h2>
    <p>برگه‌های چک صیادی همراه ته‌چک حدود ۸ سانتی‌متر ارتفاع و نزدیک ۲۰ سانتی‌متر پهنا دارند، اما ممکن است بین دسته‌چک‌ها چند میلی‌متر فرق کنند. یک بار برگهٔ خود را با خط‌کش از لبه تا لبه اندازه بگیرید و در برنامه وارد کنید.</p>
    <h2>نکته‌های امنیتی چک</h2>
    <ul>
      <li>جای خالی بعد از مبلغ به حروف و نام گیرنده را با ستاره پر کنید تا چیزی به آن اضافه نشود.</li>
      <li>پیش و پس از مبلغ عددی علامت # بگذارید.</li>
      <li>اگر نمی‌خواهید چک به نفر دیگری واگذار شود، «غیرقابل پشت‌نویسی» بنویسید و روی «یا به حواله‌کرد» خط بکشید.</li>
      <li>مبلغ همیشه به ریال است، نه تومان.</li>
    </ul>
    <h2>ابزارهای کمکی رایگان</h2>
    <div class="toolgrid">
      <a class="toolcard" href="../adad-be-horouf/"><b>تبدیل عدد به حروف</b><span>مبلغ چک به حروف، ریال و تومان</span></a>
      <a class="toolcard" href="../tarikh-be-horouf/"><b>تبدیل تاریخ به حروف</b><span>تاریخ سررسید به حروف</span></a>
      <a class="toolcard" href="../kod-melli/"><b>بررسی کد ملی</b><span>پیش از نوشتن نام گیرنده</span></a>
    </div>
  </div>''',
    faq=[("آیا چاپ چک صیادی با پرینتر قانونی است؟", "بله. نوشتن مشخصات چک با چاپگر مجاز است؛ امضا را با دست می‌زنید و چک را در سامانهٔ صیاد ثبت می‌کنید."),
         ("پرینتر لیزری A4 برای چاپ چک مناسب است؟", "بله. برگه را از سینی دستی بدهید یا روی یک A4 بچسبانید. با یک چاپ آزمایشی جای دقیق نوشته‌ها را تنظیم کنید."),
         ("قالب چک کدام بانک‌ها آماده است؟", "قالب چک صیادی یکسان برای ۳۰ بانک و مؤسسه، از جمله ملی، ملت، صادرات، تجارت، سپه، پارسیان، پاسارگاد و سامان.")],
    extra_ld=[howto, article], crumb="آموزش چاپ چک صیادی")


def main() -> None:
    for slug, html in PAGES.items():
        out = DOCS / slug / "index.html"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(html, encoding="utf-8")
    urls = [("", "1.0"), ("demo/", "0.9")] + [(s, "0.8") for s in PAGES]
    today = date.today().isoformat()
    (DOCS / "sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "".join(f"  <url><loc>{SITE}{u}</loc><lastmod>{today}</lastmod><priority>{p}</priority></url>\n" for u, p in urls)
        + "</urlset>\n", encoding="utf-8")
    print("\n".join(PAGES))


if __name__ == "__main__":
    main()
