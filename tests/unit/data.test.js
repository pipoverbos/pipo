// Integridad de los datos: protege contra erratas al añadir o editar verbos y niveles.
import { describe, expect, it } from "vitest";
import { BASE } from "../../js/data/base-verbs.js";
import { COLN, DIFFD, DIFFS, LISTS, LV, MIN, TIPS } from "../../js/data/config.js";
import { listInfs } from "../../js/verbs.js";

describe("verbos", () => {
  it("son 80: los 30 del cuaderno (be–leave) y 50 más", () => {
    expect(BASE).toHaveLength(80);
    expect(BASE[0][0]).toBe("be");
    expect(BASE[29][0]).toBe("leave");
    expect(BASE[30][0]).toBe("bite");
    expect(BASE[79][0]).toBe("write");
  });
  it("ningún valor se repite dentro de una columna, para que cada fila se reconozca por cualquier celda", () => {
    for (const col of [0, 1, 2, 3]) {
      const values = BASE.map((v) => v[col]);
      expect(new Set(values).size, `columna ${col}`).toBe(values.length);
    }
  });
  it("los 50 verbos nuevos están en orden alfabético", () => {
    const added = BASE.slice(30).map((v) => v[0]);
    expect(added).toEqual([...added].sort());
  });
  it("las pistas no repiten el truco palabra por palabra", () => {
    for (const v of BASE) expect(v[5], v[0]).not.toBe(v[4]);
  });
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

describe("listas de verbos", () => {
  const listVerbs = LISTS.map((l) => listInfs(l));
  it("las listas 1 y 2 son las del cuaderno original (15 y 15)", () => {
    expect(listVerbs[0]).toHaveLength(15);
    expect(listVerbs[1]).toHaveLength(15);
    expect(listVerbs[0].at(-1)).toBe("eat");
    expect(listVerbs[1][0]).toBe("fall");
  });
  it("juntas cubren todos los verbos, sin huecos ni solapes", () => {
    expect(listVerbs.flat()).toEqual(BASE.map((v) => v[0]));
  });
  it("cada lista tiene verbos de sobra para jugar", () => {
    for (const l of listVerbs) expect(l.length).toBeGreaterThanOrEqual(MIN);
  });
  it("los ids no se repiten", () => {
    const ids = LISTS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
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
    for (const level of LV)
      for (const d of Object.keys(DIFFS)) expect(level.gaps[d]).toBeLessThanOrEqual(level.cols.length);
  });
  it("los textos de introducción de cada nivel no están vacíos", () => {
    for (const level of LV) expect(level.intro(2).length).toBeGreaterThan(10);
  });
  it("hay consejos para la pantalla de carga", () => expect(TIPS.length).toBeGreaterThan(0));
});
