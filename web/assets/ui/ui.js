// UI kit -- shell behaviour. No dependencies; exposes window.OdiqUI.
//
//   theme     -- light/dark on <html data-theme>, persisted, capsule icon
//   lang      -- fa/en, persisted, <html lang/dir>, #app mirrors with a slide,
//                data-i18n translation of static markup
//   capsule   -- #btnTheme / #btnLang clicks, pulse, docking into #topbarTools
//   sidebar   -- collapse (desktop, persisted), drawer (mobile), submenu groups
//   toast / modal -- the glass overlays from base.css
//   events    -- "odiq:theme" {theme}, "odiq:lang" {lang, prev}, "odiq:sidebar" {collapsed}
//                dispatched on document after each change
//
// Configure before this script loads (all optional):
//   window.ODIQ_UI_CONFIG = {
//     storagePrefix:"nejacheque",          // localStorage keys: <prefix>.theme, <prefix>.lang, <prefix>.sidebarCollapsed
//     defaultTheme:"auto",           // "auto" (prefers-color-scheme) | "dark" | "light"
//     defaultLang:"fa",
//     autoInit:true,                 // set false and call OdiqUI.init() yourself
//     strings:{fa:{...}, en:{...}}   // extra i18n keys (same as OdiqUI.i18n.add)
//   };
(() => {
  const cfg = Object.assign({storagePrefix:"nejacheque", defaultTheme:"auto", defaultLang:"fa", autoInit:true, strings:null}, window.ODIQ_UI_CONFIG || {});
  const $ = id => document.getElementById(id);
  const KEY = {theme:cfg.storagePrefix + ".theme", lang:cfg.storagePrefix + ".lang", sidebar:"nejacheque.sidebarCollapsed"};
  const store = {
    get(k){ try{ return localStorage.getItem(k); }catch{ return null; } },
    set(k, v){ try{ localStorage.setItem(k, v); }catch{} }
  };
  const emit = (name, detail) => document.dispatchEvent(new CustomEvent(name, {detail}));

  // ---- state ----
  const savedTheme = store.get(KEY.theme);
  const prefersLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
  const state = {
    theme: savedTheme === "dark" || savedTheme === "light" ? savedTheme
         : cfg.defaultTheme === "auto" ? (prefersLight ? "light" : "dark") : cfg.defaultTheme,
    lang: store.get(KEY.lang) || cfg.defaultLang,
    sidebarCollapsed: store.get(KEY.sidebar) === "true"
  };
  // apply the theme before first paint (this script should sit in <head> or right after <body> opens)
  document.documentElement.dataset.theme = state.theme;

  // ---- i18n ----
  // Shell strings; products add their own with OdiqUI.i18n.add({fa:{}, en:{}}).
  const I18N = {
    fa:{
      themeToggle:"تغییر حالت روشن/تاریک", langToggle:"تغییر زبان",
      collapseSidebar:"جمع‌کردن نوار کناری", expandSidebar:"بازکردن نوار کناری",
      menu:"فهرست", logout:"خروج", close:"بستن", profileHint:"مشاهده و ویرایش پروفایل"
    },
    en:{
      themeToggle:"Toggle light / dark", langToggle:"Switch language",
      collapseSidebar:"Collapse sidebar", expandSidebar:"Expand sidebar",
      menu:"Menu", logout:"Sign out", close:"Close", profileHint:"View and edit profile"
    }
  };
  const LANG_DIR = {fa:"rtl", en:"ltr"};
  function addStrings(dict){
    Object.keys(dict || {}).forEach(l => { I18N[l] = Object.assign(I18N[l] || {}, dict[l]); });
  }
  if(cfg.strings) addStrings(cfg.strings);
  const lookup = key => (I18N[state.lang] && I18N[state.lang][key]) ?? (I18N.fa && I18N.fa[key]);
  const t = key => lookup(key) ?? key;
  // Unknown keys are left untouched, so a block with its own dictionary
  // (the login screen) can share the page without being overwritten.
  function applyI18n(root = document){
    const each = (attr, fn) => root.querySelectorAll("[" + attr + "]").forEach(el => {
      const v = lookup(el.getAttribute(attr));
      if(v !== undefined) fn(el, v);
    });
    each("data-i18n", (el, v) => { el.textContent = v; });
    each("data-i18n-placeholder", (el, v) => { el.placeholder = v; });
    each("data-i18n-aria", (el, v) => { el.setAttribute("aria-label", v); });
    each("data-i18n-title", (el, v) => { el.title = v; el.setAttribute("aria-label", v); });
  }
  const dateLocale = () => state.lang === "en" ? "en-GB" : "fa-IR";

  // ---- theme ----
  const THEME_ICONS = {
    dark:'<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z"></path>',
    light:'<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path>'
  };
  function pulseDial(btn, glow){
    if(!btn) return;
    btn.classList.remove("swap", "glow");
    void btn.offsetWidth;
    btn.style.setProperty("--glow-color", glow);
    btn.classList.add("swap", "glow");
  }
  function applyTheme(){
    const dark = state.theme === "dark";
    document.documentElement.dataset.theme = state.theme;
    const icon = $("themeDialIcon"), btn = $("btnTheme");
    if(icon) icon.innerHTML = dark ? THEME_ICONS.dark : THEME_ICONS.light;
    if(btn){
      btn.classList.toggle("state-dark", dark);
      btn.classList.toggle("state-light", !dark);
      btn.setAttribute("aria-pressed", String(dark));
      btn.title = t("themeToggle"); btn.setAttribute("aria-label", t("themeToggle"));
    }
    const meta = $("metaThemeColor") || document.querySelector('meta[name="theme-color"]');
    if(meta) meta.setAttribute("content", dark ? "#05070C" : "#F4F6F9");
  }
  function setTheme(theme, {persist = true, pulse = false} = {}){
    if(theme !== "dark" && theme !== "light") return;
    state.theme = theme;
    if(persist) store.set(KEY.theme, theme);
    applyTheme();
    if(pulse) pulseDial($("btnTheme"), theme === "dark" ? "rgba(120,170,255,0.55)" : "rgba(255,200,90,0.55)");
    emit("ui:theme", {theme});
  }
  const toggleTheme = () => setTheme(state.theme === "dark" ? "light" : "dark", {pulse:true});

  // ---- language ----
  // The shell mirrors with the language: rtl (sidebar on the right) for fa,
  // ltr for en. While #app is on screen the sidebar slides out on its side and
  // back in from the other one; hidden, the direction just flips.
  let relayoutTimer = 0;
  function relayoutApp(){
    const app = $("app");
    if(!app) return;
    const dir = LANG_DIR[state.lang] || "rtl";
    if(app.getAttribute("dir") === dir) return;
    const showing = !app.classList.contains("hidden") && app.offsetParent !== null;
    if(!showing){ app.setAttribute("dir", dir); return; }
    clearTimeout(relayoutTimer);
    app.classList.remove("is-relayout-in");
    app.classList.add("is-relayout-out");
    relayoutTimer = setTimeout(() => {
      app.setAttribute("dir", dir);
      app.classList.remove("is-relayout-out");
      app.classList.add("is-relayout-in");
      void app.offsetWidth;
      app.classList.add("is-relayout-done");
      relayoutTimer = setTimeout(() => app.classList.remove("is-relayout-in", "is-relayout-done"), 420);
    }, 320);
  }
  function applyLang(){
    const fa = state.lang === "fa";
    const html = document.documentElement;
    html.setAttribute("lang", state.lang);
    html.setAttribute("dir", LANG_DIR[state.lang] || "rtl");
    const txt = $("langDialText"), btn = $("btnLang");
    if(txt){ txt.textContent = fa ? "EN" : "فا"; txt.setAttribute("lang", fa ? "en" : "fa"); }
    if(btn){
      btn.classList.toggle("state-fa", fa);
      btn.classList.toggle("state-en", !fa);
      btn.setAttribute("aria-pressed", String(!fa));
      btn.title = t("langToggle"); btn.setAttribute("aria-label", t("langToggle"));
    }
    applyTheme();            // capsule titles follow the language
    relayoutApp();
    applyI18n(document);
    syncSidebarTitles();
  }
  function setLang(lang, {persist = true, pulse = false} = {}){
    if(!LANG_DIR[lang] || lang === state.lang) return;
    const prev = state.lang;
    state.lang = lang;
    if(persist) store.set(KEY.lang, lang);
    applyLang();
    if(pulse) pulseDial($("btnLang"), lang === "fa" ? "rgba(200,110,150,0.55)" : "rgba(52,179,199,0.55)");
    emit("ui:lang", {lang, prev});
  }
  const toggleLang = () => setLang(state.lang === "fa" ? "en" : "fa", {pulse:true});

  // ---- capsule docking ----
  // Fixed top-left on plain pages / the login screen; rides in the topbar tools
  // cluster while the shell is showing.
  function dockCapsule(target){
    const toggles = $("cornerToggles");
    if(!toggles) return;
    const host = target || $("topbarTools");
    if(host && toggles.parentElement !== host) host.prepend(toggles);
  }
  function undockCapsule(){
    const toggles = $("cornerToggles");
    if(toggles && toggles.parentElement !== document.body) document.body.insertBefore(toggles, document.body.firstChild);
  }

  // ---- sidebar ----
  function syncSidebarTitles(){
    const btn = $("btnSidebarCollapse");
    if(btn){
      btn.setAttribute("aria-expanded", String(!state.sidebarCollapsed));
      const label = state.sidebarCollapsed ? t("expandSidebar") : t("collapseSidebar");
      btn.title = label; btn.setAttribute("aria-label", label);
    }
    // labels become tooltips while collapsed
    document.querySelectorAll(".sidebar .btn, .sidebar .sidebar-submenu-item").forEach(el => {
      const text = el.querySelector(".sidebar-menu-label")?.textContent?.trim();
      if(text) el.title = state.sidebarCollapsed ? text : "";
    });
  }
  function setSidebarCollapsed(collapsed, {persist = true} = {}){
    const app = $("app");
    state.sidebarCollapsed = Boolean(collapsed);
    if(app) app.classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
    syncSidebarTitles();
    if(persist) store.set(KEY.sidebar, String(state.sidebarCollapsed));
    emit("ui:sidebar", {collapsed:state.sidebarCollapsed});
  }
  const openDrawer = () => $("app")?.classList.add("sidebar-open");
  const closeDrawer = () => $("app")?.classList.remove("sidebar-open");
  function bindSidebar(){
    $("btnSidebarCollapse")?.addEventListener("click", () => setSidebarCollapsed(!state.sidebarCollapsed));
    $("btnHamburger")?.addEventListener("click", openDrawer);
    $("sidebarScrim")?.addEventListener("click", closeDrawer);
    document.addEventListener("keydown", e => { if(e.key === "Escape") closeDrawer(); });
    // any nav click closes the drawer on mobile
    document.querySelector(".sidebar")?.addEventListener("click", e => {
      if(e.target.closest(".sidebar-actions .btn:not(.sidebar-menu-parent), .sidebar-submenu-item, .history-item")) closeDrawer();
    });
    // collapsible groups: <div class="sidebar-menu-group"><button class="sidebar-menu-parent">…</button><div class="sidebar-submenu">…</div></div>
    document.querySelectorAll(".sidebar-menu-group").forEach(group => {
      const parent = group.querySelector(".sidebar-menu-parent");
      const sub = group.querySelector(".sidebar-submenu");
      if(!parent || !sub) return;
      const key = "nejacheque.menu." + (group.id || parent.textContent.trim());
      const setOpen = (open, persist = true) => {
        group.classList.toggle("open", open);
        sub.classList.toggle("open", open);
        sub.setAttribute("aria-hidden", String(!open));
        parent.setAttribute("aria-expanded", String(open));
        if(persist) store.set(key, String(open));
      };
      const saved = store.get(key);
      setOpen(saved === null ? group.classList.contains("open") : saved === "true", false);
      parent.addEventListener("click", () => {
        // collapsed rail: expand the sidebar so the submenu has room
        if(state.sidebarCollapsed && window.innerWidth > 720){ setSidebarCollapsed(false); setOpen(true); return; }
        setOpen(!group.classList.contains("open"));
      });
    });
    setSidebarCollapsed(state.sidebarCollapsed, {persist:false});
  }

  // ---- toast / modal ----
  let toastTimer = 0;
  function toast(message, {type = "", duration = 3600} = {}){
    let el = $("toast");
    if(!el){ el = document.createElement("div"); el.id = "toast"; el.className = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
    el.textContent = message;
    el.className = "toast show" + (type ? " " + type : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), duration);
  }
  // <div class="modal-backdrop" id="myModal"><div class="modal">…</div></div>
  function openModal(id){
    const bd = typeof id === "string" ? $(id) : id;
    if(!bd) return;
    bd.classList.add("show");
    bd.querySelector("input,textarea,select,button")?.focus?.();
  }
  function closeModal(id){
    const bd = typeof id === "string" ? $(id) : id;
    if(bd) bd.classList.remove("show");
  }
  function bindModals(){
    document.addEventListener("click", e => {
      const bd = e.target.closest(".modal-backdrop");
      if(bd && e.target === bd) closeModal(bd);               // click on the veil
      const closer = e.target.closest("[data-modal-close]");
      if(closer) closeModal(closer.closest(".modal-backdrop") || closer.dataset.modalClose);
      const opener = e.target.closest("[data-modal-open]");
      if(opener) openModal(opener.dataset.modalOpen);
    });
    document.addEventListener("keydown", e => {
      if(e.key === "Escape") document.querySelectorAll(".modal-backdrop.show").forEach(closeModal);
    });
  }

  // ---- init ----
  let inited = false;
  function init(){
    if(inited) return; inited = true;
    $("btnTheme")?.addEventListener("click", toggleTheme);
    $("btnLang")?.addEventListener("click", toggleLang);
    const app = $("app");
    if(app && !app.hasAttribute("dir")) app.setAttribute("dir", LANG_DIR[state.lang] || "rtl");
    applyTheme();
    applyLang();
    bindSidebar();
    bindModals();
    // shell showing (no login overlay on top) -> capsule lives in the topbar
    if(app && !app.classList.contains("hidden") && $("topbarTools")) dockCapsule();
    document.querySelectorAll("[data-toast]").forEach(el => el.addEventListener("click", () => toast(el.dataset.toast, {type:el.dataset.toastType || ""})));
  }
  if(cfg.autoInit){
    if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }

  window.OdiqUI = {
    state, config:cfg, init,
    theme:{set:setTheme, toggle:toggleTheme, apply:applyTheme},
    lang:{set:setLang, toggle:toggleLang, apply:applyLang, dir:() => LANG_DIR[state.lang] || "rtl"},
    i18n:{add:addStrings, t, apply:applyI18n, dateLocale, dict:I18N},
    capsule:{dock:dockCapsule, undock:undockCapsule, pulse:pulseDial},
    sidebar:{setCollapsed:setSidebarCollapsed, toggle:() => setSidebarCollapsed(!state.sidebarCollapsed), openDrawer, closeDrawer},
    toast, modal:{open:openModal, close:closeModal}
  };
})();
