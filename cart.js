/* >>> Theme clair global : charge theme-clair.css sur toutes les pages >>> */
(function () {
  try {
    if (document.querySelector('link[data-lje-theme]')) return;
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = '/theme-clair.css?v=20260820f';
    l.setAttribute('data-lje-theme', '1');
    (document.head || document.documentElement).appendChild(l);
  } catch (e) {}
})();
/* <<< fin theme clair <<< */

/* >>> Chargeur i18n par section (optimise: commun + section de la page, fallback i18n.js complet) >>> */
(function () {
  var I18N_VER = "20260924a"; // bump ce numero pour forcer le rechargement des fichiers i18n (contourne le cache CDN/navigateur)
  function runI18n() {
    try { if (typeof initI18n === 'function') initI18n(); } catch (e) {}
    try { if (typeof window.applyTranslations === 'function') window.applyTranslations(); } catch (e) {}
  }
  if (typeof TRANSLATIONS !== 'undefined') { runI18n(); return; }
  if (document.querySelector('script[src="/i18n.js"], script[src="i18n.js"]')) { return; }
  function pageSection() {
    var file = ((location.pathname || '').toLowerCase().split('/').pop()) || 'index.html';
    if (file === '' || file === 'index.html' || file === 'index') return 'home';
    if (/^(cgv|confidentialite|cookies|mentions-legales|retractation)/.test(file)) return 'legal';
    if (/^blog/.test(file)) return 'blog';
    return /^(404|contact|livraison|faq|erreur|success|cancel)(\.html)?$/.test(file) ? null : 'product';
  }
  var sec = pageSection(); var sections = ['i18n-core.js', 'i18n-common.js']; if (sec) sections.push('i18n-' + sec + '.js');
  var fellBack = false;
  function loadFull() {
    if (fellBack) return; fellBack = true;
    var s = document.createElement('script');
    s.src = '/i18n.js?v=' + I18N_VER; s.onload = runI18n;
    document.head.appendChild(s);
  }
  function loadSeq(i) {
    if (i >= sections.length) { runI18n(); return; }
    var s = document.createElement('script');
    s.src = '/' + sections[i] + '?v=' + I18N_VER;
    s.onload = function () { loadSeq(i + 1); };
    s.onerror = loadFull;
    document.head.appendChild(s);
  }
  loadSeq(0);
})();

/* ============================================
cart.js – Système panier unifié
Les Jardins Enchantés
============================================ */

// ── Versioning du panier ──────────────────────
// Incrémente cette valeur à chaque modif de prix/produits Stripe
// pour purger automatiquement les anciens paniers obsolètes
// stockés dans le localStorage des clients.
const CART_VERSION = "v4-2026-05-27";

(function purgeOldCart() {
try {
const storedVersion = localStorage.getItem("cart_version");
if (storedVersion !== CART_VERSION) {
localStorage.removeItem("cart");
localStorage.setItem("cart_version", CART_VERSION);
}
} catch (e) { /* localStorage indispo, on ignore */ }
})();

// ── Lecture / écriture localStorage ──────────
function getCart() {
return JSON.parse(localStorage.getItem("cart")) || [];
}

function saveCart(cart) {
localStorage.setItem("cart", JSON.stringify(cart));
}

// ── Mise à jour du compteur dans le header ────
function updateCartCount() {
const badge = document.getElementById("cartCount");
if (badge) {
const cart = getCart();
badge.textContent = cart.length;
}
}

// ── Ajout au panier ───────────────────────────
function addToCart(id, name, price, priceId) {
const cart = getCart();
cart.push({ id, name, price, priceId });
saveCart(cart);
updateCartCount();
showToast(name + " ajouté au panier");
}

