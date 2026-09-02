import { describe, expect, it } from "vitest";
import { alimentsARelier, normaliser, proposerProduit, recettesPossibles } from "./cuisine.js";

const AUJOURDHUI = "2026-09-02";

const produits = [
  { id: "p-pois", name: "Petits pois extra-fins 750 g", brand: "Bonduelle" },
  { id: "p-poulet", name: "Filet de poulet", brand: "" },
  { id: "p-creme", name: "Crème fraîche épaisse 30 cl", brand: "Elle & Vire" },
];

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

describe("recettesPossibles", () => {
  const links = [
    { foodId: "f-pois", foodName: "petits pois", productId: "p-pois", always: false },
    { foodId: "f-poulet", foodName: "filet de poulet", productId: "p-poulet", always: false },
    { foodId: "f-sel", foodName: "Sel, poivre", productId: null, always: true },
  ];

  it("ne compte pas comme manquant ce qui est toujours là", () => {
    const lots = [lot("l1", "p-pois", "2027-01-01"), lot("l2", "p-poulet", "2027-01-01")];
    const { recettes } = recettesPossibles({ index, links, products: produits, lots, today: AUJOURDHUI });
    const recette = recettes[0];
    expect(recette.slug).toBe("poulet-petits-pois");
    expect(recette.missing).toEqual([]);
  });

  it("compte comme manquant un produit relié dont il ne reste aucun lot", () => {
    const lots = [lot("l1", "p-pois", "2027-01-01")];
    const { recettes: trouvees } = recettesPossibles({ index, links, products: produits, lots, today: AUJOURDHUI });
    const recette = trouvees.find((r) => r.slug === "poulet-petits-pois");
    expect(recette.missing.map((m) => m.name)).toEqual(["filet de poulet"]);
  });

  it("remonte d'abord ce qui sauve un lot qui presse", () => {
    const lots = [
      lot("l1", "p-pois", "2026-09-04"), // dans deux jours
      lot("l2", "p-poulet", "2027-01-01"),
    ];
    const { recettes: trouvees } = recettesPossibles({ index, links, products: produits, lots, today: AUJOURDHUI });
    expect(trouvees[0].slug).toBe("poulet-petits-pois");
    expect(trouvees[0].urgent).toBe(true);
    expect(trouvees[0].soonest).toBe("2026-09-04");
  });

  it("ne crie pas au sauvetage pour un lot à trois semaines", () => {
    // Un réfrigérateur contient toujours quelque chose qui périme dans le mois :
    // si tout remonte en tête, la section « à sauver » ne trie plus rien.
    const lots = [lot("l1", "p-pois", "2026-09-23"), lot("l2", "p-poulet", "2027-01-01")];
    const { recettes } = recettesPossibles({ index, links, products: produits, lots, today: AUJOURDHUI });
    const recette = recettes[0];
    expect(recette.urgent).toBe(false);
    // Le lot reste néanmoins signalé sur la recette, avec son niveau.
    expect(recette.uses.find((u) => u.productId === "p-pois").level).toBe("bientot");
  });

  it("écarte les recettes au-delà du nombre d'ingrédients manquants accepté", () => {
    const lots = [lot("l1", "p-pois", "2027-01-01"), lot("l2", "p-poulet", "2027-01-01")];
    const { recettes: trouvees } = recettesPossibles({
      index,
      links,
      products: produits,
      lots,
      today: AUJOURDHUI,
      maxMissing: 0,
    });
    expect(trouvees.map((r) => r.slug)).toEqual(["poulet-petits-pois"]);
  });

  it("signale les lignes en texte libre, invérifiables", () => {
    const lots = [];
    const { recettes: trouvees } = recettesPossibles({
      index,
      links,
      products: produits,
      lots,
      today: AUJOURDHUI,
      maxMissing: 5,
    });
    expect(trouvees.find((r) => r.slug === "risotto-safran").freeText).toBe(2);
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
    const { recettes, ignorees } = recettesPossibles({
      index: carnet,
      links,
      products: produits,
      lots: [],
      today: AUJOURDHUI,
      maxMissing: 5,
    });
    expect(ignorees).toBe(1);
    expect(recettes.some((r) => r.slug === "brownies")).toBe(false);
  });

  it("ne retient pas un lot vidé", () => {
    const lots = [lot("l1", "p-pois", "2027-01-01", 0), lot("l2", "p-poulet", "2027-01-01")];
    const recette = recettesPossibles({ index, links, products: produits, lots, today: AUJOURDHUI }).recettes.find(
      (r) => r.slug === "poulet-petits-pois",
    );
    expect(recette.missing.map((m) => m.name)).toEqual(["petits pois"]);
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
    const links = [{ foodId: "f-sel", foodName: "Sel, poivre", productId: null, always: true }];
    const attente = alimentsARelier({ index, links, products: produits });
    expect(attente.some((f) => f.foodId === "f-sel")).toBe(false);
  });
});
