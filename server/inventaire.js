"use strict";

/**
 * Les opérations sur l'inventaire : réserves, produits, lots.
 *
 * Chaque fonction reçoit l'objet inventaire déjà lu et le modifie sur place, puis
 * renvoie { ok: true, ... } ou { ok: false, error }. Aucune ne touche au disque —
 * c'est store.updateInventory qui lit, appelle, et sauvegarde. Elles se testent
 * donc sur un objet littéral, sans volume ni serveur.
 */

import crypto from "node:crypto";
import {
  validateBrand,
  validateCategory,
  validateEan,
  validateExpiresAt,
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
} from "./validate.js";

const MAX_PLACES = 30;
const MAX_PRODUCTS = 5000;
const MAX_LOTS = 10000;

function fail(error) {
  return { ok: false, error };
}

function newId() {
  return crypto.randomUUID();
}

/* Une première réserve toute faite, proposée au moment de créer le compte : une
   appli d'inventaire ouverte sur trois listes vides ne dit pas quoi en faire. Les
   noms sont ordinaires exprès, ils se renomment en deux gestes. */
function defaultPlaces() {
  const now = new Date().toISOString();
  return [
    {
      id: newId(),
      name: "Congélateur",
      kind: "congelateur",
      sections: ["Tiroir du haut", "Tiroir du milieu", "Tiroir du bas"].map((name) => ({
        id: newId(),
        name,
      })),
      createdAt: now,
    },
    {
      id: newId(),
      name: "Placard cuisine",
      kind: "placard",
      sections: ["Étage 1", "Étage 2", "Étage 3"].map((name) => ({ id: newId(), name })),
      createdAt: now,
    },
    {
      id: newId(),
      name: "Réfrigérateur",
      kind: "frigo",
      sections: ["Clayette haute", "Clayette basse", "Bac à légumes", "Porte"].map((name) => ({
        id: newId(),
        name,
      })),
      createdAt: now,
    },
  ];
}

// ---- Réserves ----

function upsertPlace(data, id, body) {
  const existing = id ? data.places.find((p) => p.id === id) : null;
  if (id && !existing) return fail("Réserve introuvable.");
  if (!id && data.places.length >= MAX_PLACES) {
    return fail(`Pas plus de ${MAX_PLACES} réserves.`);
  }

  const name = validateName(body.name ?? existing?.name);
  if (!name.ok) return name;
  const kind = validatePlaceKind(body.kind ?? existing?.kind ?? "placard");
  if (!kind.ok) return kind;
  const sections = validateSections(body.sections, existing?.sections ?? []);
  if (!sections.ok) return sections;

  const twin = data.places.find(
    (p) => p.id !== id && p.name.toLowerCase() === name.value.toLowerCase(),
  );
  if (twin) return fail(`Une réserve s'appelle déjà « ${name.value} ».`);

  // Une section supprimée laisse des lots orphelins : ils remontent d'un cran, dans
  // la réserve elle-même. Perdre l'étage est moins grave que perdre le surgelé.
  const kept = sections.value.map((s) => ({ id: s.id ?? newId(), name: s.name }));
  if (existing) {
    const stillThere = new Set(kept.map((s) => s.id));
    for (const lot of data.lots) {
      if (lot.placeId === existing.id && lot.sectionId && !stillThere.has(lot.sectionId)) {
        lot.sectionId = null;
      }
    }
    existing.name = name.value;
    existing.kind = kind.value;
    existing.sections = kept;
    return { ok: true, place: existing };
  }

  const place = {
    id: newId(),
    name: name.value,
    kind: kind.value,
    sections: kept,
    createdAt: new Date().toISOString(),
  };
  data.places.push(place);
  return { ok: true, place };
}

function deletePlace(data, id) {
  const place = data.places.find((p) => p.id === id);
  if (!place) return fail("Réserve introuvable.");
  const used = data.lots.filter((l) => l.placeId === id).length;
  // Refuser plutôt que supprimer en cascade : une réserve pleine que l'on efface
  // par mégarde emporterait des dizaines de lignes sans que rien ne le dise.
  if (used > 0) {
    return fail(`Cette réserve contient encore ${used} lot(s). Videz-la d'abord.`);
  }
  data.places = data.places.filter((p) => p.id !== id);
  return { ok: true };
}

// ---- Produits ----

function upsertProduct(data, id, body) {
  const existing = id ? data.products.find((p) => p.id === id) : null;
  if (id && !existing) return fail("Produit introuvable.");
  if (!id && data.products.length >= MAX_PRODUCTS) {
    return fail(`Pas plus de ${MAX_PRODUCTS} produits.`);
  }

  const name = validateProductName(body.name ?? existing?.name);
  if (!name.ok) return name;
  const brand = validateBrand(body.brand ?? existing?.brand ?? "");
  if (!brand.ok) return brand;
  const category = validateCategory(body.category ?? existing?.category ?? "");
  if (!category.ok) return category;
  const unit = validateUnit(body.unit ?? existing?.unit);
  if (!unit.ok) return unit;
  // `undefined` veut dire « ce champ n'est pas dans la requête », `null` veut dire
  // « je l'ai effacé ». Les confondre rendrait un code-barres impossible à retirer :
  // le formulaire enverrait null, et l'ancien code reviendrait à sa place.
  const ean = validateEan(body.ean === undefined ? (existing?.ean ?? "") : body.ean);
  if (!ean.ok) return ean;
  const shelfLife = validateShelfLife(
    body.shelfLifeDays === undefined ? (existing?.shelfLifeDays ?? null) : body.shelfLifeDays,
  );
  if (!shelfLife.ok) return shelfLife;
  const imageUrl = validateImageUrl(
    body.imageUrl === undefined ? (existing?.imageUrl ?? "") : body.imageUrl,
  );
  if (!imageUrl.ok) return imageUrl;

  // Un code-barres désigne un produit et un seul : deux fiches pour le même code
  // rendraient le scan ambigu, ce qui est précisément ce qu'il vient éviter.
  if (ean.value) {
    const twin = data.products.find((p) => p.id !== id && p.ean === ean.value);
    if (twin) return fail(`Ce code-barres est déjà celui de « ${twin.name} ».`);
  }

  if (existing) {
    Object.assign(existing, {
      name: name.value,
      brand: brand.value,
      category: category.value,
      unit: unit.value,
      ean: ean.value,
      shelfLifeDays: shelfLife.value,
      imageUrl: imageUrl.value,
    });
    return { ok: true, product: existing };
  }

  const product = {
    id: newId(),
    name: name.value,
    brand: brand.value,
    category: category.value,
    unit: unit.value,
    ean: ean.value,
    shelfLifeDays: shelfLife.value,
    imageUrl: imageUrl.value,
    createdAt: new Date().toISOString(),
  };
  data.products.push(product);
  return { ok: true, product };
}

