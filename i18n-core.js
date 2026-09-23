// i18n-core.js — Moteur i18n partage (code seul, SANS les traductions) — Les Jardins Enchantes
// SOURCE DE VERITE (avec i18n-common/home/blog/legal/product.js). Editable a la main.
// i18n.js (bundle complet, fallback legacy) est GENERE depuis ce fichier par tools/build-i18n.js
// -> apres toute modif ici, lancer : node tools/build-i18n.js
// Charge par le loader de cart.js sur TOUTES les pages, avant i18n-common.js.
(function(){
  var G = (typeof window !== "undefined") ? window : this;
  G.TRANSLATIONS = G.TRANSLATIONS || {};
  if (!G.TRANSLATIONS.fr) G.TRANSLATIONS.fr = {};

  /* Dans i18n.js ces fonctions etaient au niveau global : on les re-expose. */
  /* (declarations de fonctions hoistees : disponibles des maintenant) */
  G.getLang = getLang;
  G.applyTranslations = applyTranslations;
  G.translateProduct = translateProduct;
  G.translateCart = translateCart;
  G.initI18n = initI18n;

/* Expose pour scripts dynamiques (formulaire retractation) */
try { window.TRANSLATIONS = TRANSLATIONS; } catch(e){}
window.t = function(key){
  try {
    var lang = (typeof getLang === 'function') ? getLang() : 'fr';
    var dict = (TRANSLATIONS && TRANSLATIONS[lang]) ? TRANSLATIONS[lang] : TRANSLATIONS.fr;
    if (dict && dict[key] != null) return dict[key];
    return (TRANSLATIONS.fr && TRANSLATIONS.fr[key] != null) ? TRANSLATIONS.fr[key] : key;
  } catch(e){ return key; }
};


function getLang() {
  /* Pages prerendues /pt/, /es/, /de/, /it/ : la langue du chemin fait foi.
     Sans cela, un visiteur (ou Googlebot, navigator.language = en) recevait la
     page traduite puis le JS la repassait en francais. */
  var pathLang = ((location.pathname || "").match(/^\/(pt|es|de|it)(\/|$)/) || [])[1];
  if (pathLang && TRANSLATIONS[pathLang]) { try { localStorage.setItem("lang", pathLang); } catch(e){} return pathLang; }
  var params = new URLSearchParams(location.search);
  var urlLang = (params.get("lang") || "").slice(0, 2).toLowerCase();
  if (urlLang && TRANSLATIONS[urlLang]) { try { localStorage.setItem("lang", urlLang); } catch(e){} return urlLang; }
  const saved = localStorage.getItem("lang");
  const browser = (navigator.language || "fr").slice(0, 2).toLowerCase();
  return saved || (TRANSLATIONS[browser] ? browser : "fr");
}

function applyTranslations() {
  const lang = getLang();
  const dict = TRANSLATIONS[lang] || TRANSLATIONS.fr;
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    if (dict[key]) { var __v = dict[key]; if (typeof __v === "string" && /<[a-z][\s\S]*>/i.test(__v)) { el.innerHTML = __v; } else { el.textContent = __v; } }
  });
}

function translateProduct() {
  const lang = getLang();
  if (lang === "fr") return;
  const dict = TRANSLATIONS[lang] || TRANSLATIONS.fr;
  const fr = TRANSLATIONS.fr;
  // bouton AJOUTER AU PANIER
  document.querySelectorAll(".add-to-cart").forEach(b => {
    if (b.textContent.trim() === fr.prod_add && dict.prod_add) b.textContent = dict.prod_add;
  });
  // titres de section Description / Caractéristiques
  document.querySelectorAll(".section-title").forEach(h => {
    const t = h.textContent.trim();
    if (t === fr.prod_desc && dict.prod_desc) h.textContent = dict.prod_desc;
    else if (t === fr.prod_feat && dict.prod_feat) h.textContent = dict.prod_feat;
  });
}

