#!/usr/bin/env node
/**
 * build-static-i18n.js — PRERENDU STATIQUE MULTILINGUE — Les Jardins Enchantes
 *
 * POURQUOI CE SCRIPT
 * ------------------
 * Jusqu'ici les versions pt/it/es/de n'existaient que sous forme d'URL
 * "?lang=xx" traduites cote navigateur par JavaScript. Googlebot recevait
 * du HTML francais (html lang="fr", <title> francais) ET un <link canonical>
 * pointant vers la page francaise : les 4 langues etaient donc traitees comme
 * de simples doublons et n'ont jamais ete indexees.
 *
 * Ce script genere de VRAIES pages statiques par langue, deja traduites dans
 * le HTML servi, avec pour chacune :
 *   - <html lang="xx">
 *   - <title> et <meta name="description"> traduits
 *   - <link rel="canonical"> auto-referent (la page pointe sur elle-meme)
 *   - le jeu complet de <link rel="alternate" hreflang> reciproques
 *   - og:/twitter: et JSON-LD alignes sur la langue
 *
 * SORTIE : /pt/<page>.html, /it/..., /es/..., /de/...
 * (vercel.json a cleanUrls:true -> servies en /pt/<page>)
 *
 * REGLE DE SELECTION DES PAGES
 * ----------------------------
 * Une page n'est generee dans une langue QUE si son contenu est reellement
 * traduit (au moins MIN_CONTENT_KEYS cles data-i18n hors menu/pied de page).
 * Une page dont seuls le menu et le footer sont traduits resterait francaise
 * a 90 % : la publier dans 4 langues creerait du contenu quasi-duplique et
 * abimerait le referencement. Ces pages sont listees dans le rapport final
 * comme "a traduire" et restent FR uniquement.
 *
 * Usage : node tools/build-static-i18n.js [--check]
 *   --check : n'ecrit rien, affiche seulement le rapport.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const cheerio = require("cheerio");

const ROOT = path.join(__dirname, "..");
const BASE = "https://les-jardins-enchantes.com";
const LANGS = ["pt", "it", "es", "de"];
const ALL_LANGS = ["fr", ...LANGS];
const OG_LOCALE = { fr: "fr_FR", pt: "pt_PT", it: "it_IT", es: "es_ES", de: "de_DE" };
const CHECK_ONLY = process.argv.includes("--check");

/* Pages jamais traduites ni indexees (techniques, verification, interne). */
const EXCLUDE = new Set([
  "404.html",
  "success.html",
  "cancel.html",
  "erreur.html",
  "veille-concurrents.html",
  "google2ea8d2d7cec1a820.html",
]);

/* Nombre minimum de cles de contenu pour considerer une page traduisible. */
const MIN_CONTENT_KEYS = 3;

/* Cles presentes partout (menu, panier, pied de page) : ne comptent pas
   comme du contenu traduit. */
const CHROME_KEYS = new Set([
  "banner_livraison", "cart_title", "cart_total", "cart_pay", "cart_empty",
  "cart_clear", "cart_loading", "footer_cgv", "footer_confid", "footer_contact",
  "footer_cookies", "footer_copyright", "footer_mentions", "footer_retour",
  "header_promo", "panier", "prod_add", "prod_feat", "prod_related",
]);

const SECTION_FILES = [
  "i18n-common.js", "i18n-home.js", "i18n-blog.js", "i18n-legal.js", "i18n-product.js",
];

/* ------------------------------------------------------------------ */
/* 1. Dictionnaires                                                    */
/* ------------------------------------------------------------------ */

function loadTranslations() {
  const sandbox = { TRANSLATIONS: {} };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  for (const file of SECTION_FILES) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), "utf8"), ctx, { filename: file });
  }
  return sandbox.TRANSLATIONS;
}

/* Surcharges manuelles de <title> / <meta description>, pour les pages dont
   le H1 ne porte pas de cle data-i18n exploitable. */
function loadMetaOverrides() {
  const p = path.join(__dirname, "meta-i18n.json");
  if (!fs.existsSync(p)) return {};
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

/* ------------------------------------------------------------------ */
/* 2. Inventaire des pages                                             */
/* ------------------------------------------------------------------ */

function listPages() {
  return fs
    .readdirSync(ROOT)
    .filter((f) => f.endsWith(".html") && !EXCLUDE.has(f))
    .sort();
}

function contentKeys(html) {
  const keys = new Set();
  const re = /data-i18n="([^"]*)"/g;
  let m;
  while ((m = re.exec(html))) {
    const k = m[1];
    if (!k || CHROME_KEYS.has(k) || k.startsWith("menu_")) continue;
    keys.add(k);
  }
  return keys;
}

