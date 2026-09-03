"use strict";

/**
 * Contrôles des données reçues du client. Fonctions pures (aucun accès disque ni réseau),
 * pour rester testables sans monter de serveur.
 *
 * Chaque fonction renvoie { ok: true, value } — la valeur normalisée à stocker — ou
 * { ok: false, error } avec un message affichable tel quel par le client.
 */

const PLACE_KINDS = ["congelateur", "frigo", "placard", "cave", "autre"];
const UNITS = ["pièce", "portion", "g", "kg", "mL", "L", "sachet", "boîte", "bocal"];

const MAX_NAME = 60;
const MAX_PRODUCT_NAME = 90;
const MAX_BRAND = 60;
const MAX_CATEGORY = 40;
const MAX_NOTE = 200;
const MAX_SECTIONS = 30;
/* Deux colonnes suffisent à tout ce qui se rencontre dans une cuisine : un
   meuble simple, ou un frigo américain à deux portes. Trois laisse la marge. */
const MAX_COLUMNS = 3;
const MAX_QUANTITY = 100000;
// Une conserve de bœuf tient cinq ans, pas cinquante : au-delà, c'est une faute de frappe
// sur l'année, et la ligne polluerait tous les tris par date.
const MAX_DAYS_AHEAD = 20 * 365;
const MIN_DATE = "2000-01-01";

function ok(value) {
  return { ok: true, value };
}

function fail(error) {
  return { ok: false, error };
}

function validateBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return fail("Requête invalide.");
  }
  return ok(body);
}

function text(raw, { max, label, required = true }) {
  const value = String(raw ?? "").trim();
  if (value.length === 0) {
    return required ? fail(`${label} est obligatoire.`) : ok("");
  }
  if (value.length > max) return fail(`${label} ne peut pas dépasser ${max} caractères.`);
  return ok(value);
}

function validateName(raw) {
  return text(raw, { max: MAX_NAME, label: "Le nom" });
}

function validateProductName(raw) {
  return text(raw, { max: MAX_PRODUCT_NAME, label: "Le nom du produit" });
}

function validateBrand(raw) {
  return text(raw, { max: MAX_BRAND, label: "La marque", required: false });
}

function validateCategory(raw) {
  return text(raw, { max: MAX_CATEGORY, label: "Le rayon", required: false });
}

function validateNote(raw) {
  return text(raw, { max: MAX_NOTE, label: "La note", required: false });
}

function validatePlaceKind(raw) {
  if (!PLACE_KINDS.includes(raw)) {
    return fail(`Le type de réserve doit être ${PLACE_KINDS.join(", ")}.`);
  }
  return ok(raw);
}

function validateUnit(raw) {
  if (raw === undefined || raw === null || raw === "") return ok("pièce");
  if (!UNITS.includes(raw)) return fail(`L'unité doit être ${UNITS.join(", ")}.`);
  return ok(raw);
}

/* Les sections sont les étagères, tiroirs et bacs d'une réserve. Elles arrivent
   comme une liste de noms : c'est le serveur qui leur attribue une identité, pour
   que renommer « Tiroir 1 » n'oblige pas à retrouver tous les lots qui s'y
   rangeaient. Les sections déjà connues gardent donc leur id. */
function validateSections(raw, existing = []) {
  if (raw === undefined || raw === null) return ok(existing);
  if (!Array.isArray(raw)) return fail("Les sections doivent être une liste.");
  if (raw.length > MAX_SECTIONS) return fail(`Pas plus de ${MAX_SECTIONS} sections par réserve.`);
  const sections = [];
  const seen = new Set();
  for (const item of raw) {
    const name = text(item?.name, { max: MAX_NAME, label: "Le nom de la section" });
    if (!name.ok) return name;
    const key = name.value.toLowerCase();
    if (seen.has(key)) return fail(`Deux sections portent le nom « ${name.value} ».`);
    seen.add(key);
    /* La colonne où poser la section dans le dessin. Un placard n'en a qu'une ;
       un frigo américain en a deux, la porte de gauche et celle de droite. C'est
       la seule donnée de forme que l'on demande : l'ordre vertical vient déjà de
       l'ordre de la liste. */
    const column = Number(item?.column ?? 0);
    if (!Number.isInteger(column) || column < 0 || column >= MAX_COLUMNS) {
      return fail("La colonne d'une section est invalide.");
    }
    const known = typeof item?.id === "string" ? existing.find((s) => s.id === item.id) : null;
    sections.push({ id: known ? known.id : null, name: name.value, column });
  }
  return ok(sections);
}