function translateCart() {
  const lang = getLang();
  if (lang === "fr") return;
  const dict = TRANSLATIONS[lang] || TRANSLATIONS.fr;
  const fr = TRANSLATIONS.fr;
  const pairs = [
    ["cart_total", fr.cart_total], ["cart_pay", fr.cart_pay],
    ["cart_empty", fr.cart_empty], ["cart_clear", fr.cart_clear],
    ["cart_loading", fr.cart_loading]
  ];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    const txt = n.textContent.trim();
    for (const [key, frVal] of pairs) {
      if (txt === frVal && dict[key]) { n.textContent = n.textContent.replace(frVal, dict[key]); }
    }
  }
}

function initI18n() {
  applyTranslations();
  translateProduct();
  const obs = new MutationObserver(() => { translateCart(); translateProduct(); });
  obs.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initI18n);
} else {
  initI18n();
}


/* ==== Menus deroulants Langue + Categories (epure, responsive, premium mobile, additif) ==== */
(function(){
  var SUPPORTED = ['fr','pt','es','it','de'];
  var LANG_ORDER = ['fr','pt','es','de','it'];
  var LABELS = { fr:'FR', pt:'PT', es:'ES', it:'IT', de:'DE' };

  window.setLang = function(lang){
    if (SUPPORTED.indexOf(lang) === -1) lang = 'fr';
    try { localStorage.setItem('lang', lang); } catch(e){}
    /* Si une version prerendue existe dans cette langue (hreflang), on y va :
       c'est la vraie page traduite, avec sa propre URL. */
    try {
      var __alt = document.querySelector('link[rel="alternate"][hreflang="' + lang + '"]');
      if (__alt && __alt.href) {
        var __t = new URL(__alt.href, location.href);
        if (__t.pathname.replace(/\/$/, '') !== location.pathname.replace(/\/$/, '')) { location.href = __t.pathname + __t.hash; return; }
      }
    } catch(e){}
    try { var __u = new URL(location.href); if (lang === 'fr') { __u.searchParams.delete('lang'); } else { __u.searchParams.set('lang', lang); } history.replaceState(null, '', __u); } catch(e){}
    document.documentElement.lang = lang;
    if (typeof initI18n === 'function') initI18n();
    document.querySelectorAll('.dd--lang .dd__item').forEach(function(b){
      b.classList.toggle('is-active', b.getAttribute('data-lang') === lang);
    });
    document.querySelectorAll('.nav-dd').forEach(function(d){ d.classList.remove('is-open'); });
  };

  function injectCss(){
    if (document.getElementById('nav-dd-css')) return;
    // GEO: le CSS nav-dd/lang-switch est desormais statique dans style.css (meilleur ratio de rendu LLM).
    // Verification de presence; sinon fallback injection comme avant.
    try {
      var probe = document.createElement('div');
      probe.className = 'nav-dd';
      probe.style.visibility = 'hidden';
      probe.style.pointerEvents = 'none';
      document.body.appendChild(probe);
      var pos = getComputedStyle(probe).position;
      document.body.removeChild(probe);
      if (pos === 'relative') { return; }
    } catch(e){}
    var css = '.lux-header{display:flex;align-items:center;gap:24px}'
    + '.cat-nav{margin:0}'
    + '.lang-switch{width:auto!important;flex-basis:auto!important;margin-left:auto;order:0}'
    + '.nav-dd{position:relative;display:inline-block}'
    + '.dd__btn{display:inline-flex;align-items:center;gap:8px;font-family:Inter,sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#e6c98a;background:rgba(202,168,106,.06);border:1px solid rgba(202,168,106,.35);border-radius:6px;padding:11px 16px;cursor:pointer;transition:all .25s;white-space:nowrap}'
    + '.dd__btn:hover,.dd__btn[aria-expanded="true"]{color:#0c0a06;background:linear-gradient(135deg,#e6c98a 0%,#caa86a 50%,#b89050 100%);border-color:transparent}'
    + '.dd__caret{width:8px;height:8px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(45deg) translateY(-2px);transition:transform .25s}'
    + '.dd__btn[aria-expanded="true"] .dd__caret{transform:rotate(-135deg) translateY(-2px)}'
    + '.dd__panel{position:absolute;top:calc(100% + 10px);right:0;min-width:210px;background:#141009;border:1px solid rgba(202,168,106,.3);border-radius:8px;box-shadow:0 18px 40px rgba(0,0,0,.55);padding:6px;z-index:1200;opacity:0;visibility:hidden;transform:translateY(-8px);transition:all .22s ease;display:flex;flex-direction:column;gap:2px}'
    + '.nav-dd.is-open .dd__panel{opacity:1;visibility:visible;transform:translateY(0)}'
    + '.dd__item{display:flex;align-items:center;gap:10px;font-family:Inter,sans-serif;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:rgba(230,201,138,.85);text-decoration:none;background:none;border:none;text-align:left;padding:11px 14px;border-radius:5px;cursor:pointer;transition:all .2s;width:100%}'
    + '.dd__item:hover{background:rgba(202,168,106,.12);color:#f2ddb0}'
    + '.dd__item.is-active{background:linear-gradient(135deg,#e6c98a,#caa86a);color:#0c0a06;font-weight:600}'
    + '.dd--lang .dd__panel{min-width:120px}'
    + '.dd--lang .dd__item{justify-content:center;letter-spacing:2px}'
    + '.lux-mbrand{display:none}'
    + '.lux-mmenus{display:none}'
    + '@media(min-width:561px){.lux-header{background:linear-gradient(180deg,rgba(10,8,4,.85) 0%,rgba(10,8,4,.45) 60%,rgba(10,8,4,0) 100%)!important;border-bottom:1px solid rgba(202,168,106,.14)}.lux-header:hover{background:linear-gradient(180deg,rgba(10,8,4,.92) 0%,rgba(10,8,4,.6) 100%)!important}}'
    + '@media(max-width:768px){.lux-header{flex-wrap:wrap;gap:14px 10px}.nav-dd .dd__panel{right:auto;left:0}.dd--lang .dd__panel{right:0;left:auto}}'
    + '@media(max-width:560px){'
    + '.lux-header{display:grid!important;grid-template-columns:auto 1fr auto;grid-template-areas:"logo brand cart" "menus menus menus";align-items:center;gap:16px 12px;padding:16px 18px 18px;background:linear-gradient(180deg,#0d0a06 0%,#141009 100%);border-bottom:1px solid rgba(202,168,106,.22);box-shadow:0 1px 0 rgba(202,168,106,.10),0 14px 34px rgba(0,0,0,.45)}'
    + '.lux-header .header-logo-link{grid-area:logo;margin:0}'
    + '.lux-header .header-logo-img{width:46px!important;height:46px!important;box-shadow:0 0 0 1px rgba(202,168,106,.4);border-radius:50%}'
    + '.lux-mbrand{display:block;grid-area:brand;font-family:"Cormorant Garamond",serif;font-size:15px;letter-spacing:5px;color:#e6c98a;text-transform:uppercase;text-align:center;line-height:1.1;font-weight:400;white-space:nowrap;opacity:.92}'
    + '.lux-mbrand small{display:block;font-size:9px;letter-spacing:4px;opacity:.6;margin-top:2px}'
    + '.lux-cart{grid-area:cart;margin:0!important;font-size:0!important;background:none!important;border:1px solid rgba(202,168,106,.35)!important;width:44px;height:44px;border-radius:50%;display:inline-flex!important;align-items:center;justify-content:center;position:relative;padding:0!important}'
    + '.lux-cart::before{content:"\\1F6D2";font-size:18px;color:#e6c98a;line-height:1}'
    + '.lux-cart>span[data-i18n]{display:none}'
    + '.lux-cart #cartCount{position:absolute;top:-5px;right:-5px;background:linear-gradient(135deg,#e6c98a,#b89050);color:#0c0a06;font-size:10px;font-weight:700;min-width:18px;height:18px;border-radius:9px;display:flex;align-items:center;justify-content:center;padding:0 4px}'
    + '.lux-mmenus{display:flex!important;grid-area:menus;align-items:stretch;gap:0;border:1px solid rgba(202,168,106,.28);border-radius:12px;background:rgba(202,168,106,.04)}'
    + '.lux-mmenus .nav-dd{flex:1;display:block}'
    + '.lux-mmenus .nav-dd+.nav-dd{border-left:1px solid rgba(202,168,106,.20)}'
    + '.lux-mmenus .dd__btn{width:100%;justify-content:center;gap:9px;background:none!important;border:none!important;border-radius:12px;padding:15px 10px;font-size:11px;letter-spacing:3px;color:#e6c98a}'
    + '.lux-mmenus .dd__btn:hover,.lux-mmenus .dd__btn[aria-expanded="true"]{background:rgba(202,168,106,.10)!important;color:#f2ddb0!important}'
    + '.lux-mmenus .dd__caret{width:7px;height:7px;opacity:.85}'
    + '.lux-mmenus .dd__panel{top:calc(100% + 12px);background:#100c07;border:1px solid rgba(202,168,106,.3);border-radius:12px;padding:8px;box-shadow:0 22px 46px rgba(0,0,0,.6)}'
    + '.lux-mmenus .dd--cat .dd__panel{left:0;right:auto;min-width:min(230px,74vw)}'
    + '.lux-mmenus .dd--lang .dd__panel{left:auto;right:0;min-width:150px}'
    + '.lux-mmenus .dd__item{padding:13px 16px;font-size:12px;letter-spacing:1.8px}'
    + '.cat-nav,.lang-switch{display:none!important}'
    + '}';
    var st = document.createElement('style'); st.id='nav-dd-css'; st.textContent=css;
    document.head.appendChild(st);
  }

  function closeAll(){ document.querySelectorAll('.nav-dd').forEach(function(d){ d.classList.remove('is-open'); var b=d.querySelector('.dd__btn'); if(b) b.setAttribute('aria-expanded','false'); }); }

  function makeDD(cls, labelTxt, itemsHtml){
    var dd=document.createElement('div'); dd.className='nav-dd '+cls;
    dd.innerHTML='<button type="button" class="dd__btn" aria-haspopup="true" aria-expanded="false">'
      + '<span>'+labelTxt+'</span> <span class="dd__caret"></span></button>'
      + '<div class="dd__panel">'+itemsHtml+'</div>';
    var btn=dd.querySelector('.dd__btn');
    btn.addEventListener('click', function(e){ e.stopPropagation();
      var open=dd.classList.contains('is-open'); closeAll();
      if(!open){ dd.classList.add('is-open'); btn.setAttribute('aria-expanded','true'); }
    });
    return dd;
  }

  window.renderNavMenus = function(){
    injectCss();
    var header=document.querySelector('.lux-header');
    var catDD=null, langDD=null;

    document.querySelectorAll('.cat-nav').forEach(function(nav){
      if (nav.dataset.ddReady) return; nav.dataset.ddReady='1';
      var links=[].slice.call(nav.querySelectorAll('a'));
      var items=links.map(function(a){
        var key=a.getAttribute('data-i18n')||'';
        return '<a class="dd__item" href="'+a.getAttribute('href')+'"'+(key?' data-i18n="'+key+'"':'')+'>'+a.textContent+'</a>';
      }).join('');
      catDD=makeDD('dd--cat','Cat\u00e9gories',items);
      nav.textContent=''; nav.appendChild(catDD);
    });

    var cur=(typeof getLang==='function')?getLang():'fr';
    document.querySelectorAll('.lang-switch').forEach(function(box){
      if (box.dataset.ddReady) return; box.dataset.ddReady='1';
      var items=LANG_ORDER.map(function(l){
        return '<button type="button" class="dd__item'+(l===cur?' is-active':'')+'" data-lang="'+l+'">'+LABELS[l]+'</button>';
      }).join('');
      langDD=makeDD('dd--lang','Langue',items);
      box.textContent=''; box.appendChild(langDD);
      langDD.querySelectorAll('.dd__item').forEach(function(b){ b.addEventListener('click',function(ev){ ev.stopPropagation(); window.setLang(b.getAttribute('data-lang')); }); });
    });

    if (header && !header.dataset.mReady){
      header.dataset.mReady='1';
      var logo=header.querySelector('.header-logo-link');
      if (logo && !header.querySelector('.lux-mbrand')){
        var brand=document.createElement('div'); brand.className='lux-mbrand';
        brand.innerHTML='Les Jardins<small>Enchant\u00e9s</small>';
        logo.insertAdjacentElement('afterend', brand);
      }
      if (catDD && langDD && !header.querySelector('.lux-mmenus')){
        var row=document.createElement('div'); row.className='lux-mmenus';
        var cCat=catDD.cloneNode(true), cLang=langDD.cloneNode(true);
        [cCat,cLang].forEach(function(dd){
          var btn=dd.querySelector('.dd__btn');
          btn.addEventListener('click',function(e){e.stopPropagation();var open=dd.classList.contains('is-open');closeAll();if(!open){dd.classList.add('is-open');btn.setAttribute('aria-expanded','true');}});
        });
        cLang.querySelectorAll('.dd__item').forEach(function(b){ b.addEventListener('click',function(ev){ev.stopPropagation();window.setLang(b.getAttribute('data-lang'));}); });
        row.appendChild(cCat); row.appendChild(cLang);
        var cart=header.querySelector('.lux-cart');
        if(cart) header.insertBefore(row, cart.nextSibling); else header.appendChild(row);
      }
    }

    document.removeEventListener('click', closeAll);
    document.addEventListener('click', closeAll);
  };
  window.renderLangSwitcher = window.renderNavMenus;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.renderNavMenus);
  } else {
    window.renderNavMenus();
  }
})();

})();