// ── Ajout au panier avec gestion de la taille ─
// Utilisé par les pages produits ayant un sélecteur .size-options
// Chaque <input name="size"> doit porter un data-price-id correspondant
// au Price ID Stripe de cette taille.
function addToCartWithSize(btn) {
const button = btn || (event && event.currentTarget) || document.querySelector(".add-to-cart");
if (!button) return;

const sizeInput = document.querySelector('input[name="size"]:checked');
if (!sizeInput) {
showToast("Veuillez sélectionner une taille");
return;
}

const priceId = sizeInput.dataset.priceId || button.dataset.productId;
const size = sizeInput.value;
const baseName = button.dataset.productName || "Produit";
const name = baseName + " – Taille " + size;
const price = button.dataset.productPrice;

addToCart(priceId, name, price, priceId);
}

// ── Toast notification ────────────────────────
function showToast(message) {
let toast = document.getElementById("lux-toast");
if (!toast) {
toast = document.createElement("div");
toast.id = "lux-toast";
toast.style.cssText = `
position: fixed;
bottom: 32px;
right: 32px;
background: #1a1a1a;
border: 1px solid #caa86a;
color: #caa86a;
padding: 14px 24px;
font-size: 12px;
letter-spacing: 3px;
z-index: 9999;
opacity: 0;
transition: opacity 0.4s ease;
pointer-events: none;
`;
document.body.appendChild(toast);
}
toast.textContent = message;
toast.style.opacity = "1";
clearTimeout(toast._timeout);
toast._timeout = setTimeout(() => { toast.style.opacity = "0"; }, 2500);
}

// ── Regroupement des articles identiques (quantité) ──
// Le panier reste stocké comme une LISTE : 1 entrée = 1 exemplaire.
// Aucune migration du localStorage, aucun changement du payload envoyé à
// /api/stripe/checkout (le serveur compte chaque entrée pour 1).
function groupCart(cart) {
  const groups = [];
  const byKey = {};
  (cart || []).forEach((p) => {
    const key = p.priceId || p.id || p.name;
    if (!byKey[key]) { byKey[key] = { key: key, item: p, qty: 0 }; groups.push(byKey[key]); }
    byKey[key].qty += 1;
  });
  return groups;
}

// ── Quantité +/- et suppression par ligne ─────
function cartLineAdd(key) {
  const cart = getCart();
  const found = cart.find((p) => (p.priceId || p.id || p.name) === key);
  if (!found) return;
  cart.push({ id: found.id, name: found.name, price: found.price, priceId: found.priceId });
  saveCart(cart); updateCartCount(); showCart();
}

function cartLineRemoveOne(key) {
  const cart = getCart();
  const i = cart.findIndex((p) => (p.priceId || p.id || p.name) === key);
  if (i === -1) return;
  cart.splice(i, 1);
  saveCart(cart); updateCartCount(); showCart();
}

function cartLineDelete(key) {
  saveCart(getCart().filter((p) => (p.priceId || p.id || p.name) !== key));
  updateCartCount(); showCart();
}

// ── Rendu des lignes du panier (nom, quantité, prix unitaire, sous-total) ──
// Renvoie le sous-total produits, calculé sur les quantités réelles.
function renderCartLines(cartItems, cart) {
  let total = 0;
  const mkBtn = (txt, label, fn) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = txt; b.setAttribute("aria-label", label); b.title = label;
    b.style.cssText = "background:none;border:1px solid rgba(202,168,106,0.5);color:#caa86a;width:26px;height:26px;line-height:1;font-size:14px;cursor:pointer;border-radius:4px;flex:none;";
    b.addEventListener("click", fn);
    return b;
  };
  groupCart(cart).forEach((g) => {
    const p = g.item;
    const li = document.createElement("li");
    li.style.cssText = "list-style:none;padding:12px 0;border-bottom:1px solid rgba(202,168,106,0.15);";
    const row1 = document.createElement("div");
    row1.style.cssText = "display:flex;justify-content:space-between;align-items:flex-start;gap:8px;";
    const nm = document.createElement("span");
    nm.style.cssText = "font-size:13px;letter-spacing:1px;line-height:1.4;";
    nm.textContent = p.name;
    row1.appendChild(nm);
    row1.appendChild(mkBtn("\u00d7", "Supprimer " + p.name + " du panier", () => cartLineDelete(g.key)));
    const row2 = document.createElement("div");
    row2.style.cssText = "display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:8px;";
    const qty = document.createElement("div");
    qty.style.cssText = "display:flex;align-items:center;gap:8px;";
    const nb = document.createElement("span");
    nb.style.cssText = "font-size:13px;min-width:18px;text-align:center;";
    nb.textContent = g.qty;
    qty.appendChild(mkBtn("\u2212", "Retirer un exemplaire de " + p.name, () => cartLineRemoveOne(g.key)));
    qty.appendChild(nb);
    qty.appendChild(mkBtn("+", "Ajouter un exemplaire de " + p.name, () => cartLineAdd(g.key)));
    const unit = document.createElement("span");
    unit.style.cssText = "font-size:11px;opacity:.7;flex:1;text-align:center;";
    unit.textContent = Number(p.price).toFixed(2).replace(".", ",") + " € / u";
    const sum = document.createElement("span");
    sum.style.cssText = "color:#caa86a;font-size:13px;text-align:right;";
    sum.textContent = (Number(p.price) * g.qty).toFixed(2).replace(".", ",") + " €";
    row2.appendChild(qty); row2.appendChild(unit); row2.appendChild(sum);
    li.appendChild(row1); li.appendChild(row2);
    cartItems.appendChild(li);
    total += Number(p.price) * g.qty;
  });
  return total;
}

