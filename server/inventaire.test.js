import { describe, expect, it } from "vitest";
import {
  consumeLot,
  defaultPlaces,
  deletePlace,
  deleteProduct,
  upsertLot,
  upsertPlace,
  upsertProduct,
} from "./inventaire.js";

function maison() {
  const data = { places: [], products: [], lots: [], links: [] };
  const place = upsertPlace(data, null, {
    name: "Congélateur",
    kind: "congelateur",
    sections: [{ name: "Tiroir du haut" }, { name: "Tiroir du bas" }],
  }).place;
  const product = upsertProduct(data, null, {
    name: "Petits pois",
    unit: "g",
    ean: "3017620422003",
  }).product;
  return { data, place, product };
}

function ranger(data, place, product, extra = {}) {
  return upsertLot(
    data,
    null,
    {
      productId: product.id,
      placeId: place.id,
      sectionId: place.sections[0].id,
      quantity: 3,
      storedAt: "2026-03-01",
      expiresAt: "2027-03-01",
      ...extra,
    },
    "claire",
  );
}

describe("defaultPlaces", () => {
  it("propose des réserves distinctes et garnies", () => {
    const places = defaultPlaces();
    expect(places).toHaveLength(3);
    expect(new Set(places.map((p) => p.id)).size).toBe(3);
    expect(places.every((p) => p.sections.length > 0)).toBe(true);
  });
});

describe("upsertPlace", () => {
  it("refuse deux réserves du même nom", () => {
    const { data } = maison();
    const result = upsertPlace(data, null, { name: "congélateur", kind: "frigo" });
    expect(result.ok).toBe(false);
  });

  it("libère les lots d'une section supprimée sans les perdre", () => {
    const { data, place, product } = maison();
    ranger(data, place, product);
    upsertPlace(data, place.id, { sections: [{ id: place.sections[1].id, name: "Tiroir du bas" }] });
    expect(data.lots).toHaveLength(1);
    expect(data.lots[0].sectionId).toBe(null);
  });

  it("conserve les lots des sections gardées", () => {
    const { data, place, product } = maison();
    ranger(data, place, product);
    upsertPlace(data, place.id, {
      sections: place.sections.map((s) => ({ id: s.id, name: s.name })),
    });
    expect(data.lots[0].sectionId).toBe(place.sections[0].id);
  });
});

describe("deletePlace", () => {
  it("refuse de vider une réserve pleine par mégarde", () => {
    const { data, place, product } = maison();
    ranger(data, place, product);
    expect(deletePlace(data, place.id).ok).toBe(false);
    expect(data.places).toHaveLength(1);
  });

  it("supprime une réserve vide", () => {
    const { data, place } = maison();
    expect(deletePlace(data, place.id).ok).toBe(true);
    expect(data.places).toHaveLength(0);
  });
});

describe("upsertProduct", () => {
  it("refuse un code-barres déjà attribué", () => {
    const { data } = maison();
    const result = upsertProduct(data, null, { name: "Autre chose", ean: "3017620422003" });
    expect(result.ok).toBe(false);
  });

  it("laisse un produit garder son propre code en modification", () => {
    const { data, product } = maison();
    const result = upsertProduct(data, product.id, { name: "Petits pois extra-fins" });
    expect(result.ok).toBe(true);
    expect(result.product.ean).toBe("3017620422003");
  });

  it("laisse effacer un code-barres, mais pas par omission", () => {
    const { data, product } = maison();
    // Champ absent : le code reste. Champ à null : il part.
    expect(upsertProduct(data, product.id, { name: "Petits pois" }).product.ean).toBe(
      "3017620422003",
    );
    expect(upsertProduct(data, product.id, { ean: null }).product.ean).toBe(null);
  });

  it("refuse de supprimer un produit encore rangé", () => {
    const { data, place, product } = maison();
    ranger(data, place, product);
    expect(deleteProduct(data, product.id).ok).toBe(false);
  });
});

describe("upsertLot", () => {
  it("range et signe", () => {
    const { data, place, product } = maison();
    const result = ranger(data, place, product);
    expect(result.ok).toBe(true);
    expect(result.lot.addedBy).toBe("claire");
    expect(data.lots).toHaveLength(1);
  });

  it("refuse une section qui appartient à une autre réserve", () => {
    const { data, place, product } = maison();
    const autre = upsertPlace(data, null, { name: "Placard", kind: "placard", sections: [{ name: "Étage 1" }] }).place;
    const result = upsertLot(
      data,
      null,
      {
        productId: product.id,
        placeId: autre.id,
        sectionId: place.sections[0].id,
        quantity: 1,
        storedAt: "2026-03-01",
      },
      "claire",
    );
    expect(result.ok).toBe(false);
  });

  it("refuse une péremption antérieure au rangement", () => {
    const { data, place, product } = maison();
    const result = ranger(data, place, product, { expiresAt: "2026-02-01" });
    expect(result.ok).toBe(false);
  });

  it("accepte un lot sans date de péremption", () => {
    const { data, place, product } = maison();
    const result = ranger(data, place, product, { expiresAt: null });
    expect(result.ok).toBe(true);
    expect(result.lot.expiresAt).toBe(null);
  });
});

describe("consumeLot", () => {
  it("décompte ce qui est pris", () => {
    const { data, place, product } = maison();
    const lot = ranger(data, place, product).lot;
    const result = consumeLot(data, lot.id, 1, "paul");
    expect(result.ok).toBe(true);
    expect(data.lots[0].quantity).toBe(2);
    expect(data.lots[0].updatedBy).toBe("paul");
  });

  it("retire le lot quand il ne reste rien", () => {
    const { data, place, product } = maison();
    const lot = ranger(data, place, product).lot;
    consumeLot(data, lot.id, 3, "paul");
    expect(data.lots).toHaveLength(0);
  });

  it("ne descend pas sous zéro si l'on prend plus que le stock", () => {
    const { data, place, product } = maison();
    const lot = ranger(data, place, product).lot;
    const result = consumeLot(data, lot.id, 99, "paul");
    expect(result.taken).toBe(3);
    expect(data.lots).toHaveLength(0);
  });

  it("garde les millièmes propres", () => {
    const { data, place, product } = maison();
    const lot = ranger(data, place, product, { quantity: 0.3 }).lot;
    consumeLot(data, lot.id, 0.1, "paul");
    expect(data.lots[0].quantity).toBe(0.2);
  });
});