/* Une page est traduisible dans une langue si ses cles de contenu sont
   presentes dans le dictionnaire de cette langue ET differentes du francais
   (sinon la "traduction" est un simple copier-coller du francais). */
function translatableIn(keys, T, lang) {
  if (keys.size < MIN_CONTENT_KEYS) return false;
  let translated = 0;
  for (const k of keys) {
    const fr = T.fr[k];
    const tr = T[lang] && T[lang][k];
    if (tr && String(tr).trim() && String(tr) !== String(fr)) translated++;
  }
  return translated >= MIN_CONTENT_KEYS && translated >= keys.size * 0.6;
}

/* ------------------------------------------------------------------ */
/* 3. Chemins                                                          */
/* ------------------------------------------------------------------ */

const slugOf = (file) => (file === "index.html" ? "" : file.replace(/\.html$/, ""));

/* URL publique d'une page dans une langue (cleanUrls: sans .html). */
function urlFor(file, lang) {
  const slug = slugOf(file);
  const prefix = lang === "fr" ? "" : "/" + lang;
  if (!slug) return BASE + prefix + "/";
  return BASE + prefix + "/" + encodeURI(slug);
}

/* Chemin de sortie sur le disque. */
const outPathFor = (file, lang) => path.join(ROOT, lang, file);

/* Un href/src est-il une reference locale relative a reecrire ? */
function isRelativeLocal(v) {
  if (!v) return false;
  const s = v.trim();
  if (!s) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return false; // http:, mailto:, tel:, data:
  if (s.startsWith("//") || s.startsWith("/") || s.startsWith("#")) return false;
  return true;
}

/* ------------------------------------------------------------------ */
/* 4. Generation d'une page                                            */
/* ------------------------------------------------------------------ */

function applyDict($, dict, frDict) {
  $("[data-i18n]").each((i, el) => {
    const $el = $(el);
    const key = $el.attr("data-i18n");
    const val = dict[key];
    if (val == null || val === "") return;
    if (typeof val === "string" && /<[a-z][\s\S]*>/i.test(val)) $el.html(val);
    else $el.text(val);
  });
}