// ── Affichage du panier (modal) ───────────────
function showCart() {
  injectCartExtras(); // garantit la présence du récap + champ e-mail avant le rendu
const modal = document.getElementById("cart-modal");
const cartItems = document.getElementById("cart-items");
const cartTotal = document.getElementById("cart-total");

if (!modal || !cartItems || !cartTotal) return;

const cart = getCart();
cartItems.innerHTML = "";
let total = 0;

if (cart.length === 0) {
cartItems.innerHTML = "<li style='list-style:none;color:#9c9c9c;letter-spacing:2px;font-size:12px;'>Votre panier est vide</li>";
} else {
total = renderCartLines(cartItems, cart);
}

cartTotal.textContent = total.toFixed(2);
  // --- Récapitulatif panier (affichage) : sous-total, livraison, total ---
  // NB : cartTotal correspond au sous-total des produits (en euros).
  // La logique est un MIROIR du calcul serveur (checkout.js) :
  //   livraison offerte dès 75 € de produits, sinon 6,90 €.
  // La réduction de bienvenue -10 % est vérifiée et appliquée CÔTÉ SERVEUR
  // (une seule fois par client) ; on l'indique ici à titre informatif.
  try {
    var _summaryEl = document.getElementById("cart-summary");
    if (_summaryEl) {
      var _subtotal = Number(total) || 0; // FIX: total = somme des prix produits (cartTotal est l'element DOM)
      var FREE_SHIP = 75;
      var SHIP_FEE = 6.90;
      var _shipFree = _subtotal >= FREE_SHIP;
      var _shipping = _shipFree ? 0 : SHIP_FEE;
      var _total = _subtotal + _shipping;
      var _shipLabel = _shipFree
        ? '<span style="color:#2d7a30;">Offerts</span>'
        : SHIP_FEE.toFixed(2).replace('.', ',') + ' €';
      _summaryEl.innerHTML =
        '<div style="display:flex;justify-content:space-between;">' +
          '<span>Sous-total</span><span>' + _subtotal.toFixed(2).replace('.', ',') + ' €</span></div>' +
        '<div style="display:flex;justify-content:space-between;">' +
          '<span>Livraison</span><span>' + _shipLabel + '</span></div>' +
        (_shipFree ? '' :
          '<div style="font-size:12px;opacity:.8;">Plus que ' +
          (FREE_SHIP - _subtotal).toFixed(2).replace('.', ',') +
          ' € pour la livraison offerte</div>') +
        '<hr style="border:none;border-top:1px solid #caa86a;margin:8px 0;" />' +
        '<div style="display:flex;justify-content:space-between;font-weight:bold;">' +
          '<span>Total à payer</span><span>' + _total.toFixed(2).replace('.', ',') + ' €</span></div>' +
        '<div style="font-size:12px;opacity:.85;margin-top:8px;line-height:1.5;">' +
          'Si c\'est votre <strong>1re commande</strong>, une remise de <strong>-10 %</strong> est appliquée automatiquement à l\'étape de paiement sécurisé Stripe. Sinon, le total ci-dessus est le prix final.</div>';
    }
  } catch (e) { /* affichage récap non bloquant */ }

modal.style.display = "flex";
document.body.style.overflow = "hidden";
}

