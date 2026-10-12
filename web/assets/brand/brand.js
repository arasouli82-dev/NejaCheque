/* Branding — change these to rebrand (and replace logo.svg / favicon.svg, colours in brand.css).
   If you publish your own version, keep the original author in LICENSE (MIT requires it). */
window.BRAND = {
  name: "نژا چک",
  nameLatin: "Neja Cheque",
  tagline: "ابزار ساده، کار دقیق",
  logo: "assets/brand/logo.svg",
  author: {
    name: "علی رسولی‌نژاد",
    nameLatin: "Ali Rasoulinejad",
    brand: "نژا",
    email: "ali.rasoulinejaad@gmail.com",
    linkedin: "https://www.linkedin.com/in/ali-rasoulinejad-bb400b243",
  },
};

document.addEventListener("DOMContentLoaded", () => {
  const b = window.BRAND, a = b.author;
  const link = (href, text) => { const el = document.createElement("a"); el.href = href; el.textContent = text; el.target = "_blank"; el.rel = "noopener"; return el; };
  document.querySelectorAll("[data-brand-name]").forEach(el => { el.textContent = b.name; });
  document.querySelectorAll("[data-brand-tagline]").forEach(el => { el.textContent = b.tagline; });
  document.querySelectorAll("[data-brand-logo]").forEach(el => { el.src = b.logo; el.alt = b.name; });
  // short credit line: «نژا چک، ساختهٔ علی رسولی‌نژاد · نژا»
  document.querySelectorAll("[data-brand-credit]").forEach(el => {
    el.replaceChildren(`${b.name}، ساختهٔ `, link(a.linkedin, a.name), ` · ${a.brand}`);
  });
  // the «درباره» card in settings
  document.querySelectorAll("[data-brand-about]").forEach(el => {
    el.querySelector("[data-about-name]").textContent = `${b.name} (${b.nameLatin})`;
    el.querySelector("[data-about-tagline]").textContent = b.tagline;
    el.querySelector("[data-about-author]").textContent = `${a.name} · ${a.nameLatin}`;
    const mail = el.querySelector("[data-about-email]"); mail.textContent = a.email; mail.href = "mailto:" + a.email;
    const li = el.querySelector("[data-about-linkedin]"); li.textContent = a.linkedin.replace(/^https?:\/\/(www\.)?/, ""); li.href = a.linkedin;
    fetch("/api/auth/state").then(r => r.json()).then(s => { el.querySelector("[data-about-version]").textContent = s.version; }).catch(() => {});
  });
});
