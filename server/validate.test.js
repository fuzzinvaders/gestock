import { describe, expect, it } from "vitest";
import {
  isCalendarDate,
  validateDate,
  validateEan,
  validateImageUrl,
  validateQuantity,
  validateSections,
  validateShelfLife,
  validateUnit,
} from "./validate.js";

describe("validateEan", () => {
  it("accepte les longueurs du commerce", () => {
    expect(validateEan("3017620422003").value).toBe("3017620422003");
    expect(validateEan("20114725").value).toBe("20114725");
    expect(validateEan("012345678905").value).toBe("012345678905");
  });

  it("laisse passer l'absence de code", () => {
    expect(validateEan("").value).toBe(null);
    expect(validateEan(null).value).toBe(null);
  });

  it("refuse ce qui n'est pas un code-barres", () => {
    expect(validateEan("12345").ok).toBe(false);
    expect(validateEan("30176204 22003").ok).toBe(false);
    expect(validateEan("abcdefgh").ok).toBe(false);
  });
});

describe("validateQuantity", () => {
  it("arrondit au millième", () => {
    expect(validateQuantity(0.3333333).value).toBe(0.333);
  });

  it("refuse le négatif et le non-nombre", () => {
    expect(validateQuantity(-1).ok).toBe(false);
    expect(validateQuantity("beaucoup").ok).toBe(false);
    expect(validateQuantity(Infinity).ok).toBe(false);
  });
});

describe("isCalendarDate", () => {
  it("distingue une vraie date d'une date plausible", () => {
    expect(isCalendarDate("2026-02-28")).toBe(true);
    expect(isCalendarDate("2026-02-29")).toBe(false);
    expect(isCalendarDate("2024-02-29")).toBe(true);
  });
});

describe("validateDate", () => {
  it("refuse une année à côté de la plaque", () => {
    // La faute de frappe classique : 2206 au lieu de 2026.
    expect(validateDate("2206-05-01", { label: "La date" }).ok).toBe(false);
    expect(validateDate("1998-05-01", { label: "La date" }).ok).toBe(false);
  });

  it("rend null pour un champ facultatif laissé vide", () => {
    expect(validateDate("", { label: "La date", required: false }).value).toBe(null);
    expect(validateDate("", { label: "La date" }).ok).toBe(false);
  });
});

describe("validateSections", () => {
  it("garde l'identité des sections déjà connues", () => {
    const existing = [{ id: "s1", name: "Tiroir 1" }];
    const result = validateSections([{ id: "s1", name: "Tiroir du haut" }, { name: "Tiroir 2" }], existing);
    expect(result.ok).toBe(true);
    expect(result.value[0]).toEqual({ id: "s1", name: "Tiroir du haut" });
    // La nouvelle section n'a pas encore d'identité : c'est l'appelant qui la crée.
    expect(result.value[1]).toEqual({ id: null, name: "Tiroir 2" });
  });

  it("refuse deux sections du même nom", () => {
    expect(validateSections([{ name: "Étage 1" }, { name: "étage 1" }]).ok).toBe(false);
  });

  it("oublie l'identité d'une section inconnue", () => {
    // Un id inventé par le client ne doit pas devenir celui d'une section : sinon
    // deux réserves pourraient partager la même, et les lots suivraient.
    const result = validateSections([{ id: "venu-d-ailleurs", name: "Bac" }], []);
    expect(result.value[0].id).toBe(null);
  });
});

describe("validateShelfLife", () => {
  it("accepte un nombre de jours, refuse zéro et les décimales", () => {
    expect(validateShelfLife(180).value).toBe(180);
    expect(validateShelfLife("").value).toBe(null);
    expect(validateShelfLife(0).ok).toBe(false);
    expect(validateShelfLife(1.5).ok).toBe(false);
  });
});

describe("validateUnit", () => {
  it("retombe sur la pièce quand rien n'est dit", () => {
    expect(validateUnit(undefined).value).toBe("pièce");
    expect(validateUnit("kg").value).toBe("kg");
    expect(validateUnit("brouettes").ok).toBe(false);
  });
});

describe("validateImageUrl", () => {
  it("n'accepte que du https", () => {
    expect(validateImageUrl("https://images.openfoodfacts.org/x.jpg").ok).toBe(true);
    expect(validateImageUrl("http://exemple.fr/x.jpg").ok).toBe(false);
    expect(validateImageUrl("javascript:alert(1)").ok).toBe(false);
    expect(validateImageUrl("").value).toBe(null);
  });
});
