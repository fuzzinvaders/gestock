"use strict";

/**
 * Comparer « 500 grammes » d'une recette à « 2 pièces » d'un placard.
 *
 * Trois familles seulement — masse, volume, compte — et rien entre elles. Une
 * cuillère à soupe de sauce soja ne se convertit pas en millilitres sans savoir
 * de quoi il s'agit, et une pincée encore moins. Refuser de répondre y est la
 * bonne réponse : une comparaison fausse sur les quantités enverrait faire des
 * courses inutiles, ce qui est exactement ce que l'application cherche à éviter.
 *
 * Les noms viennent de deux mondes : les unités de Mealie, saisies en français
 * par un humain (« gramme », « cuillère à soupe »), et celles de Gestock, prises
 * dans une liste fermée. On normalise les deux de la même façon.
 */

const FAMILLES = {
  // masse, en grammes
  g: ["masse", 1],
  gr: ["masse", 1],
  gramme: ["masse", 1],
  grammes: ["masse", 1],
  kg: ["masse", 1000],
  kilo: ["masse", 1000],
  kilos: ["masse", 1000],
  kilogramme: ["masse", 1000],
  kilogrammes: ["masse", 1000],
  mg: ["masse", 0.001],

  // volume, en millilitres
  ml: ["volume", 1],
  millilitre: ["volume", 1],
  millilitres: ["volume", 1],
  cl: ["volume", 10],
  centilitre: ["volume", 10],
  centilitres: ["volume", 10],
  dl: ["volume", 100],
  l: ["volume", 1000],
  litre: ["volume", 1000],
  litres: ["volume", 1000],

  /* Le compte : ce qui se dénombre à l'unité. « Sachet », « boîte » et « bocal »
     n'y figurent pas — deux sachets ne font pas deux pièces, et prétendre le
     contraire ferait dire à l'application qu'on a de quoi faire une recette alors
     qu'on a un sachet vide de moitié. */
  piece: ["compte", 1],
  pieces: ["compte", 1],
  unite: ["compte", 1],
  unites: ["compte", 1],
};

function normaliser(unite) {
  return String(unite ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

/**
 * La famille d'une unité et son facteur vers l'unité de base, ou null si l'unité
 * est inconnue ou intraduisible. Une quantité sans unité du tout est comptée
 * comme un dénombrement : « 2 carottes » n'écrit pas son unité.
 */
function analyser(unite) {
  const clef = normaliser(unite);
  if (clef === "") return { famille: "compte", facteur: 1 };
  const trouve = FAMILLES[clef];
  if (!trouve) return null;
  return { famille: trouve[0], facteur: trouve[1] };
}

/** Deux quantités sont-elles comparables, et si oui, laquelle couvre l'autre ? */
function comparer(besoin, stock) {
  const a = analyser(besoin.unit);
  const b = analyser(stock.unit);
  if (!a || !b || a.famille !== b.famille) return { comparable: false };
  if (!Number.isFinite(besoin.quantity) || !Number.isFinite(stock.quantity)) {
    return { comparable: false };
  }
  const requis = besoin.quantity * a.facteur;
  const dispo = stock.quantity * b.facteur;
  return {
    comparable: true,
    famille: a.famille,
    assez: dispo >= requis,
    // Ce qui manque, exprimé dans l'unité de la recette : c'est elle qu'on lit en
    // cuisinant, et c'est elle qu'on emportera au magasin.
    manque: dispo >= requis ? 0 : Math.round(((requis - dispo) / a.facteur) * 100) / 100,
  };
}

/** « 500 g », « 1,5 kg », « 2 » — la quantité telle qu'on l'écrirait à la main. */
function formater(quantity, unit) {
  if (!Number.isFinite(quantity)) return "";
  const nombre = Number.isInteger(quantity)
    ? String(quantity)
    : String(Math.round(quantity * 100) / 100).replace(".", ",");
  const u = String(unit ?? "").trim();
  return u ? `${nombre} ${u}` : nombre;
}

export { analyser, comparer, formater, normaliser };