/* >>> Lien CONTACT ajoute au menu Categories et au footer, sur toutes les pages (P0-3) >>> */
(function () {
  var LABELS = {
    fr: { menu: 'CONTACT', footer: 'Contact' },
    pt: { menu: 'CONTACTO', footer: 'Contacto' },
    es: { menu: 'CONTACTO', footer: 'Contacto' },
    it: { menu: 'CONTATTI', footer: 'Contatti' },
    de: { menu: 'KONTAKT', footer: 'Kontakt' }
  };
  try {
    window.TRANSLATIONS = window.TRANSLATIONS || {};
    for (var l in LABELS) {
      if (!window.TRANSLATIONS[l]) window.TRANSLATIONS[l] = {};
      window.TRANSLATIONS[l].menu_contact = LABELS[l].menu;
      window.TRANSLATIONS[l].footer_contact = LABELS[l].footer;
    }
  } catch (e) {}

  function curLang() {
    try { return (typeof window.getLang === 'function') ? window.getLang() : 'fr'; } catch (e) { return 'fr'; }
  }

  function addContactLinks() {
    var L = LABELS[curLang()] || LABELS.fr;
    document.querySelectorAll('.dd--cat .dd__panel').forEach(function (panel) {
      if (panel.querySelector('a[href$="contact.html"]')) return;
      var a = document.createElement('a');
      a.className = 'dd__item';
      a.href = 'contact.html';
      a.setAttribute('data-i18n', 'menu_contact');
      a.textContent = L.menu;
      panel.appendChild(a);
    });
    document.querySelectorAll('footer').forEach(function (f) {
      if (f.querySelector('a[href$="contact.html"]')) return;
      var a = document.createElement('a');
      a.href = 'contact.html';
      a.setAttribute('data-i18n', 'footer_contact');
      a.textContent = L.footer;
      f.appendChild(document.createTextNode(' '));
      f.appendChild(a);
    });
    try { if (typeof window.applyTranslations === 'function') window.applyTranslations(); } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(addContactLinks, 0); });
  } else {
    setTimeout(addContactLinks, 0);
  }
})();
/* <<< fin lien CONTACT <<< */

