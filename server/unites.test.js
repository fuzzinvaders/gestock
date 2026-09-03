import { describe, expect, it } from "vitest";
import { analyser, comparer, formater } from "./unites.js";

describe("analyser", () => {
  it("reconnaît les unités de Mealie comme celles de Gestock", () => {
    expect(analyser("grammes")).toEqual({ famille: "masse", facteur: 1 });
    expect(analyser("g")).toEqual({ famille: "masse", facteur: 1 });
    expect(analyser("kg")).toEqual({ famille: "masse", facteur: 1000 });
    expect(analyser("cl")).toEqual({ famille: "volume", facteur: 10 });
    expect(analyser("pièces")).toEqual({ famille: "compte", facteur: 1 });
  });

  it("compte une quantité sans unité comme un dénombrement", () => {
    // « 1 carotte » n'écrit pas son unité, et c'est bien une carotte.
    expect(analyser("")).toEqual({ famille: "compte", facteur: 1 });
    expect(analyser(null)).toEqual({ famille: "compte", facteur: 1 });
  });

  it("refuse ce qui ne se convertit pas sans connaître le produit", () => {
    expect(analyser("cuillère à soupe")).toBe(null);
    expect(analyser("pincée")).toBe(null);
    expect(analyser("sachet")).toBe(null);
  });
});

describe("comparer", () => {
  it("traduit d'une unité à l'autre dans la même famille", () => {
    const r = comparer({ quantity: 500, unit: "grammes" }, { quantity: 1, unit: "kg" });
    expect(r.comparable).toBe(true);
    expect(r.assez).toBe(true);
  });

  it("dit ce qui manque, dans l'unité de la recette", () => {
    const r = comparer({ quantity: 500, unit: "grammes" }, { quantity: 0.2, unit: "kg" });
    expect(r.assez).toBe(false);
    expect(r.manque).toBe(300);
  });

  it("ne compare pas deux familles différentes", () => {
    expect(comparer({ quantity: 200, unit: "g" }, { quantity: 2, unit: "pièce" }).comparable).toBe(
      false,
    );
  });

  it("se tait devant une unité qu'il ne sait pas traduire", () => {
    // Deux cuillères à soupe d'huile ne se comparent pas à un litre sans savoir
    // de quelle huile il s'agit : mieux vaut ne rien dire que dire faux.
    expect(comparer({ quantity: 2, unit: "cuillère à soupe" }, { quantity: 1, unit: "L" }))
      .toEqual({ comparable: false });
  });

  it("compare les dénombrements, unité écrite ou non", () => {
    const r = comparer({ quantity: 1, unit: "" }, { quantity: 2, unit: "pièce" });
    expect(r.comparable).toBe(true);
    expect(r.assez).toBe(true);
  });

  it("refuse une quantité qui n'est pas un nombre", () => {
    expect(comparer({ quantity: null, unit: "g" }, { quantity: 200, unit: "g" }).comparable).toBe(
      false,
    );
  });
});

describe("formater", () => {
  it("écrit la quantité comme on la lirait", () => {
    expect(formater(500, "g")).toBe("500 g");
    expect(formater(1.5, "kg")).toBe("1,5 kg");
    expect(formater(2, "")).toBe("2");
  });
});