function closeCart() {
const modal = document.getElementById("cart-modal");
if (modal) {
modal.style.display = "none";
document.body.style.overflow = "";
}
}

function clearCart() {
saveCart([]);
updateCartCount();
const cartItems = document.getElementById("cart-items");
const cartTotal = document.getElementById("cart-total");
if (cartItems) cartItems.innerHTML = "";
if (cartTotal) cartTotal.textContent = "0.00";
}

// ── Checkout Stripe ───────────────────────────
async function checkout() {
  // --- Réduction de bienvenue : on récupère l'e-mail saisi dans le panier ---
  // L'e-mail est requis : le serveur s'en sert pour vérifier si le client a déjà
  // bénéficié de la remise de 10 % (vérification exclusivement côté serveur).
  var emailField = document.getElementById("cart-email");
  var email = emailField ? emailField.value.trim() : "";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    showToast("Merci d'indiquer un e-mail valide pour finaliser la commande.");
    if (emailField) emailField.focus();
    return;
  }

const cart = getCart();
if (cart.length === 0) {
showToast("Votre panier est vide");
return;
}

const btn = document.getElementById("checkout-btn");
if (btn) { btn.textContent = "CHARGEMENT..."; btn.disabled = true; }

try {
const res = await fetch("/api/stripe/checkout", {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify({ cart, email })
});

const data = await res.json();

if (data.url) {
window.location.href = data.url;
} else {
showToast("Erreur paiement : " + (data.error || "Réessayez"));
if (btn) { btn.textContent = "PAYER"; btn.disabled = false; }
}
} catch (err) {
console.error(err);
showToast("Erreur serveur – veuillez réessayer");
if (btn) { btn.textContent = "PAYER"; btn.disabled = false; }
}
}

// ── Initialisation au chargement de la page ───
document.addEventListener("DOMContentLoaded", () => {
updateCartCount();

// Gestion des boutons add-to-cart via data-attributes (pages produits)
document.querySelectorAll(".add-to-cart[data-product-id]").forEach(btn => {
btn.addEventListener("click", (e) => {
// Si la page contient un sélecteur de taille, utiliser addToCartWithSize
const hasSizeSelector = document.querySelector('input[name="size"]');
if (hasSizeSelector) {
e.preventDefault();
addToCartWithSize(btn);
return;
}
addToCart(
btn.dataset.productId,
btn.dataset.productName,
btn.dataset.productPrice,
btn.dataset.productId
);
});
});

// Fermeture modale en cliquant en dehors
const modal = document.getElementById("cart-modal");
if (modal) {
modal.addEventListener("click", (e) => {
if (e.target === modal) closeCart();
});
}
});