/* >>> Liens LIVRAISON et FAQ ajoutes au menu Categories et au footer, sur toutes les pages (P0-3) >>> */
(function () {
  var PAGES = [
    { file: 'livraison.html', key: 'page_livraison', labels: {
      fr: { menu: 'LIVRAISON', footer: 'Livraison' },
      pt: { menu: 'ENTREGA', footer: 'Entrega' },
      es: { menu: 'ENVÍO', footer: 'Envío' },
      it: { menu: 'SPEDIZIONE', footer: 'Spedizione' },
      de: { menu: 'VERSAND', footer: 'Versand' }
    } },
    { file: 'faq.html', key: 'page_faq', labels: {
      fr: { menu: 'FAQ', footer: 'FAQ' },
      pt: { menu: 'FAQ', footer: 'FAQ' },
      es: { menu: 'FAQ', footer: 'FAQ' },
      it: { menu: 'FAQ', footer: 'FAQ' },
      de: { menu: 'FAQ', footer: 'FAQ' }
    } }
  ];

  try {
    window.TRANSLATIONS = window.TRANSLATIONS || {};
    PAGES.forEach(function (p) {
      for (var l in p.labels) {
        if (!window.TRANSLATIONS[l]) window.TRANSLATIONS[l] = {};
        window.TRANSLATIONS[l]['menu_' + p.key] = p.labels[l].menu;
        window.TRANSLATIONS[l]['footer_' + p.key] = p.labels[l].footer;
      }
    });
  } catch (e) {}

  function curLang() {
    try { return (typeof window.getLang === 'function') ? window.getLang() : 'fr'; } catch (e) { return 'fr'; }
  }

  function addPageLinks() {
    var lang = curLang();
    PAGES.forEach(function (p) {
      var L = p.labels[lang] || p.labels.fr;
      document.querySelectorAll('.dd--cat .dd__panel').forEach(function (panel) {
        if (panel.querySelector('a[href$="' + p.file + '"]')) return;
        var a = document.createElement('a');
        a.className = 'dd__item';
        a.href = p.file;
        a.setAttribute('data-i18n', 'menu_' + p.key);
        a.textContent = L.menu;
        var ref = panel.querySelector('a[href$="contact.html"]');
        if (ref) { panel.insertBefore(a, ref); } else { panel.appendChild(a); }
      });
      document.querySelectorAll('footer').forEach(function (f) {
        if (f.querySelector('a[href$="' + p.file + '"]')) return;
        var a = document.createElement('a');
        a.href = p.file;
        a.setAttribute('data-i18n', 'footer_' + p.key);
        a.textContent = L.footer;
        var ref = f.querySelector('a[href$="contact.html"]');
        if (ref) { f.insertBefore(a, ref); f.insertBefore(document.createTextNode(' '), ref); }
        else { f.appendChild(document.createTextNode(' ')); f.appendChild(a); }
      });
    });
    try { if (typeof window.applyTranslations === 'function') window.applyTranslations(); } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(addPageLinks, 0); });
  } else {
    setTimeout(addPageLinks, 0);
  }
})();
/* <<< fin liens LIVRAISON et FAQ <<< */

/* >>> hreflang + canonical par langue (P2-20) >>> */
(function () {
  var LANGS = ["fr", "pt", "it", "es", "de"];
  try {
    var head = document.head; if (!head) return;
    var can = head.querySelector('link[rel="canonical"]');
    if (!can) return;
    var base = can.href.split("?")[0].split("#")[0];
    var params = new URLSearchParams(location.search);
    var cur = (params.get("lang") || "").slice(0, 2).toLowerCase();
    if (LANGS.indexOf(cur) > 0) { can.href = base + "?lang=" + cur; }
    if (!head.querySelector('link[rel="alternate"][hreflang]')) {
      LANGS.forEach(function (l) {
        var el = document.createElement("link");
        el.rel = "alternate"; el.hreflang = l;
        el.href = (l === "fr") ? base : base + "?lang=" + l;
        head.appendChild(el);
      });
      var xd = document.createElement("link");
      xd.rel = "alternate"; xd.hreflang = "x-default"; xd.href = base;
      head.appendChild(xd);
    }
  } catch (e) {}
})();
/* <<< fin hreflang + canonical par langue <<< */