/** Le nombre de battants d'un meuble : un placard, ou les deux portes d'un frigo américain. */
function validateColumns(raw) {
  if (raw === undefined || raw === null || raw === "") return ok(1);
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > MAX_COLUMNS) {
    return fail(`Une réserve compte de 1 à ${MAX_COLUMNS} colonnes.`);
  }
  return ok(value);
}

/* EAN-8, UPC-A (12) et EAN-13, plus le format à 14 chiffres des cartons. La clé
   de contrôle n'est pas vérifiée : un code mal lu par la caméra ne passerait de
   toute façon pas le contrôle de l'appli, et un code saisi à la main que l'on
   refuserait à tort serait plus agaçant qu'utile. */
function validateEan(raw) {
  const value = String(raw ?? "").trim();
  if (value.length === 0) return ok(null);
  if (!/^\d{8}$|^\d{12,14}$/.test(value)) {
    return fail("Un code-barres compte 8, 12, 13 ou 14 chiffres.");
  }
  return ok(value);
}

function validateQuantity(raw) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fail("La quantité doit être un nombre.");
  if (value < 0) return fail("La quantité ne peut pas être négative.");
  if (value > MAX_QUANTITY) return fail(`La quantité ne peut pas dépasser ${MAX_QUANTITY}.`);
  // Trois décimales : de quoi écrire 0,25 kg ou 1,5 L sans traîner les arrondis
  // flottants d'une soustraction à l'autre.
  return ok(Math.round(value * 1000) / 1000);
}

function validatePositiveQuantity(raw) {
  const result = validateQuantity(raw);
  if (!result.ok) return result;
  if (result.value <= 0) return fail("La quantité doit être supérieure à zéro.");
  return result;
}

/* Une date de calendrier, en YYYY-MM-DD. Le Date.parse d'un tel texte est lu en
   UTC ; on ne compare que des jours, jamais des heures, donc le décalage ne se
   voit pas — mais il interdit d'en tirer « aujourd'hui », qui vient du client. */
function isCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(time)) return false;
  return new Date(time).toISOString().slice(0, 10) === value;
}

function validateDate(raw, { label, required = true }) {
  const value = String(raw ?? "").trim();
  if (value.length === 0) {
    return required ? fail(`${label} est obligatoire.`) : ok(null);
  }
  if (!isCalendarDate(value)) return fail(`${label} doit être au format AAAA-MM-JJ.`);
  if (value < MIN_DATE) return fail(`${label} est trop ancienne.`);
  const limit = new Date(Date.now() + MAX_DAYS_AHEAD * 86400000).toISOString().slice(0, 10);
  if (value > limit) return fail(`${label} est trop lointaine.`);
  return ok(value);
}

function validateStoredAt(raw) {
  return validateDate(raw, { label: "La date de stockage" });
}

function validateExpiresAt(raw) {
  return validateDate(raw, { label: "La date de péremption", required: false });
}

/* Durée de conservation habituelle d'un produit, en jours : elle sert à proposer
   une péremption au moment du rangement. Zéro est refusé — une durée nulle n'est
   pas une information, c'est un champ laissé vide. */
function validateShelfLife(raw) {
  if (raw === undefined || raw === null || raw === "") return ok(null);
  const value = Number(raw);
  if (!Number.isInteger(value)) return fail("La durée de conservation doit être un nombre de jours.");
  if (value <= 0) return fail("La durée de conservation doit être d'au moins un jour.");
  if (value > MAX_DAYS_AHEAD) return fail("La durée de conservation est trop longue.");
  return ok(value);
}

function validateId(raw, label) {
  const value = String(raw ?? "").trim();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(value)) return fail(`${label} est invalide.`);
  return ok(value);
}

/* L'image vient d'Open Food Facts et n'est affichée que par un <img>. On n'accepte
   qu'une URL https : une url javascript: ou data: n'aurait rien à faire ici, même
   derrière une balise qui ne les exécute pas. */
function validateImageUrl(raw) {
  const value = String(raw ?? "").trim();
  if (value.length === 0) return ok(null);
  if (value.length > 300) return fail("L'adresse de l'image est trop longue.");
  let url;
  try {
    url = new URL(value);
  } catch {
    return fail("L'adresse de l'image est invalide.");
  }
  if (url.protocol !== "https:") return fail("L'adresse de l'image doit être en https.");
  return ok(url.toString());
}

export {
  PLACE_KINDS,
  UNITS,
  isCalendarDate,
  validateBody,
  validateBrand,
  validateCategory,
  validateColumns,
  validateDate,
  validateEan,
  validateExpiresAt,
  validateId,
  validateImageUrl,
  validateName,
  validateNote,
  validatePlaceKind,
  validatePositiveQuantity,
  validateProductName,
  validateQuantity,
  validateSections,
  validateShelfLife,
  validateStoredAt,
  validateUnit,
};