// ── Injection automatique de la modal panier ──
// Permet aux pages produits (qui n'ont pas la modal dans le HTML)
// d'avoir un panier fonctionnel via le bouton "PANIER" du header.
// ── Complète un modal panier déjà présent dans le HTML statique ──
// Certaines pages ont un #cart-modal codé en dur SANS le champ e-mail ni le
// récapitulatif détaillé. Cette fonction ajoute ces éléments s'ils manquent,
// juste avant le bouton PAYER, sans casser le markup existant.
function injectCartExtras() {
  var checkoutBtn = document.getElementById('checkout-btn');
  if (!checkoutBtn) return; // rien à faire si pas de bouton payer

  // 1) Récapitulatif détaillé (sous-total / réduction / livraison / total)
  if (!document.getElementById('cart-summary')) {
    var summary = document.createElement('div');
    summary.id = 'cart-summary';
    summary.style.cssText = 'font-family:Georgia,serif;font-size:13px;color:#e8dcc0;margin:14px 0;';
    checkoutBtn.parentNode.insertBefore(summary, checkoutBtn);
  }

  // 2) Champ e-mail requis (identifiant client pour la réduction, vérifiée serveur)
  if (!document.getElementById('cart-email')) {
    var wrap = document.createElement('div');
    wrap.style.cssText = 'margin:10px 0;';
    var label = document.createElement('div');
    label.style.cssText = 'font-family:Georgia,serif;font-size:12px;color:#caa86a;margin-bottom:6px;';
    label.textContent = 'E-mail (pour votre commande)';
    var input = document.createElement('input');
    input.id = 'cart-email';
    input.type = 'email';
    input.required = true;
    input.placeholder = 'Votre e-mail pour votre commande';
    input.style.cssText = 'width:100%;padding:10px 12px;margin:0;border:1px solid #caa86a;border-radius:6px;background:transparent;color:inherit;font-family:Georgia,serif;box-sizing:border-box;';
    wrap.appendChild(label);
    wrap.appendChild(input);
    checkoutBtn.parentNode.insertBefore(wrap, checkoutBtn);
  }

  // 3) Réassurance : moyens de paiement, colis neutre, acceptation des CGV
  if (!document.getElementById('cart-trust')) {
    var badge = 'border:1px solid rgba(202,168,106,.45);border-radius:4px;padding:2px 7px;letter-spacing:1px;';
    var trust = document.createElement('div');
    trust.id = 'cart-trust';
    trust.style.cssText = 'font-family:Georgia,serif;font-size:11px;line-height:1.7;color:#caa86a;opacity:.9;margin:12px 0 4px;';
    trust.innerHTML =
      '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">' +
        '<span style="' + badge + '">VISA</span>' +
        '<span style="' + badge + '">MASTERCARD</span>' +
        '<span style="' + badge + '">Paiement sécurisé Stripe</span>' +
      '</div>' +
      '<div>Colis neutre et discret : aucune mention du contenu ni de la boutique sur l\'emballage.</div>' +
      '<div style="margin-top:4px;">En cliquant sur PAYER, vous acceptez nos ' +
        '<a href="/cgv" style="color:#caa86a;text-decoration:underline;">conditions générales de vente</a>.</div>';
    checkoutBtn.parentNode.insertBefore(trust, checkoutBtn);
  }

  // Retraduit les nouveaux éléments si le moteur i18n est présent
  if (typeof applyTranslations === 'function') { try { applyTranslations(); } catch(e){} }
}


