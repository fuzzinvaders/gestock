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

/* Les deux valeurs sont nettoyées avant usage : un jeton collé depuis l'interface
   de Mealie emporte souvent une espace ou un retour à la ligne, et une adresse
   finit une fois sur deux par une barre oblique. Le premier donne un 401
   incompréhensible — le jeton est bon, l'en-tête ne l'est pas — et la seconde une
   URL à double barre. Deux pannes qui coûtent une soirée pour un caractère
   invisible. */
const BASE_URL = String(process.env.MEALIE_URL || "")
  .trim()
  .replace(/\/+$/, "");
const TOKEN = String(process.env.MEALIE_TOKEN || "").trim();
const INDEX_FILE = path.join(DATA_DIR, "mealie.json");

const TIMEOUT_MS = 10000;
/* Au-delà d'une journée, l'index est refait — en tâche de fond, sans faire
   attendre celui qui regarde ses recettes. */
const STALE_MS = 24 * 3600 * 1000;
/* Six requêtes en parallèle : de quoi lire une centaine de recettes en quelques
   secondes sans transformer le rafraîchissement en attaque de son propre serveur. */
const CONCURRENCY = 6;
const MAX_RECIPES = 2000;

/* Forme de l'index. L'incrémenter périme d'un coup les index déjà sur disque :
   une correction du contenu — un nom d'aliment perdu, par exemple — ne demande
   alors aucun geste, l'index se refait au premier affichage suivant. */
const INDEX_VERSION = 2;

function isConfigured() {
  return Boolean(BASE_URL && TOKEN);
}

/**
 * De quoi reconnaître le jeton sans le divulguer : ses premiers et derniers
 * caractères, et sa longueur. Cela suffit à répondre à « est-ce bien le nouveau
 * que le conteneur a reçu ? », qui ne se tranchait jusqu'ici qu'en ligne de
 * commande sur la machine hôte.
 */
function tokenHint() {
  if (!TOKEN) return null;
  if (TOKEN.length <= 12) return { length: TOKEN.length, apercu: "trop court" };
  return { length: TOKEN.length, apercu: `${TOKEN.slice(0, 6)}…${TOKEN.slice(-4)}` };
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
  if (!res.ok) {
    /* Le corps de la réponse porte l'explication — « Not authenticated », un
       message de permission, ou la page d'un pare-feu applicatif qui s'est
       interposé. La jeter pour ne garder que le code laissait « HTTP 403 » tout
       nu, qui ne dit pas de quel côté chercher. On en prend de quoi reconnaître
       la nature du refus, pas de quoi noyer l'écran. */
    let detail = "";
    try {
      const brut = (await res.text()).trim();
      const json = brut.startsWith("{") ? JSON.parse(brut) : null;
      const texte = json?.detail ?? json?.message ?? brut;
      detail = String(typeof texte === "string" ? texte : JSON.stringify(texte))
        // Une page d'erreur HTML — celle d'un proxy ou d'un pare-feu — se lit mieux
        // débarrassée de ses balises et de ses retours à la ligne.
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 160);
    } catch {
      // Un corps illisible ne doit pas masquer le code, qui reste l'essentiel.
    }
    throw new Error(`Mealie ${pathname} : HTTP ${res.status}${detail ? ` — ${detail}` : ""}`);
  }
  return res.json();
}

// ---- Index des recettes ----

