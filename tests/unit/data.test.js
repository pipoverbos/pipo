// Integridad de los datos: protege contra erratas al añadir o editar verbos y niveles.
import { describe, expect, it } from "vitest";
import { BASE } from "../../js/data/base-verbs.js";
import { COLN, DIFFD, DIFFS, LV, MIN, TIPS } from "../../js/data/config.js";

describe("verbos base", () => {
  it("son 30", () => expect(BASE).toHaveLength(30));
  it("cada verbo tiene 6 campos con texto: 3 formas, significado, truco y pista", () => {
    for (const verb of BASE) {
      expect(verb, verb[0]).toHaveLength(6);
      for (const field of verb) expect(field.trim(), verb[0]).not.toBe("");
    }
  });
  it("los infinitivos no se repiten", () => {
    const inf = BASE.map((v) => v[0]);
    expect(new Set(inf).size).toBe(inf.length);
  });
  it("los infinitivos van en minúscula y sin espacios", () => {
    for (const [inf] of BASE) expect(inf).toMatch(/^[a-z]+$/);
  });
  it("las formas dobles se separan con /", () => {
    for (const v of BASE) for (const form of [v[1], v[2]]) expect(form).toMatch(/^[a-z]+( ?\/ ?[a-z]+)?$/);
  });
  it("hay verbos de sobra para jugar", () => expect(BASE.length).toBeGreaterThanOrEqual(MIN));
});

describe("configuración", () => {
  it("las tres dificultades tienen nombre y descripción", () => {
    expect(Object.keys(DIFFS)).toEqual(["easy", "normal", "hard"]);
    expect(Object.keys(DIFFD)).toEqual(Object.keys(DIFFS));
  });
  it("hay 4 columnas y 5 niveles", () => {
    expect(COLN).toHaveLength(4);
    expect(LV).toHaveLength(5);
  });
  it("cada nivel define huecos y trampas para cada dificultad", () => {
    for (const level of LV) {
      for (const d of Object.keys(DIFFS)) {
        expect(level.gaps[d], `${level.n}/${d}`).toBeGreaterThan(0);
        expect(level.tr[d], `${level.n}/${d}`).toBeGreaterThanOrEqual(0);
      }
    }
  });
  it("nunca hay más huecos por fila que columnas jugables", () => {
    for (const level of LV) for (const d of Object.keys(DIFFS)) expect(level.gaps[d]).toBeLessThanOrEqual(level.cols.length);
  });
  it("los textos de introducción de cada nivel no están vacíos", () => {
    for (const level of LV) expect(level.intro(2).length).toBeGreaterThan(10);
  });
  it("hay consejos para la pantalla de carga", () => expect(TIPS.length).toBeGreaterThan(0));
});