function ensureCartModal() {
  // Si le modal existe déjà (version codée en dur dans le HTML de la page),
  // on n'en recrée pas un nouveau : on complète juste les éléments manquants
  // (récapitulatif détaillé + champ e-mail requis pour la réduction serveur).
  if (document.getElementById('cart-modal')) { injectCartExtras(); return; }

const modal = document.createElement("div");
modal.id = "cart-modal";
modal.style.cssText = "display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;justify-content:flex-end;align-items:flex-start;";
modal.innerHTML = `
<div style="background:#111;border-left:1px solid rgba(202,168,106,0.3);width:420px;max-width:100vw;height:100vh;padding:48px 36px;display:flex;flex-direction:column;gap:24px;overflow-y:auto;">
<div style="display:flex;justify-content:space-between;align-items:center;">
<span data-i18n="cart_title" style="font-family:'Cormorant Garamond',serif;font-size:22px;color:#caa86a;letter-spacing:3px;">${(typeof window.t==='function')?window.t('cart_title'):'VOTRE PANIER'}</span>
<button onclick="closeCart()" style="background:none;border:none;color:#caa86a;font-size:22px;cursor:pointer;line-height:1;">&times;</button>
</div>
<ul id="cart-items" style="padding:0;margin:0;flex:1;"></ul>
<div style="border-top:1px solid rgba(202,168,106,0.2);padding-top:20px;">
<div style="display:flex;justify-content:space-between;font-family:'Inter',sans-serif;font-size:13px;letter-spacing:2px;color:#caa86a;margin-bottom:24px;">
<span>TOTAL</span>
<span><span id="cart-total">0.00</span> &euro;</span>
</div>
<!-- Champ e-mail requis pour appliquer la réduction de bienvenue (vérifiée côté serveur) -->
<input id="cart-email" type="email" required placeholder="Votre e-mail (pour votre commande)"
 style="width:100%;padding:12px 14px;margin:10px 0;border:1px solid #caa86a;border-radius:8px;background:transparent;color:inherit;font-family:Georgia,serif;box-sizing:border-box;" />
<!-- Récapitulatif détaillé (sous-total / réduction / livraison / total) -->
<div id="cart-summary" style="margin:10px 0;font-size:14px;line-height:1.9;"></div>
<button id="checkout-btn" onclick="checkout()" style="width:100%;background:none;border:1px solid #caa86a;color:#caa86a;font-family:'Inter',sans-serif;font-size:11px;letter-spacing:4px;padding:16px;cursor:pointer;transition:0.3s;">PAYER</button>
<button onclick="clearCart();closeCart();" style="width:100%;background:none;border:none;color:rgba(202,168,106,0.4);font-family:'Inter',sans-serif;font-size:10px;letter-spacing:3px;padding:12px;cursor:pointer;margin-top:8px;">VIDER LE PANIER</button>
</div>
</div>
`;
document.body.appendChild(modal);
    try { if (typeof window.applyTranslations === "function") window.applyTranslations(); } catch (e) {}

// Fermeture en cliquant hors de la fenêtre du panier
modal.addEventListener("click", (e) => {
if (e.target === modal) closeCart();
});
}

// Injection dès que le DOM est prêt (avant tout clic possible sur PANIER)
if (document.readyState === "loading") {
document.addEventListener("DOMContentLoaded", ensureCartModal);
} else {
ensureCartModal();
}

// ── Optimisations de performance ─────────────
// Applique lazy loading aux images hors-écran et optimise le chargement CSS
// sur les pages produits qui utilisent encore le lien CSS bloquant.
(function initPerfOptimizations() {
// 1. Lazy loading for images below the fold on product pages
function applyLazyLoading() {
const imgs = document.querySelectorAll('img:not([loading]):not([fetchpriority="high"])');
imgs.forEach(function(img, i) {
// Skip first image (hero/product main) - keep eager loading
if (i === 0) {
img.setAttribute('fetchpriority', 'high');
return;
}
img.setAttribute('loading', 'lazy');
});
// Add width/height to logo to prevent CLS
const logoImg = document.querySelector('.header-logo-img');
if (logoImg && !logoImg.getAttribute('width')) {
logoImg.setAttribute('width', '158');
logoImg.setAttribute('height', '80');
}
}

if (document.readyState === 'loading') {
document.addEventListener('DOMContentLoaded', applyLazyLoading);
} else {
applyLazyLoading();
}
})();

