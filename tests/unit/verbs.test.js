import { beforeEach, describe, expect, it, vi } from "vitest";

// store.js guarda una copia en memoria, así que cada test importa módulos nuevos para empezar de cero.
let v, store;
beforeEach(async () => {
  localStorage.clear();
  vi.resetModules();
  v = await import("../../js/verbs.js");
  ({ store } = await import("../../js/store.js"));
});

describe("lev (distancia de edición)", () => {
  it("es 0 para palabras iguales", () => expect(v.lev("went", "went")).toBe(0));
  it("cuenta sustituciones", () => expect(v.lev("cat", "cut")).toBe(1));
  it("cuenta inserciones y borrados", () => {
    expect(v.lev("", "abc")).toBe(3);
    expect(v.lev("go", "gone")).toBe(2);
  });
});

describe("reg (forma regular falsa para las fichas trampa)", () => {
  it("añade -ed", () => expect(v.reg("break")).toBe("breaked"));
  it("solo añade -d si acaba en e", () => expect(v.reg("like")).toBe("liked"));
  it("cambia consonante + y por -ied", () => expect(v.reg("study")).toBe("studied"));
  it("vocal + y no cambia", () => expect(v.reg("play")).toBe("played"));
  it("usa solo la primera forma si hay dos", () => expect(v.reg("was / were")).toBe("wased"));
});

describe("norm y same (comparar respuestas)", () => {
  it("ignora mayúsculas y espacios de más", () => expect(v.norm("  Was  /  Were ")).toBe("was/were"));
  it("unifica el apóstrofo tipográfico", () => expect(v.norm("it’s")).toBe("it's"));
  it("acepta cualquier orden en las formas dobles", () => expect(v.same("were / was", "was/were")).toBe(true));
  it("acepta mayúsculas", () => expect(v.same("Went", "went")).toBe(true));
  it("rechaza formas distintas", () => expect(v.same("go", "went")).toBe(false));
  it("rechaza si solo coincide una de las dos formas", () => expect(v.same("was", "was / were")).toBe(false));
});

describe("score (dificultad de un verbo)", () => {
  it("un verbo que no cambia puntúa 0", () => expect(v.score(["cut", "cut", "cut"])).toBe(0));
  it("suma la distancia al pasado y al participio", () =>
    expect(v.score(["begin", "began", "begun"])).toBe(v.lev("begin", "began") + v.lev("begin", "begun")));
  it("penaliza las formas dobles", () => {
    const sinDoble = v.score(["be", "was", "been"]);
    expect(v.score(["be", "was / were", "been"])).toBe(sinDoble + 3);
  });
});

describe("estrellas y niveles", () => {
  it("empieza sin estrellas", () => expect(v.getStars("normal")).toEqual([0, 0, 0, 0, 0]));
  it("el nivel 1 siempre está abierto", () => expect(v.unlocked(0, "normal")).toBe(true));
  it("un nivel se abre al conseguir una estrella en el anterior", () => {
    expect(v.unlocked(1, "normal")).toBe(false);
    store.set("stars.normal", [1, 0, 0, 0, 0]);
    expect(v.unlocked(1, "normal")).toBe(true);
    expect(v.unlocked(2, "normal")).toBe(false);
  });
  it("las estrellas de cada dificultad son independientes", () => {
    store.set("stars.hard", [3, 3, 0, 0, 0]);
    expect(v.unlocked(2, "hard")).toBe(true);
    expect(v.unlocked(2, "easy")).toBe(false);
  });
});

describe("errores guardados", () => {
  it("cuenta los fallos por verbo", () => {
    v.addMiss("go");
    v.addMiss("go");
    v.addMiss("buy");
    expect(v.missMap()).toEqual({ go: 2, buy: 1 });
  });
});

describe("verbos elegidos y propios", () => {
  it("por defecto se eligen los 30 verbos base", () => {
    expect(v.selV()).toHaveLength(30);
    expect(v.custom()).toEqual([]);
  });
  it("un verbo propio aparece en la lista pero no queda elegido solo", () => {
    store.set("custom", [["swim", "swam", "swum", "nadar", "truco", "pista"]]);
    expect(v.allV()).toHaveLength(31);
    expect(v.selV()).toHaveLength(30);
  });
  it("saveSel guarda la selección", () => {
    v.saveSel(new Set(["go", "be"]));
    expect(v.selV().map((x) => x[0])).toEqual(["be", "go"]);
  });
});