function readIndex() {
  if (!fs.existsSync(INDEX_FILE)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(INDEX_FILE, "utf-8"));
    if (!Array.isArray(parsed.recipes)) return null;
    return { version: parsed.version ?? 1, ...parsed };
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
  /* Le nom de l'aliment est relevé ici, dans la recette qui l'emploie, et nulle
     part ailleurs. Il venait auparavant d'une seconde requête — la pagination du
     catalogue complet — dont l'échec d'une seule page suffisait à laisser des
     ingrédients anonymes : « (aliment inconnu) », qu'on ne peut ni relier, ni
     acheter, ni même comprendre. Un aliment cité par une recette porte forcément
     son nom dans cette recette : la source la plus sûre est la plus proche. */
  const foodNames = {};
  let freeText = 0;
  for (const line of recipe.recipeIngredient ?? []) {
    if (line.food?.id) {
      if (!foodIds.includes(line.food.id)) foodIds.push(line.food.id);
      const nom = String(line.food.name ?? "").trim();
      if (nom) foodNames[line.food.id] = nom;
    } else {
      freeText += 1;
    }
  }
  return {
    foodNames,
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

let refreshing = null;
/* La dernière raison d'un échec de lecture, gardée pour être dite. Une
   reconstruction qui échoue en silence laisse l'écran sur « en cours » pour
   toujours : le jeton révoqué, l'instance éteinte ou le certificat expiré
   doivent se lire dans l'interface, pas dans les journaux du conteneur. */
let derniereErreur = null;
/* Quand une lecture échoue, on ne réessaie pas avant ce délai. Sans lui, chaque
   affichage relançait une tentative condamnée — un jeton révoqué le reste — ce qui
   martelait l'instance Mealie et, pire, effaçait l'erreur avant qu'elle ait pu être
   lue. Le bouton « Relire Mealie » passe outre : là, c'est quelqu'un qui demande. */
const REPRISE_MS = 5 * 60 * 1000;
let dernierEchec = 0;

/** Reconstruit l'index. Long (une requête par recette) : à ne pas appeler en boucle. */
async function refreshIndex() {
  if (!isConfigured()) return { ok: false, error: "Mealie n'est pas configuré." };
  try {
    return await lireCarnet();
  } catch (err) {
    // Un seul endroit consigne l'échec, qu'il vienne d'un rafraîchissement de fond
    // ou d'un clic sur « Relire Mealie » : sans quoi l'un effacerait la trace de
    // l'autre, ce qui s'est déjà vu.
    derniereErreur = String(err?.message ?? err);
    dernierEchec = Date.now();
    return { ok: false, error: derniereErreur };
  }
}

async function lireCarnet() {
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
  // Passé ce point, la lecture a réussi : l'échec précédent n'a plus lieu d'être.
  derniereErreur = null;
  dernierEchec = 0;

  // Le catalogue d'aliments de Mealie compte des milliers d'entrées, dont
  // l'immense majorité n'apparaît dans aucune recette. Seuls comptent ceux qu'on
  // utilise vraiment : c'est eux, et eux seuls, qu'il faudra relier à un produit.
  // Noms et comptages sortent du même passage sur les recettes, donc aucun aliment
  // cité ne peut se retrouver sans nom.
  const counts = new Map();
  const names = new Map();
  for (const recipe of recipes) {
    for (const id of recipe.foodIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    for (const [id, nom] of Object.entries(recipe.foodNames ?? {})) names.set(id, nom);
    // Les noms ont fait leur office : les garder dans chaque recette alourdirait
    // l'index d'autant de copies qu'il y a d'emplois.
    delete recipe.foodNames;
  }

  const foods = [...counts.entries()]
    .map(([id, count]) => ({ id, name: names.get(id) ?? `Aliment ${id.slice(0, 8)}`, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "fr"));

  const index = { version: INDEX_VERSION, fetchedAt: Date.now(), groupSlug, recipes, foods };
  writeIndex(index);
  return { ok: true, index };
}


/**
 * L'index, tout de suite. S'il est périmé, un rafraîchissement part en arrière-plan
 * et servira la prochaine fois : mieux vaut une liste d'hier affichée maintenant
 * qu'une liste d'aujourd'hui après dix secondes de sablier.
 */
function getIndex({ refreshIfStale = true } = {}) {
  const surDisque = readIndex();
  const perime = surDisque && Date.now() - surDisque.fetchedAt > STALE_MS;
  /* Un index d'une forme antérieure est écarté au lieu d'être servi : sa forme a
     changé parce que son contenu était fautif, et montrer des noms qu'on sait
     faux vaut moins qu'une minute d'attente annoncée. Un index simplement vieux,
     lui, reste affiché — il est juste, seulement daté. */
  const perimeParForme = Boolean(surDisque) && surDisque.version !== INDEX_VERSION;
  const stale = !surDisque || perime || perimeParForme;

  const enPause = Date.now() - dernierEchec < REPRISE_MS;
  if (stale && refreshIfStale && isConfigured() && !refreshing && !enPause) {
    refreshing = refreshIndex().finally(() => {
      refreshing = null;
    });
  }

  const index = perimeParForme ? null : surDisque;
  return {
    index,
    stale,
    building: Boolean(refreshing) && !index,
    lastError: derniereErreur,
  };
}

async function searchFoods(query) {
  if (!isConfigured()) return [];
  const payload = await call("/api/foods", { search: query, perPage: 20 });
  return (payload.items ?? []).map((f) => ({ id: f.id, name: f.name }));
}

export { BASE_URL, getIndex, isConfigured, refreshIndex, searchFoods, summarise, tokenHint };