function deleteProduct(data, id) {
  const product = data.products.find((p) => p.id === id);
  if (!product) return fail("Produit introuvable.");
  const used = data.lots.filter((l) => l.productId === id).length;
  if (used > 0) {
    return fail(`« ${product.name} » est encore rangé quelque part (${used} lot(s)).`);
  }
  data.products = data.products.filter((p) => p.id !== id);
  return { ok: true };
}

// ---- Lots ----

function resolvePlacement(data, placeId, sectionId) {
  const place = data.places.find((p) => p.id === placeId);
  if (!place) return fail("Réserve introuvable.");
  if (sectionId === undefined || sectionId === null || sectionId === "") {
    return { ok: true, value: { placeId: place.id, sectionId: null } };
  }
  const section = place.sections.find((s) => s.id === sectionId);
  if (!section) return fail("Section introuvable dans cette réserve.");
  return { ok: true, value: { placeId: place.id, sectionId: section.id } };
}

function upsertLot(data, id, body, username) {
  const existing = id ? data.lots.find((l) => l.id === id) : null;
  if (id && !existing) return fail("Lot introuvable.");
  if (!id && data.lots.length >= MAX_LOTS) return fail(`Pas plus de ${MAX_LOTS} lots.`);

  const productId = body.productId ?? existing?.productId;
  const product = data.products.find((p) => p.id === productId);
  if (!product) return fail("Produit introuvable.");

  const placement = resolvePlacement(
    data,
    body.placeId ?? existing?.placeId,
    body.sectionId === undefined ? (existing?.sectionId ?? null) : body.sectionId,
  );
  if (!placement.ok) return placement;

  const quantity = validatePositiveQuantity(body.quantity ?? existing?.quantity);
  if (!quantity.ok) return quantity;
  const storedAt = validateStoredAt(body.storedAt ?? existing?.storedAt);
  if (!storedAt.ok) return storedAt;
  const expiresAt = validateExpiresAt(
    body.expiresAt === undefined ? (existing?.expiresAt ?? null) : body.expiresAt,
  );
  if (!expiresAt.ok) return expiresAt;
  if (expiresAt.value && expiresAt.value < storedAt.value) {
    return fail("La date de péremption précède la date de stockage.");
  }
  const note = validateNote(body.note ?? existing?.note ?? "");
  if (!note.ok) return note;

  const now = new Date().toISOString();
  if (existing) {
    Object.assign(existing, {
      productId: product.id,
      placeId: placement.value.placeId,
      sectionId: placement.value.sectionId,
      quantity: quantity.value,
      storedAt: storedAt.value,
      expiresAt: expiresAt.value,
      note: note.value,
      updatedAt: now,
      updatedBy: username,
    });
    return { ok: true, lot: existing };
  }

  const lot = {
    id: newId(),
    productId: product.id,
    placeId: placement.value.placeId,
    sectionId: placement.value.sectionId,
    quantity: quantity.value,
    storedAt: storedAt.value,
    expiresAt: expiresAt.value,
    note: note.value,
    addedAt: now,
    addedBy: username,
    updatedAt: now,
    updatedBy: username,
  };
  data.lots.push(lot);
  return { ok: true, lot };
}

/* Retirer ce qu'on vient de prendre. Le lot disparaît quand il ne reste rien :
   garder une ligne à zéro donnerait un inventaire qui ne se vide jamais, et la
   trace de ce qu'on a mangé n'est pas ce qu'on demande à un placard. */
function consumeLot(data, id, rawQuantity, username) {
  const lot = data.lots.find((l) => l.id === id);
  if (!lot) return fail("Lot introuvable.");
  const asked = validateQuantity(rawQuantity);
  if (!asked.ok) return asked;
  const taken = asked.value === 0 ? lot.quantity : Math.min(asked.value, lot.quantity);
  const left = Math.round((lot.quantity - taken) * 1000) / 1000;
  if (left <= 0) {
    data.lots = data.lots.filter((l) => l.id !== id);
    return { ok: true, lot: null, taken };
  }
  lot.quantity = left;
  lot.updatedAt = new Date().toISOString();
  lot.updatedBy = username;
  return { ok: true, lot, taken };
}

function deleteLot(data, id) {
  const lot = data.lots.find((l) => l.id === id);
  if (!lot) return fail("Lot introuvable.");
  data.lots = data.lots.filter((l) => l.id !== id);
  return { ok: true };
}

export {
  consumeLot,
  defaultPlaces,
  deleteLot,
  deletePlace,
  deleteProduct,
  newId,
  upsertLot,
  upsertPlace,
  upsertProduct,
};
