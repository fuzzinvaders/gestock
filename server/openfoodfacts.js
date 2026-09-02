"use strict";

/**
 * Recherche d'un code-barres dans Open Food Facts, base ouverte et collaborative.
 *
 * L'appel part du serveur, pas du navigateur : c'est ce qui évite le CORS, garde
 * une seule identité auprès d'Open Food Facts, et permet de mettre en cache les
 * réponses pour tout le foyer plutôt qu'une fois par téléphone.
 *
 * Le réseau n'est jamais indispensable — un code inconnu se saisit à la main. Une
 * panne d'Open Food Facts ralentit donc l'ajout, elle ne l'empêche pas.
 */

import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./store.js";

const CACHE_FILE = path.join(DATA_DIR, "codes-barres.json");
const CACHE_MAX = 2000;
// Une fiche produit ne change quasiment jamais ; au-delà d'un mois on la rafraîchit
// tout de même, le temps qu'un nom mal saisi soit corrigé en amont.
const CACHE_TTL_MS = 30 * 86400000;
const TIMEOUT_MS = 6000;

const API_BASE = process.env.OFF_BASE_URL || "https://world.openfoodfacts.org";
const FIELDS = [
  "product_name",
  "product_name_fr",
  "generic_name_fr",
  "brands",
  "quantity",
  "categories_tags_fr",
  "image_front_small_url",
].join(",");

/* Open Food Facts demande à être appelé avec un agent identifiable, pour pouvoir
   distinguer les applications et joindre leur auteur. */
const USER_AGENT = process.env.OFF_USER_AGENT || "Gestock/0.1 (auto-hebergement familial)";

function readCache() {
  if (!fs.existsSync(CACHE_FILE)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeCache(cache) {
  const entries = Object.entries(cache);
  // Le cache est un confort, pas une archive : passé le plafond, les entrées les
  // plus anciennes sautent plutôt que de laisser le fichier grossir sans fin.
  const kept = entries
    .sort((a, b) => (b[1].fetchedAt ?? 0) - (a[1].fetchedAt ?? 0))
    .slice(0, CACHE_MAX);
  const tmp = `${CACHE_FILE}.tmp`;
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(kept), null, 2), "utf-8");
  fs.renameSync(tmp, CACHE_FILE);
}

function firstText(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text.length > 0) return text;
  }
  return "";
}

/* Le nom affiché : le français d'abord, l'anglais en repli, et la quantité du
   paquet accolée quand elle n'y est pas déjà — « Coquillettes » et
   « Coquillettes 500 g » ne se distinguent qu'au moment de faire les courses. */
function buildName(product) {
  const base = firstText(product.product_name_fr, product.product_name, product.generic_name_fr);
  if (!base) return "";
  const quantity = firstText(product.quantity);
  if (!quantity) return base;
  if (base.toLowerCase().includes(quantity.toLowerCase())) return base;
  return `${base} ${quantity}`;
}

/* Le premier rayon renvoyé par Open Food Facts, débarrassé de son préfixe de
   langue (« fr:surgeles » → « Surgeles »). Les suivants sont trop fins pour
   servir de rangement (« fr:plats-prepares-a-base-de-poisson-pane »). */
function buildCategory(product) {
  const tags = Array.isArray(product.categories_tags_fr) ? product.categories_tags_fr : [];
  const tag = firstText(tags[0]);
  if (!tag) return "";
  const label = tag.includes(":") ? tag.slice(tag.indexOf(":") + 1) : tag;
  const words = label.replace(/-/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function toProduct(payload) {
  const product = payload?.product ?? {};
  const name = buildName(product);
  if (!name) return null;
  const image = firstText(product.image_front_small_url);
  return {
    name,
    brand: firstText(product.brands).split(",")[0].trim(),
    category: buildCategory(product),
    imageUrl: image.startsWith("https://") ? image : null,
  };
}

/**
 * Renvoie { found, product, source } où source vaut "cache", "openfoodfacts" ou
 * "hors-ligne" — l'interface le dit à l'utilisateur, pour qu'un champ resté vide
 * s'explique de lui-même.
 */
async function lookup(ean) {
  const cache = readCache();
  const hit = cache[ean];
  if (hit && Date.now() - (hit.fetchedAt ?? 0) < CACHE_TTL_MS) {
    return { found: Boolean(hit.product), product: hit.product ?? null, source: "cache" };
  }

  let payload;
  try {
    const res = await fetch(`${API_BASE}/api/v2/product/${ean}.json?fields=${FIELDS}`, {
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // 404 est une réponse légitime : le produit n'est pas dans la base. Tout autre
    // code est un incident côté service, que l'on ne veut pas mémoriser.
    if (res.status === 404) {
      cache[ean] = { product: null, fetchedAt: Date.now() };
      writeCache(cache);
      return { found: false, product: null, source: "openfoodfacts" };
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    payload = await res.json();
  } catch {
    // Réseau coupé, service lent ou en panne : on rend la main tout de suite avec
    // ce que l'on avait, même périmé. Mieux vaut un nom d'il y a deux mois que rien.
    if (hit) return { found: Boolean(hit.product), product: hit.product ?? null, source: "cache" };
    return { found: false, product: null, source: "hors-ligne" };
  }

  const product = payload?.status === 1 ? toProduct(payload) : null;
  cache[ean] = { product, fetchedAt: Date.now() };
  writeCache(cache);
  return { found: Boolean(product), product, source: "openfoodfacts" };
}

export { buildCategory, buildName, lookup, toProduct };
