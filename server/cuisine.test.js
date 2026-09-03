import { describe, expect, it } from "vitest";
import { alimentsARelier, croiserRecettes, normaliser, proposerProduit } from "./cuisine.js";

const AUJOURDHUI = "2026-09-02";

const produits = [
  { id: "p-pois", name: "Petits pois extra-fins 750 g", brand: "Bonduelle", unit: "g" },
  { id: "p-poulet", name: "Filet de poulet", brand: "", unit: "pièce" },
  { id: "p-creme", name: "Crème fraîche épaisse 30 cl", brand: "Elle & Vire", unit: "mL" },
];

const lieux = [{ id: "r1", name: "Congélateur" }];

const index = {
  foods: [
    { id: "f-pois", name: "petits pois", count: 4 },
    { id: "f-poulet", name: "filet de poulet", count: 9 },
    { id: "f-sel", name: "Sel, poivre", count: 38 },
    { id: "f-safran", name: "safran", count: 1 },
  ],
  recipes: [
    {
      slug: "poulet-petits-pois",
      name: "Poulet aux petits pois",
      url: "https://exemple/r/poulet-petits-pois",
      image: "",
      totalTime: "30",
      servings: 4,
      foodIds: ["f-poulet", "f-pois", "f-sel"],
      freeText: 0,
    },
    {
      slug: "risotto-safran",
      name: "Risotto au safran",
      url: "https://exemple/r/risotto-safran",
      image: "",
      totalTime: "45",
      servings: 2,
      foodIds: ["f-safran", "f-sel"],
      freeText: 2,
    },
  ],
};

function lot(id, productId, expiresAt, quantity = 1) {
  return { id, productId, expiresAt, quantity, placeId: "r1", sectionId: null, storedAt: "2026-08-01" };
}

const links = [
  { foodId: "f-pois", foodName: "petits pois", productId: "p-pois", always: false },
  { foodId: "f-poulet", foodName: "filet de poulet", productId: "p-poulet", always: false },
  { foodId: "f-sel", foodName: "Sel, poivre", productId: null, always: true },
];

function croiser(lots, options = {}) {
  return croiserRecettes({
    index,
    links,
    products: produits,
    places: lieux,
    lots,
    today: AUJOURDHUI,
    ...options,
  });
}

function recette(resultat, slug) {
  return resultat.recettes.find((r) => r.slug === slug);
}

function ingredient(rec, foodId) {
  return rec.ingredients.find((i) => i.foodId === foodId);
}

describe("normaliser", () => {
  it("efface accents, casse et ponctuation", () => {
    expect(normaliser("Crème fraîche épaisse, 30 cl")).toBe("creme fraiche epaisse 30 cl");
  });
});

describe("proposerProduit", () => {
  it("retrouve un produit derrière sa marque et son grammage", () => {
    expect(proposerProduit("petits pois", produits)?.id).toBe("p-pois");
  });

  it("ignore le pluriel", () => {
    expect(proposerProduit("petit pois", produits)?.id).toBe("p-pois");
  });

  it("ne propose rien plutôt que n'importe quoi", () => {
    expect(proposerProduit("safran", produits)).toBe(null);
  });

  it("ignore les mots-outils et les grammages", () => {
    // Le « de » de « filet de poulet » n'est pas au même endroit dans le nom du
    // produit, et « 300 g » ne dit rien de ce qu'il y a dedans.
    const catalogue = [{ id: "p-blanc", name: "Blanc de poulet 4 filets 300 g", brand: "Le Gaulois" }];
    expect(proposerProduit("filet de poulet", catalogue)?.id).toBe("p-blanc");
  });

  it("exige tous les mots de l'aliment", () => {
    // « filet de poisson » ne doit pas tomber sur « Filet de poulet ».
    expect(proposerProduit("filet de poisson", produits)).toBe(null);
  });
});