// ── Bloc d'informations d'achat sur les fiches produit ──
// Ajoute, sous le bouton d'ajout au panier, les informations déjà publiées sur
// /livraison, /faq et /cgv (délais, frais, discrétion, garanties, rétractation).
// Cible uniquement le bouton principal d'une fiche produit
// (.product-details > .add-to-cart), jamais les cartes de la page d'accueil
// ni le bouton de rappel en bas de fiche (.cta-block).
// Aucune donnée inventée : stock réel, tailles et contenances ne sont pas affichés ici.
(function initProductInfo() {
function buildProductInfo() {
if (document.getElementById('product-info')) return;
var btn = document.querySelector('.product-details > .add-to-cart[data-product-id]');
if (!btn || !btn.parentNode) return;
var rows = [
['Disponibilité', 'Vendu dans la limite des stocks disponibles.'],
['Livraison', 'France métropolitaine et Monaco : 3 à 7 jours ouvrés. Union européenne : 5 à 14 jours ouvrés. Frais 6,90 €, offerts dès 75 € d\'achat.'],
['Discrétion', 'Colis neutre et discret, sans aucune mention du contenu ni du nom de la boutique.'],
['Paiement', 'Paiement sécurisé Stripe — VISA et Mastercard.'],
['Garantie', 'Garantie légale de conformité et garantie des vices cachés.'],
['Retour', 'Rétractation sous 14 jours ; les biens scellés descellés après livraison ne sont pas repris (art. L.221-28 6° du Code de la consommation).']
];
var box = document.createElement('div');
box.id = 'product-info';
box.style.cssText = 'font-family:Georgia,serif;font-size:13px;line-height:1.7;opacity:.92;margin:22px auto 0;padding:16px 18px;border:1px solid rgba(202,168,106,0.35);border-radius:6px;text-align:left;max-width:520px;';
box.innerHTML = rows.map(function (r) {
return '<div style="margin:0 0 8px;"><strong style="color:#caa86a;letter-spacing:1px;">' + r[0] + '</strong> — ' + r[1] + '</div>';
}).join('') +
'<div style="margin-top:10px;font-size:12px;opacity:.85;">' +
'<a href="/livraison" style="color:#caa86a;">Livraison et retours</a> · ' +
'<a href="/cgv" style="color:#caa86a;">Conditions générales de vente</a></div>';
// Le bloc est sorti de la colonne de droite : on le pose apres la section
// produit (.product-page) pour qu'il soit centre au milieu de la page.
var wrap = btn.closest ? btn.closest('.product-page') : null;
if (wrap && wrap.parentNode) {
wrap.parentNode.insertBefore(box, wrap.nextSibling);
} else {
btn.parentNode.insertBefore(box, btn.nextSibling);
}
}
if (document.readyState === 'loading') {
document.addEventListener('DOMContentLoaded', buildProductInfo);
} else {
buildProductInfo();
}
})();

/* >>> Vignettes "Vous aimerez aussi" (20/08/2026) : ajoute la photo du produit
   au-dessus du libelle existant. Aucun texte de lien modifie. >>> */
