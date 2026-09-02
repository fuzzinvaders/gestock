"use strict";

/**
 * Lien avec Mealie, le carnet de recettes auto-hébergé.
 *
 * Tout part du serveur : le jeton Mealie ne descend jamais dans le navigateur, et
 * une seule machine interroge l'instance pour tout le foyer.
 *
 * Le cœur du dispositif est un *index* : la liste des recettes réduite à ce qui
 * nous intéresse — les identifiants des ingrédients de chacune. Le construire coûte
 * une requête par recette, donc il est fabriqué rarement et gardé sur disque. Une
 * fois là, répondre à « qu'est-ce que je peux cuisiner ce soir » ne demande plus
 * aucun réseau : c'est un calcul local, immédiat, qui survit à une panne de Mealie.
 *
 * Mealie sait d'ailleurs suggérer des recettes lui-même (/api/recipes/suggestions).
 * On ne s'en sert pas : le classement qui nous importe — d'abord ce qui périme —
 * demande de croiser les recettes avec les lots, ce que Mealie ignore.
 */

import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./store.js";

const BASE_URL = String(process.env.MEALIE_URL || "").replace(/\/+$/, "");
const TOKEN = process.env.MEALIE_TOKEN || "";
const INDEX_FILE = path.join(DATA_DIR, "mealie.json");

const TIMEOUT_MS = 10000;
/* Au-delà d'une journée, l'index est refait — en tâche de fond, sans faire
   attendre celui qui regarde ses recettes. */
const STALE_MS = 24 * 3600 * 1000;
/* Six requêtes en parallèle : de quoi lire une centaine de recettes en quelques
   secondes sans transformer le rafraîchissement en attaque de son propre serveur. */
const CONCURRENCY = 6;
const MAX_RECIPES = 2000;

function isConfigured() {
  return Boolean(BASE_URL && TOKEN);
}

async function call(pathname, params = {}) {
  const url = new URL(`${BASE_URL}${pathname}`);
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) for (const v of value) url.searchParams.append(key, v);
    else if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${TOKEN}`, accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Mealie ${pathname} : HTTP ${res.status}`);
  return res.json();
}

// ---- Index des recettes ----

function readIndex() {
  if (!fs.existsSync(INDEX_FILE)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(INDEX_FILE, "utf-8"));
    if (!Array.isArray(parsed.recipes)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeIndex(index) {
  const tmp = `${INDEX_FILE}.tmp`;
  fs.mkdirSync(path.dirname(INDEX_FILE), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(index), "utf-8");
  fs.renameSync(tmp, INDEX_FILE);
}

async function listRecipeSlugs() {
  const slugs = [];
  let page = 1;
  for (;;) {
    const payload = await call("/api/recipes", { page, perPage: 100 });
    for (const item of payload.items ?? []) slugs.push(item.slug);
    if (slugs.length >= MAX_RECIPES) break;
    if (!payload.total_pages || page >= payload.total_pages) break;
    page += 1;
  }
  return slugs;
}

/* Une ligne d'ingrédient peut n'être que du texte libre — « une pincée de ce qui
   traîne » — sans référence à un aliment de la base. Ces lignes-là sont
   invisibles pour nous : impossible de dire si on les a. On les compte, pour que
   l'interface puisse prévenir plutôt que de laisser croire à une recette
   complète. */
function summarise(recipe, groupSlug) {
  const foodIds = [];
  let freeText = 0;
  for (const line of recipe.recipeIngredient ?? []) {
    if (line.food?.id) {
      if (!foodIds.includes(line.food.id)) foodIds.push(line.food.id);
    } else {
      freeText += 1;
    }
  }
  return {
    id: recipe.id,
    slug: recipe.slug,
    name: recipe.name,
    url: `${BASE_URL}/g/${groupSlug}/r/${recipe.slug}`,
    image: `${BASE_URL}/api/media/recipes/${recipe.id}/images/min-original.webp`,
    totalTime: recipe.totalTime ?? null,
    servings: recipe.recipeServings ?? null,
    foodIds,
    freeText,
  };
}

async function fetchAll(slugs, groupSlug) {
  const queue = [...slugs];
  const recipes = [];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length > 0) {
        const slug = queue.shift();
        try {
          recipes.push(summarise(await call(`/api/recipes/${slug}`), groupSlug));
        } catch {
          // Une recette illisible ne doit pas emporter tout l'index : on la saute,
          // le prochain rafraîchissement la retrouvera peut-être.
        }
      }
    }),
  );
  return recipes;
}

/** Reconstruit l'index. Long (une requête par recette) : à ne pas appeler en boucle. */
async function refreshIndex() {
  if (!isConfigured()) return { ok: false, error: "Mealie n'est pas configuré." };
  let groupSlug = "home";
  try {
    const group = await call("/api/groups/self");
    if (group?.slug) groupSlug = group.slug;
  } catch {
    // Le slug ne sert qu'à fabriquer les liens cliquables : une valeur par défaut
    // vaut mieux qu'un rafraîchissement qui échoue pour si peu.
  }

  const slugs = await listRecipeSlugs();
  const recipes = await fetchAll(slugs, groupSlug);

  // Le catalogue d'aliments de Mealie compte des milliers d'entrées, dont
  // l'immense majorité n'apparaît dans aucune recette. Seuls comptent ceux qu'on
  // utilise vraiment : c'est eux, et eux seuls, qu'il faudra relier à un produit.
  const counts = new Map();
  for (const recipe of recipes) {
    for (const id of recipe.foodIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const names = new Map();
  try {
    let page = 1;
    for (;;) {
      const payload = await call("/api/foods", { page, perPage: 200 });
      for (const food of payload.items ?? []) names.set(food.id, food.name);
      if (!payload.total_pages || page >= payload.total_pages) break;
      page += 1;
    }
  } catch {
    // Sans les noms, l'écran de correspondance serait illisible, mais les recettes
    // restent exploitables : on garde ce qu'on a.
  }

  const foods = [...counts.entries()]
    .map(([id, count]) => ({ id, name: names.get(id) ?? "(aliment inconnu)", count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "fr"));

  const index = { fetchedAt: Date.now(), groupSlug, recipes, foods };
  writeIndex(index);
  return { ok: true, index };
}

let refreshing = null;

/**
 * L'index, tout de suite. S'il est périmé, un rafraîchissement part en arrière-plan
 * et servira la prochaine fois : mieux vaut une liste d'hier affichée maintenant
 * qu'une liste d'aujourd'hui après dix secondes de sablier.
 */
function getIndex({ refreshIfStale = true } = {}) {
  const index = readIndex();
  const stale = !index || Date.now() - index.fetchedAt > STALE_MS;
  if (stale && refreshIfStale && isConfigured() && !refreshing) {
    refreshing = refreshIndex()
      .catch(() => undefined)
      .finally(() => {
        refreshing = null;
      });
  }
  return { index, stale };
}

async function searchFoods(query) {
  if (!isConfigured()) return [];
  const payload = await call("/api/foods", { search: query, perPage: 20 });
  return (payload.items ?? []).map((f) => ({ id: f.id, name: f.name }));
}

export { BASE_URL, getIndex, isConfigured, refreshIndex, searchFoods };