describe("croiserRecettes", () => {
  it("dit où se trouve ce qu'on a déjà, et jusqu'à quand", () => {
    const resultat = croiser([lot("l1", "p-pois", "2027-01-01", 3), lot("l2", "p-poulet", "2027-01-01")]);
    const pois = ingredient(recette(resultat, "poulet-petits-pois"), "f-pois");
    expect(pois.status).toBe("stock");
    expect(pois.productName).toBe("Petits pois extra-fins 750 g");
    expect(pois.placeName).toBe("Congélateur");
    expect(pois.quantity).toBe(3);
    expect(pois.unit).toBe("g");
  });

  it("ne demande pas de racheter ce qui est toujours là", () => {
    const rec = recette(croiser([]), "poulet-petits-pois");
    expect(ingredient(rec, "f-sel").status).toBe("toujours");
  });

  it("distingue « plus en réserve » de « jamais relié »", () => {
    // Les deux s'achètent, mais l'un est une certitude et l'autre une ignorance :
    // le second se corrige en reliant l'aliment, pas en passant au magasin.
    const rec = recette(croiser([]), "poulet-petits-pois");
    expect(ingredient(rec, "f-pois").status).toBe("manque");
    const risotto = recette(croiser([]), "risotto-safran");
    expect(ingredient(risotto, "f-safran").status).toBe("inconnu");
  });

  it("dit s'il y en a assez quand les unités se traduisent", () => {
    // La recette demande 500 g, le placard contient un paquet de 750 g.
    const carnet = {
      foods: index.foods,
      recipes: [
        {
          ...index.recipes[0],
          besoins: { "f-pois": { quantity: 500, unit: "grammes" } },
        },
      ],
    };
    const resultat = croiserRecettes({
      index: carnet,
      links,
      products: produits,
      places: lieux,
      lots: [{ ...lot("l1", "p-pois", "2027-01-01"), quantity: 750, unit: "g" }],
      today: AUJOURDHUI,
    });
    const pois = ingredient(resultat.recettes[0], "f-pois");
    expect(pois.besoin).toEqual({ quantity: 500, unit: "grammes" });
    expect(pois.assez).toBe(true);
    expect(pois.manque).toBe(null);
  });

  it("chiffre ce qui manque dans l'unité de la recette", () => {
    const carnet = {
      foods: index.foods,
      recipes: [{ ...index.recipes[0], besoins: { "f-pois": { quantity: 1, unit: "kg" } } }],
    };
    const resultat = croiserRecettes({
      index: carnet,
      links,
      products: produits,
      places: lieux,
      lots: [{ ...lot("l1", "p-pois", "2027-01-01"), quantity: 750, unit: "g" }],
      today: AUJOURDHUI,
    });
    const pois = ingredient(resultat.recettes[0], "f-pois");
    expect(pois.assez).toBe(false);
    expect(pois.manque).toBe(0.25); // 250 g, dits en kilos comme la recette
  });

  it("ne tranche pas quand les unités ne se traduisent pas", () => {
    // Deux cuillères à soupe face à des grammes : sans savoir de quoi il s'agit,
    // la conversion serait une invention.
    const carnet = {
      foods: index.foods,
      recipes: [
        {
          ...index.recipes[0],
          besoins: { "f-pois": { quantity: 2, unit: "cuillère à soupe" } },
        },
      ],
    };
    const resultat = croiserRecettes({
      index: carnet,
      links,
      products: produits,
      places: lieux,
      lots: [{ ...lot("l1", "p-pois", "2027-01-01"), quantity: 750, unit: "g" }],
      today: AUJOURDHUI,
    });
    const pois = ingredient(resultat.recettes[0], "f-pois");
    expect(pois.assez).toBe(null);
    expect(pois.besoin).toEqual({ quantity: 2, unit: "cuillère à soupe" });
  });

  it("retient l'unité du lot, pas celle du produit", () => {
    // Le même poulet se range une fois en pièces, une fois en grammes.
    const resultat = croiser([{ ...lot("l1", "p-poulet", "2027-01-01"), quantity: 600, unit: "g" }])
    const poulet = ingredient(recette(resultat, "poulet-petits-pois"), "f-poulet");
    expect(poulet.unit).toBe("g");
    expect(poulet.quantity).toBe(600);
  });

  it("compte ce qu'on a et ce qui manque", () => {
    const rec = recette(croiser([lot("l1", "p-pois", "2027-01-01")]), "poulet-petits-pois");
    expect(rec.haveCount).toBe(2); // les petits pois, et le sel toujours là
    expect(rec.missingCount).toBe(1); // le poulet
  });

  it("signale une recette qui sauverait un lot de la semaine", () => {
    const rec = recette(
      croiser([lot("l1", "p-pois", "2026-09-04"), lot("l2", "p-poulet", "2027-01-01")]),
      "poulet-petits-pois",
    );
    expect(rec.urgent).toBe(true);
    expect(rec.soonest).toBe("2026-09-04");
  });

  it("ne crie pas au sauvetage pour un lot à trois semaines", () => {
    // Un réfrigérateur contient toujours quelque chose qui périme dans le mois :
    // si tout remonte en tête, la section « à sauver » ne trie plus rien.
    const rec = recette(croiser([lot("l1", "p-pois", "2026-09-23")]), "poulet-petits-pois");
    expect(rec.urgent).toBe(false);
    expect(ingredient(rec, "f-pois").level).toBe("bientot");
  });

  it("ne retient pas un lot vidé", () => {
    const rec = recette(croiser([lot("l1", "p-pois", "2027-01-01", 0)]), "poulet-petits-pois");
    expect(ingredient(rec, "f-pois").status).toBe("manque");
  });

  it("rend toutes les recettes, du plus complet au moins complet ou non", () => {
    // Le tri et le filtrage appartiennent à l'interface : ce calcul ne cache rien.
    const resultat = croiser([]);
    expect(resultat.recettes.map((r) => r.slug).sort()).toEqual(["poulet-petits-pois", "risotto-safran"]);
  });

  it("signale les lignes en texte libre, invérifiables", () => {
    expect(recette(croiser([]), "risotto-safran").freeText).toBe(2);
  });

  it("écarte, en les comptant, les recettes dont aucun ingrédient n'est structuré", () => {
    // Sans un seul aliment identifiable, la recette sortirait « il ne manque
    // rien » alors qu'on ne sait rien d'elle : c'est le pire des résultats.
    const carnet = {
      foods: index.foods,
      recipes: [
        ...index.recipes,
        { slug: "brownies", name: "Brownies", url: "", image: "", totalTime: null, servings: null, foodIds: [], freeText: 13 },
      ],
    };
    const resultat = croiserRecettes({
      index: carnet,
      links,
      products: produits,
      places: lieux,
      lots: [],
      today: AUJOURDHUI,
    });
    expect(resultat.ignorees).toBe(1);
    expect(resultat.recettes.some((r) => r.slug === "brownies")).toBe(false);
  });
});

describe("alimentsARelier", () => {
  it("classe par fréquence et propose un produit quand il en trouve un", () => {
    const attente = alimentsARelier({ index, links: [], products: produits });
    expect(attente[0].foodName).toBe("Sel, poivre");
    expect(attente.find((f) => f.foodId === "f-pois").suggestion.productId).toBe("p-pois");
    expect(attente.find((f) => f.foodId === "f-safran").suggestion).toBe(null);
  });

  it("ne repropose pas ce qui est déjà relié", () => {
    const attente = alimentsARelier({ index, links, products: produits });
    expect(attente.some((f) => f.foodId === "f-sel")).toBe(false);
  });
});