(function () {
  var IMG = {"pink-star-choco-fraise.html":"pink-star-lubrifiant_comestible_fraise_chocolat_blanc-60ml.webp","deguisement-enseignante.html":"Déguisement d'enseignante.webp","gel_lubrifiant_bio_neutre_divine_xtases.html":"gel-lubrifiant-bio-coco.webp","robe-longue-noire-argentee.html":"Robe longue à décolleté plongeant noire argentée-v2.webp","monster-pussy-strocker.html":"monster.webp","gel_lubrifiant_bio_neutre_sans_parfum_divine_xtases.html":"gel lubrifiant neutre 1.webp","Cockring-vibrant-Marry-Me-Wooomy.html":"Cockring-vibrant-Marry-Me-Wooomy.webp","coffret-bien-etre-intime-bio.html":"Pack intime plaisir et bien-être.webp","anneau_vibrant_telecommande.html":"anneau_vibrant_telecommande_love_connection-xocoon.webp","cockring-vibrant-saturn-hueman.html":"cockring-vibrant-saturn-hueman.webp","huile-massage-peche-blanche-bio-divine-xtases.html":"huile-massage-peche-blanche-bio-divine-xtases.webp","deguisement-infirmière-sexy.html":"Déguisement infirmière sexy.webp","black-empire-my-duchess.html":"vibro-elegance-3.webp","gel_lubrifiant_bio_neutre_framboise_divine_xtases.html":"gel lubrifiant bio miel framboise.webp","mini-robe-noire.html":"Mini robe noire-v2.webp","tanga-taille-haute-dentelle-bleue.html":"Tanga-bleu.webp","deguisement-etudiante.html":"Déguisement d'étudiante.webp","huile-massage-fruit-de-la-passion-bio-divine-xtases.html":"huile-massage-fruit-de-la-passion-bio-divine-xtases.webp","vibro-rechargeable-Indiana.html":"Vibro rechargeable Indiana1.webp","pink_star_sucette_cerise.html":"pink_star_sucette_cerise.webp","huile-massage-barbe-a-papa-bio-divine-xtases.html":"huile-massage-barbe-a-papa-bio-divine-xtases.webp","lubrifiant_eau_lube_tube_fraise_orgie.html":"lubrifiant_eau_lube_tube_fraise_orgie_1.webp","lubrifiant_eau_lube_tube_chocolat_orgie.html":"lubrifiant_eau_tube_chocolat_3.webp","gel_cannabis_orgie.html":"gel-cannabis.webp","orgie-pinacolada.html":"orgie_gel_excitation_pina_colada.webp","red-dolls-energy-pleasure.html":"masturbateur-vaginal-red-dolls-energy.webp","huile-massage-monoi-bio-divine-xtases.html":"huile-massage-monoi-bio-divine-xtases.webp","gel_lubrifiant_bio_neutre_monoi_divine_xtases.html":"gel lubrifiant bio miel monoi.webp","hemp-intense-orgasm.html":"gel-intime-d-excitation-hemp-1.webp","Plug-Anal-Rosy-Gold.html":"plug_anal-rosy_gold.webp","lubrifiant_eau_tube_barbe_a_papa.html":"lubrifiant_eau_tube_barbe_a_papa.webp","dual-vibe-sex-on-the-beach.html":"gel-intime-sex-on-the-beach.webp","le-flateur.html":"le-flateur-6.webp","pink-star.html":"pink-star_lubrifiant_arome_sangria-60_ml.webp","gel_lubrifiant_bio_neutre_vanille_divine_xtases.html":"gel lubrifiant bio miel vanille.webp","huile-massage-noix-de-coco-bio-divine-xtases.html":"huile-massage-noix-de-coco-bio-divine-xtases.webp","Magnum-Opus-vibro.html":"Magnum-Opus-vibro1.webp","Déguisement-Bunny.html":"Déguisement Bunny.webp","gel_lubrifiant_bio_caramel_beurre_sale_divine_xtases.html":"gel lubrifiant bio caramel beurre sale.webp"};
  function upgrade() {
    var sec = document.querySelector('.related-products');
    if (!sec || sec.getAttribute('data-lje-cards') === '1') return;
    var ul = sec.querySelector('ul');
    if (!ul) return;
    var links = ul.querySelectorAll('li > a[href]');
    if (!links.length) return;
    var done = 0;
    ul.removeAttribute('style');
    ul.className = 'related-grid';
    Array.prototype.forEach.call(links, function (a) {
      var file = a.getAttribute('href').split('/').pop().split('#')[0].split('?')[0];
      var src = IMG[file] || IMG[decodeURIComponent(file)];
      if (!src) return;
      var li = a.parentNode;
      li.removeAttribute('style');
      var label = a.textContent.trim();
      a.removeAttribute('style');
      a.className = 'related-card';
      a.textContent = '';
      var frame = document.createElement('span');
      frame.className = 'related-card__img';
      var img = document.createElement('img');
      img.src = encodeURI(src);
      img.alt = label;
      img.loading = 'lazy';
      img.decoding = 'async';
      img.width = 400;
      img.height = 400;
      frame.appendChild(img);
      var name = document.createElement('span');
      name.className = 'related-card__name';
      name.textContent = label;
      a.appendChild(frame);
      a.appendChild(name);
      done++;
    });
    if (done) sec.setAttribute('data-lje-cards', '1');
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', upgrade);
  } else { upgrade(); }
})();
/* <<< fin vignettes "Vous aimerez aussi" <<< */

/* >>> Galerie photo : charge gallery.js sur les fiches produit >>> */
(function () {
  try {
    if (!document.querySelector('.product-image-frame')) return;
    if (document.querySelector('script[src*="gallery.js"]')) return;
    var s = document.createElement('script');
    s.src = '/gallery.js?v=20260827b';
    s.defer = true;
    (document.body || document.documentElement).appendChild(s);
  } catch (e) {}
})();
/* <<< fin galerie photo <<< */
