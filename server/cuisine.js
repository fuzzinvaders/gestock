"use strict";

/**
 * Le croisement entre les recettes de Mealie et ce qu'il y a dans les placards.
 *
 * Fonctions pures : elles reçoivent l'index des recettes, les correspondances et
 * l'inventaire, et rendent une liste classée. Aucun accès disque ni réseau, donc
 * tout se teste sur des objets littéraux.
 *
 * Le principe tient en une phrase : un aliment Mealie est « en stock » soit parce
 * qu'il est relié à un produit dont il reste au moins un lot, soit parce qu'on a
 * déclaré qu'il est toujours là — le sel et l'huile d'olive ne s'inventorient pas.
 */

const URGENT_DAYS = 3;
const SOON_DAYS = 30;
const MS_PER_DAY = 86400000;

/* « Petits pois extra-fins Bonduelle 750 g » et « petits pois » doivent se
   reconnaître : on retire les accents, la ponctuation, et le pluriel le plus
   courant. Ce n'est pas de la linguistique, c'est assez pour proposer — la
   décision finale reste humaine. */
function normaliser(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/* Les mots-outils ne disent rien du produit : « filet de poulet » doit
   reconnaître « Blanc de poulet 4 filets », où le « de » n'est pas au même
   endroit. On les écarte, ainsi que les unités et grammages qui encombrent les
   noms venus d'Open Food Facts. */
const VIDES = new Set([
  "de", "du", "des", "la", "le", "les", "au", "aux", "en", "et", "un", "une",
  "sans", "avec", "bio", "frais", "fraiche", "surgele", "surgelee",
  "kg", "cl", "ml", "cm", "gr",
]);

function mots(text) {
  return normaliser(text)
    .split(" ")
    .filter((m) => m.length > 1 && !VIDES.has(m) && !/^\d+$/.test(m))
    .map((m) => m.replace(/[sx]$/, ""));
}

/**
 * Le produit du foyer qui correspond le mieux à un aliment Mealie, ou null.
 * On n'accepte que les correspondances complètes — tous les mots de l'aliment
 * présents dans le produit — et parmi elles la plus courte, donc la moins
 * encombrée de marque et de grammage.
 */
function proposerProduit(foodName, products) {
  const cherches = mots(foodName);
  if (cherches.length === 0) return null;
  let meilleur = null;
  for (const product of products) {
    const dans = mots(`${product.name} ${product.brand ?? ""}`);
    if (!cherches.every((m) => dans.includes(m))) continue;
    if (!meilleur || dans.length < mots(`${meilleur.name} ${meilleur.brand ?? ""}`).length) {
      meilleur = product;
    }
  }
  return meilleur;
}

function daysUntil(iso, today) {
  return Math.round(
    (Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / MS_PER_DAY,
  );
}

function niveau(expiresAt, today) {
  if (!expiresAt) return "sans";
  const days = daysUntil(expiresAt, today);
  if (days < 0) return "perime";
  if (days <= URGENT_DAYS) return "urgent";
  if (days <= SOON_DAYS) return "bientot";
  return "ok";
}

/**
 * Ce que la maison a sous la main, vu de Mealie : une table
 * `foodId → { always } | { product, lot }`, le lot retenu étant celui qui périme
 * le plus tôt — c'est celui qu'on veut cuisiner en premier.
 */
function stockParAliment(links, products, lots, today) {
  const table = new Map();
  for (const link of links) {
    if (link.always) {
      table.set(link.foodId, { always: true });
      continue;
    }
    if (!link.productId) continue;
    const product = products.find((p) => p.id === link.productId);
    if (!product) continue;
    const candidats = lots
      .filter((lot) => lot.productId === product.id && lot.quantity > 0)
      .sort((a, b) => (a.expiresAt ?? "9999").localeCompare(b.expiresAt ?? "9999"));
    if (candidats.length === 0) continue;
    const lot = candidats[0];
    table.set(link.foodId, {
      always: false,
      product,
      lot,
      level: niveau(lot.expiresAt, today),
    });
  }
  return table;
}

/* « À sauver » veut dire « sinon on le jette ». Le seuil est la semaine, pas le
   mois : un réfrigérateur normal contient toujours quelque chose qui périme dans
   les trente jours, et une section qui remonte tout ne trie plus rien. Les lots
   à trente jours restent signalés sur la recette, simplement sans la faire
   remonter en tête. */
const SAUVETAGE_JOURS = 7;

/**
 * Chaque recette du carnet, ingrédient par ingrédient, avec ce qu'on en a.
 *
 * La question à laquelle ça répond est « pour cette recette, qu'est-ce que j'ai
 * déjà », pour ne pas racheter ce qui dort au congélateur. Le classement — d'abord
 * ce qui sauve un lot qui presse — n'est qu'une lecture parmi d'autres de la même
 * liste : c'est l'interface qui trie et filtre, pas ce calcul.
 *
 * Quatre états par ingrédient, et la distinction entre les deux derniers compte :
 *   stock    — relié à un produit dont il reste un lot, ici, avec sa date
 *   toujours — le sel, l'huile : on l'a sans le compter
 *   manque   — relié à un produit, mais plus rien en réserve : à racheter
 *   inconnu  — jamais relié : on n'en sait rien, ce qui n'est pas « on ne l'a pas »
 */
function croiserRecettes({ index, links, products, lots, places = [], today }) {
  const stock = stockParAliment(links, products, lots, today);
  const nomsAliments = new Map((index.foods ?? []).map((f) => [f.id, f.name]));
  const relies = new Set(links.map((l) => l.foodId));
  const nomsLieux = new Map(places.map((p) => [p.id, p.name]));

  const resultats = [];
  let ignorees = 0;
  for (const recipe of index.recipes ?? []) {
    /* Une recette dont aucun ingrédient n'est structuré dans Mealie ne peut pas
       être jugée : elle sortirait « il ne manque rien » alors qu'on ne sait
       strictement rien d'elle. On la compte et on la laisse de côté — le chiffre
       dit à l'utilisateur ce que son carnet gagnerait à être complété. */
    if (recipe.foodIds.length === 0) {
      ignorees += 1;
      continue;
    }

    const ingredients = recipe.foodIds.map((foodId) => {
      // Le repli ne devrait plus servir : l'index tire les noms des recettes
      // elles-mêmes. S'il sort quand même, il donne de quoi retrouver l'aliment
      // dans Mealie plutôt qu'un « inconnu » sur lequel on ne peut rien faire.
      const nom = nomsAliments.get(foodId) ?? `Aliment ${foodId.slice(0, 8)}`;

      const trouve = stock.get(foodId);
      if (!trouve) {
        return { foodId, name: nom, status: relies.has(foodId) ? "manque" : "inconnu" };
      }
      if (trouve.always) return { foodId, name: nom, status: "toujours" };
      return {
        foodId,
        name: nom,
        status: "stock",
        productId: trouve.product.id,
        productName: trouve.product.name,
        placeName: nomsLieux.get(trouve.lot.placeId) ?? null,
        quantity: trouve.lot.quantity,
        unit: trouve.product.unit ?? "",
        lotId: trouve.lot.id,
        expiresAt: trouve.lot.expiresAt,
        level: trouve.level,
      };
    });

    const enStock = ingredients.filter((i) => i.status === "stock");
    const presse = enStock.filter(
      (i) => i.expiresAt && daysUntil(i.expiresAt, today) <= SAUVETAGE_JOURS,
    );
    const echeance = presse
      .map((i) => i.expiresAt)
      .sort((a, b) => String(a).localeCompare(String(b)))[0];

    resultats.push({
      slug: recipe.slug,
      name: recipe.name,
      url: recipe.url,
      image: recipe.image,
      totalTime: recipe.totalTime,
      servings: recipe.servings,
      // Les lignes en texte libre échappent au calcul : l'interface le dit, plutôt
      // que de laisser croire à une recette vérifiée de bout en bout.
      freeText: recipe.freeText,
      ingredients,
      haveCount: ingredients.filter((i) => i.status === "stock" || i.status === "toujours").length,
      missingCount: ingredients.filter((i) => i.status === "manque" || i.status === "inconnu").length,
      urgent: presse.length > 0,
      soonest: echeance ?? null,
    });
  }

  const recettes = resultats.sort((a, b) => a.name.localeCompare(b.name, "fr"));
  return { recettes, ignorees };
}

/**
 * Les aliments qui attendent une correspondance, les plus utilisés d'abord —
 * relier « ail » avant « graines de nigelle » rend l'écran utile en dix minutes
 * au lieu de deux heures.
 */
function alimentsARelier({ index, links, products, limit = 40 }) {
  const connus = new Set(links.map((l) => l.foodId));
  return (index.foods ?? [])
    .filter((food) => !connus.has(food.id))
    // Le tri est refait ici plutôt que supposé acquis : l'ordre de l'index est
    // une commodité de fabrication, pas un contrat.
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0) || a.name.localeCompare(b.name, "fr"))
    .slice(0, limit)
    .map((food) => {
      const propose = proposerProduit(food.name, products);
      return {
        foodId: food.id,
        foodName: food.name,
        count: food.count,
        suggestion: propose ? { productId: propose.id, productName: propose.name } : null,
      };
    });
}

export { alimentsARelier, croiserRecettes, mots, niveau, normaliser, proposerProduit, stockParAliment };
