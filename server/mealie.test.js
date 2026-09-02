import { describe, expect, it } from "vitest";
import { summarise } from "./mealie.js";

/* Une recette telle que Mealie la rend, réduite à ce qui nous occupe. Les
   identifiants et les noms sont ceux d'un vrai carnet : c'est la forme exacte
   des données qui compte ici, pas leur contenu. */
const RECETTE = {
  id: "3930e54a-b933-4cc8-97c3-ba86c6d26abd",
  slug: "emince-de-dinde-aux-legumes-sautes-et-quinoa",
  name: "Émincé de dinde aux légumes sautés et quinoa",
  totalTime: "35 minutes",
  recipeServings: 4,
  recipeIngredient: [
    { quantity: 500, food: { id: "f91106b2", name: "escalope de dinde" } },
    { quantity: 200, food: { id: "25e17ea3", name: "quinoa" } },
    { quantity: 1, food: { id: "ac47792c", name: "carotte" } },
    // Le même aliment revient : il ne doit compter qu'une fois.
    { quantity: 2, food: { id: "ac47792c", name: "carotte" } },
    // Une ligne libre, sans aliment structuré.
    { quantity: 1, note: "un filet d'huile, au jugé" },
    { quantity: 1, note: "sel" },
  ],
};

describe("summarise", () => {
  const resume = summarise(RECETTE, "home");

  it("relève le nom de chaque aliment dans la recette elle-même", () => {
    // C'est tout l'objet du correctif : les noms venaient d'une seconde requête,
    // la pagination du catalogue, dont l'échec d'une page suffisait à laisser des
    // ingrédients anonymes — qu'on ne pouvait ni relier, ni acheter.
    expect(resume.foodNames).toEqual({
      f91106b2: "escalope de dinde",
      "25e17ea3": "quinoa",
      ac47792c: "carotte",
    });
  });

  it("ne retient qu'une fois un aliment cité deux fois", () => {
    expect(resume.foodIds).toEqual(["f91106b2", "25e17ea3", "ac47792c"]);
  });

  it("compte les lignes en texte libre, qu'on ne saura pas vérifier", () => {
    expect(resume.freeText).toBe(2);
  });

  it("fabrique un lien ouvrable et une image", () => {
    expect(resume.url).toContain("/g/home/r/emince-de-dinde-aux-legumes-sautes-et-quinoa");
    expect(resume.image).toContain(RECETTE.id);
  });

  it("survit à une recette sans ingrédients", () => {
    const vide = summarise({ id: "x", slug: "x", name: "X" }, "home");
    expect(vide.foodIds).toEqual([]);
    expect(vide.freeText).toBe(0);
    expect(vide.foodNames).toEqual({});
  });

  it("ignore un aliment sans nom plutôt que d'enregistrer du vide", () => {
    const bancal = summarise(
      { id: "x", slug: "x", name: "X", recipeIngredient: [{ food: { id: "abc", name: "  " } }] },
      "home",
    );
    expect(bancal.foodIds).toEqual(["abc"]);
    expect(bancal.foodNames).toEqual({});
  });
});