function stripTags(s) {
  return String(s || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clampDescription(s, max = 158) {
  const t = stripTags(s);
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const i = cut.lastIndexOf(" ");
  return (i > 60 ? cut.slice(0, i) : cut).replace(/[\s,;:–-]+$/, "") + "…";
}

const BRAND = "Les Jardins Enchantés";

function deriveTitle($, file, lang, overrides) {
  const ov = overrides[file] && overrides[file][lang] && overrides[file][lang].title;
  if (ov) return ov;
  const h1 = stripTags($("h1").first().html() || "");
  if (!h1) return null;
  if (h1.includes(BRAND)) return h1;
  /* La marque n'est ajoutee que si le titre reste sous la limite d'affichage
     de Google (~65 caracteres) : mieux vaut un titre net sans marque qu'un
     titre tronque en plein milieu dans les resultats. */
  const withBrand = `${h1} | ${BRAND}`;
  return withBrand.length <= 65 ? withBrand : h1;
}

/* Blocs presents sur toutes les pages (verification d'age, bandeau cookies,
   promo) : leur texte ne doit jamais servir de meta description. */
const DESC_SKIP_KEY = /^(age_|cookie|banner_|header_|promo_|cart_|footer_)/;

function deriveDescription($, file, lang, overrides) {
  const ov = overrides[file] && overrides[file][lang] && overrides[file][lang].description;
  if (ov) return ov;
  let best = "";
  $("p[data-i18n], div[data-i18n], li[data-i18n]").each((i, el) => {
    if (best) return;
    const key = $(el).attr("data-i18n") || "";
    if (DESC_SKIP_KEY.test(key)) return;
    const t = stripTags($(el).html());
    if (t.length >= 80) best = t;
  });
  return best ? clampDescription(best) : null;
}

/* Reecrit les chemins relatifs en chemins absolus depuis la racine, et
   prefixe les liens internes vers une page generee dans la meme langue. */
function rewriteLinks($, lang, generatedForLang) {
  const attrs = [
    ["a", "href"], ["link", "href"], ["script", "src"], ["img", "src"],
    ["source", "src"], ["source", "srcset"], ["img", "srcset"],
    ["video", "poster"], ["use", "href"], ["form", "action"],
  ];

  for (const [sel, attr] of attrs) {
    $(`${sel}[${attr}]`).each((i, el) => {
      const $el = $(el);
      /* Les liens du selecteur de langue sont deja ecrits en absolu et
         pointent volontairement vers une AUTRE langue : les reecrire les
         casserait (le lien FR deviendrait /pt/... sur une page pt). */
      if ($el.attr("data-lang") != null) return;
      let v = $el.attr(attr);
      if (!isRelativeLocal(v)) return;
      $el.attr(attr, "/" + v.replace(/^\.\//, ""));
    });
  }

  /* Liens internes vers une page du site -> version dans la langue courante
     si elle a ete generee, sinon on laisse la version francaise. */
  $("a[href]").each((i, el) => {
    const $el = $(el);
    if ($el.attr("data-lang") != null) return; // selecteur de langue : intouchable
    let raw = $el.attr("href");
    /* Les liens ecrits en absolu vers le site (https://.../page.html) restaient
       toujours francais sur les pages traduites : on les ramene a un chemin
       interne pour qu'ils soient prefixes par la langue comme les autres. */
    if (raw && raw.startsWith(BASE + "/")) raw = raw.slice(BASE.length);
    if (!raw || !raw.startsWith("/")) return;
    const [pathPart, rest] = [raw.split(/[?#]/)[0], raw.slice(raw.split(/[?#]/)[0].length)];
    let slug = decodeURI(pathPart.replace(/^\//, "").replace(/\.html$/, ""));
    const file = slug === "" ? "index.html" : slug + ".html";
    if (!generatedForLang.has(file)) return;
    const target = slug === "" ? `/${lang}/` : `/${lang}/${encodeURI(slug)}`;
    $el.attr("href", target + rest);
  });

  /* Les images en og:image / twitter:image sont des URL absolues ou relatives. */
  $('meta[property="og:image"], meta[name="twitter:image"]').each((i, el) => {
    const $el = $(el);
    const v = $el.attr("content");
    if (isRelativeLocal(v)) $el.attr("content", BASE + "/" + v.replace(/^\.\//, ""));
  });
}

/* Le bloc <div class="lang-switch"> est ecrit en dur dans la source FR :
   ses 5 liens sont identiques dans toutes les langues, seul l'etat actif
   change. On deplace donc is-active / aria-current sur la langue de la page
   generee. Aucun href n'est modifie ici. */
function setLangSwitchActive($, lang) {
  $(".lang-switch a[data-lang]").each((i, el) => {
    const $el = $(el);
    const isActive = $el.attr("data-lang") === lang;
    $el.removeClass("is-active").removeAttr("aria-current");
    if (isActive) {
      $el.addClass("is-active").attr("aria-current", "true");
    }
  });
}

function setHreflang($, file, availableLangs) {
  $('link[rel="alternate"][hreflang]').remove();
  const canonicalEl = $('link[rel="canonical"]').first();
  const anchor = canonicalEl.length ? canonicalEl : $("head title").first();
  const langs = ["fr", ...LANGS.filter((l) => availableLangs.has(l))];
  const tags = langs
    .map((l) => `\n<link rel="alternate" hreflang="${l}" href="${urlFor(file, l)}">`)
    .join("");
  anchor.after(tags + `\n<link rel="alternate" hreflang="x-default" href="${urlFor(file, "fr")}">`);
}

function setMeta($, name, value, isProperty) {
  if (value == null) return;
  const sel = isProperty ? `meta[property="${name}"]` : `meta[name="${name}"]`;
  const el = $(sel).first();
  if (el.length) el.attr("content", value);
  else $("head").append(`\n<meta ${isProperty ? "property" : "name"}="${name}" content="${$("<div>").text(value).html()}">`);
}

function localizeJsonLd($, file, lang) {
  $('script[type="application/ld+json"]').each((i, el) => {
    const raw = $(el).contents().text();
    let data;
    try { data = JSON.parse(raw); } catch (e) { return; }
    const frUrl = urlFor(file, "fr");
    const langUrl = urlFor(file, lang);
    const walk = (o) => {
      if (Array.isArray(o)) return o.forEach(walk);
      if (!o || typeof o !== "object") return;
      for (const k of Object.keys(o)) {
        if (typeof o[k] === "string" && o[k] === frUrl) o[k] = langUrl;
        else walk(o[k]);
      }
    };
    walk(data);
    if (!Array.isArray(data) && typeof data === "object") data.inLanguage = lang;
    $(el).text(JSON.stringify(data, null, 2));
  });
}

function buildPage(srcHtml, file, lang, T, overrides, availableLangs, generatedForLang) {
  const $ = cheerio.load(srcHtml, { decodeEntities: false });
  const dict = T[lang] || T.fr;

  $("html").attr("lang", lang);
  applyDict($, dict, T.fr);

  const title = deriveTitle($, file, lang, overrides);
  const description = deriveDescription($, file, lang, overrides);

  if (title) $("head title").first().text(title);
  if (description) setMeta($, "description", description, false);

  /* Le canonical d'une page traduite pointe sur elle-meme : c'est ce qui
     manquait et qui empechait toute indexation des versions traduites. */
  const canonical = urlFor(file, lang);
  const cEl = $('link[rel="canonical"]').first();
  if (cEl.length) cEl.attr("href", canonical);
  else $("head").append(`\n<link rel="canonical" href="${canonical}">`);

  setHreflang($, file, availableLangs);

  setMeta($, "og:url", canonical, true);
  setMeta($, "og:locale", OG_LOCALE[lang], true);
  if (title) setMeta($, "og:title", title, true);
  if (description) setMeta($, "og:description", description, true);
  if (title) setMeta($, "twitter:title", title, false);
  if (description) setMeta($, "twitter:description", description, false);

  /* geo.region francais sur une page portugaise n'a pas de sens. */
  $('meta[name="geo.region"], meta[name="geo.placename"]').remove();
  /* keywords francais : inutile et trompeur sur une page traduite. */
  $('meta[name="keywords"]').remove();

  localizeJsonLd($, file, lang);
  setLangSwitchActive($, lang);
  rewriteLinks($, lang, generatedForLang);

  return { html: $.html(), title, description };
}

/* Met a jour la page FRANCAISE : hreflang vers les vraies URL /xx/ au lieu
   des anciennes ?lang=xx.
 *
 * Volontairement fait en edition de texte brut, PAS via le parseur HTML :
 * un aller-retour par cheerio reecrirait tout le fichier (doctype, entites,
 * ordre des attributs, indentation) et polluerait le diff. Ici seules les
 * lignes canonical et hreflang changent ; le reste du fichier reste identique
 * octet pour octet. Aucun texte, titre, H1/H2 ou structure n'est touche. */
function updateFrenchPage(srcHtml, file, availableLangs) {
  const RE_ALT = [
    /^[ \t]*<link[^>]*\brel=["']?alternate["']?[^>]*\bhreflang=[^>]*>[ \t]*\r?\n?/gim,
    /^[ \t]*<link[^>]*\bhreflang=[^>]*\brel=["']?alternate["']?[^>]*>[ \t]*\r?\n?/gim,
  ];
  let out = srcHtml;
  for (const re of RE_ALT) out = out.replace(re, "");

  const canonical = urlFor(file, "fr");
  const langs = ["fr", ...LANGS.filter((l) => availableLangs.has(l))];
  const block =
    langs.map((l) => `<link rel="alternate" hreflang="${l}" href="${urlFor(file, l)}">`).join("\n") +
    `\n<link rel="alternate" hreflang="x-default" href="${canonical}">`;

  const RE_CANON = /<link[^>]*\brel=["']?canonical["']?[^>]*>/i;
  if (RE_CANON.test(out)) {
    out = out.replace(RE_CANON, (m) => {
      const fixed = /href=/i.test(m)
        ? m.replace(/href=["'][^"']*["']/i, `href="${canonical}"`)
        : m;
      return fixed + "\n" + block;
    });
  } else {
    out = out.replace(/<\/head>/i, `<link rel="canonical" href="${canonical}">\n${block}\n</head>`);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 5. Sitemap                                                          */
/* ------------------------------------------------------------------ */

function buildSitemap(plan) {
  const today = new Date().toISOString().slice(0, 10);
  const chunks = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
  ];
  for (const { file, avail } of plan) {
    const available = ["fr", ...LANGS.filter((l) => avail.has(l))];
    const alternates = available
      .map((l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${urlFor(file, l)}"/>`)
      .concat([`    <xhtml:link rel="alternate" hreflang="x-default" href="${urlFor(file, "fr")}"/>`])
      .join("\n");
    const priority = file === "index.html" ? "1.0" : file.startsWith("blog") ? "0.7" : "0.8";
    for (const l of available) {
      chunks.push(
        "  <url>",
        `    <loc>${urlFor(file, l)}</loc>`,
        `    <lastmod>${today}</lastmod>`,
        "    <changefreq>weekly</changefreq>",
        `    <priority>${priority}</priority>`,
        alternates,
        "  </url>"
      );
    }
  }
  chunks.push("</urlset>", "");
  return chunks.join("\n");
}

/* ------------------------------------------------------------------ */
/* 6. Main                                                             */
/* ------------------------------------------------------------------ */

function main() {
  const T = loadTranslations();
  const overrides = loadMetaOverrides();
  const files = listPages();

  /* Plan : pour chaque page, les langues reellement generables. */
  const plan = files.map((file) => {
    const html = fs.readFileSync(path.join(ROOT, file), "utf8");
    const keys = contentKeys(html);
    const langs = new Set(LANGS.filter((l) => translatableIn(keys, T, l)));
    /* Pages ecrites en dur (sans cles data-i18n) : si une version traduite existe
       deja sur le disque, elle compte pour les hreflang, le sitemap et les liens
       internes, mais n'est jamais regeneree ni ecrasee. */
    const onDisk = LANGS.filter((l) => fs.existsSync(path.join(ROOT, l, file)));
    const avail = new Set([...langs, ...onDisk]);
    return { file, html, keys, langs, avail };
  });

  /* Index inverse : quelles pages existent dans quelle langue (pour les liens). */
  const generatedByLang = {};
  for (const l of LANGS) generatedByLang[l] = new Set();
  for (const { file, avail } of plan) for (const l of avail) generatedByLang[l].add(file);

  const report = { generated: 0, skipped: [], missingTitle: [], missingDesc: [], longTitle: [], perLang: {} };
  for (const l of LANGS) report.perLang[l] = 0;

  for (const { file, html, langs, avail } of plan) {
    if (langs.size === 0) {
      report.skipped.push(file);
    }
    for (const lang of langs) {
      const { html: out, title, description } = buildPage(
        html, file, lang, T, overrides, avail, generatedByLang[lang]
      );
      if (!title) report.missingTitle.push(`${lang}/${file}`);
      if (!description) report.missingDesc.push(`${lang}/${file}`);
      if (title && title.length > 70) report.longTitle.push(`${lang}/${file} (${title.length})`);
      if (!CHECK_ONLY) {
        const dest = outPathFor(file, lang);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, out, "utf8");
      }
      report.generated++;
      report.perLang[lang]++;
    }
    /* Page FR : hreflang remis a jour (contenu inchange). */
    if (!CHECK_ONLY) {
      fs.writeFileSync(path.join(ROOT, file), updateFrenchPage(html, file, avail), "utf8");
    }
  }

  if (!CHECK_ONLY) {
    fs.writeFileSync(path.join(ROOT, "sitemap.xml"), buildSitemap(plan), "utf8");
  }

  /* --- Rapport --- */
  const totalUrls = plan.reduce((n, p) => n + 1 + p.avail.size, 0);
  console.log("");
  console.log("Prerendu multilingue " + (CHECK_ONLY ? "(simulation)" : "(ecriture)"));
  console.log("-------------------------------------------");
  console.log(`Pages sources          : ${files.length}`);
  console.log(`Pages traduites ecrites: ${report.generated}`);
  for (const l of LANGS) console.log(`  ${l} : ${report.perLang[l]}`);
  console.log(`URL au sitemap         : ${totalUrls}`);
  if (report.skipped.length) {
    console.log("");
    console.log(`A TRADUIRE (${report.skipped.length}) — restent en francais uniquement :`);
    report.skipped.forEach((f) => console.log("  - " + f));
  }
  if (report.missingTitle.length) {
    console.log("");
    console.log("SANS TITRE derive (ajouter dans tools/meta-i18n.json) :");
    report.missingTitle.forEach((f) => console.log("  - " + f));
  }
  if (report.missingDesc.length) {
    console.log("");
    console.log("SANS DESCRIPTION derivee (ajouter dans tools/meta-i18n.json) :");
    report.missingDesc.forEach((f) => console.log("  - " + f));
  }
  if (report.longTitle.length) {
    console.log("");
    console.log(`TITRES > 70 caracteres (${report.longTitle.length}) — tronques par Google :`);
    report.longTitle.forEach((f) => console.log("  - " + f));
  }
  console.log("");
}

main();
