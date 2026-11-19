import { beforeEach, describe, expect, it, vi } from "vitest";
import { BASE } from "../../js/data/base-verbs.js";
import { LISTS } from "../../js/data/config.js";

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

describe("maskTrick (el truco no regala las casillas que faltan)", () => {
  const byInf = (inf) => BASE.find((r) => r[0] === inf);

  it("tapa las formas que aún no se ven en la fila", () => {
    // solo se ve el infinitivo
    expect(v.maskTrick(byInf("break"), [0])).toBe("Break, ___, ___. El participio acaba en -en.");
  });
  it("deja visible lo que ya está colocado", () => {
    expect(v.maskTrick(byInf("break"), [0, 1])).toBe("Break, broke, ___. El participio acaba en -en.");
  });
  it("sin nada visible tapa también el infinitivo", () => {
    expect(v.maskTrick(byInf("break"), [])).toBe("___, ___, ___. El participio acaba en -en.");
  });
  it("con la fila completa devuelve el truco tal cual", () => {
    for (const r of BASE) expect(v.maskTrick(r, [0, 1, 2])).toBe(r[4]);
  });
  it("tapa las dos formas de was / were", () => {
    expect(v.maskTrick(byInf("be"), [0])).toBe("___ va con I, he, she, it. ___ va con you, we, they.");
  });
  it("no tapa una forma que ya está a la vista en otra columna (cut, cut, cut)", () => {
    expect(v.maskTrick(byInf("cut"), [0])).toBe(byInf("cut")[4]);
  });
  it("no toca fragmentos como -ought ni palabras que solo contienen la forma", () => {
    expect(v.maskTrick(byInf("buy"), [0])).toBe("Buy hace ___, y bring hace brought. Las dos llevan -ought.");
  });
  it("con solo el infinitivo a la vista ningún truco contiene las otras formas", () => {
    for (const r of BASE) {
      const visto = new Set(r[0].split("/").map((s) => s.trim().toLowerCase()));
      const texto = v.maskTrick(r, [0]).toLowerCase();
      for (const forma of [r[1], r[2]].flatMap((s) => s.split("/").map((x) => x.trim().toLowerCase()))) {
        if (visto.has(forma)) continue;
        expect(
          texto.match(new RegExp("(?<![\\p{L}-])" + forma + "(?![\\p{L}])", "u")),
          `${r[0]}: «${forma}»`
        ).toBeNull();
      }
    }
  });
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

describe("contador de estrellas total", () => {
  it("empieza en cero", () => {
    expect(v.mapStars()).toBe(0);
    expect(v.totalStars()).toBe(0);
  });
  it("sin contador guardado vale lo que hay en el mapa de las tres dificultades (quien jugaba antes del contador)", () => {
    store.set("stars.easy", [3, 2, 0, 0, 0]);
    store.set("stars.hard", [1, 0, 0, 0, 0]);
    expect(v.mapStars()).toBe(6);
    expect(v.totalStars()).toBe(6);
  });
  it("con contador guardado, manda el contador aunque el mapa tenga menos", () => {
    store.set("stars.easy", [1, 0, 0, 0, 0]);
    store.set("total", 40);
    expect(v.totalStars()).toBe(40);
  });
  it("addTotal suma (partiendo del mapa si aún no había contador), ignora lo que no suma y se queda en 999999", () => {
    store.set("stars.easy", [3, 0, 0, 0, 0]);
    v.addTotal(2);
    expect(store.get("total", null)).toBe(5);
    v.addTotal(0);
    v.addTotal(-3);
    expect(v.totalStars()).toBe(5);
    store.set("total", 999998);
    v.addTotal(10);
    expect(v.totalStars()).toBe(999999);
  });
  it("resetMap vacía el mapa de las tres dificultades y conserva el total (incluso el que aún no estaba guardado)", () => {
    store.set("stars.easy", [3, 2, 0, 0, 0]);
    store.set("stars.normal", [1, 0, 0, 0, 0]);
    v.resetMap();
    expect(v.mapStars()).toBe(0);
    expect(v.getStars("easy")).toEqual([0, 0, 0, 0, 0]);
    expect(v.totalStars()).toBe(6);
    expect(store.get("total", null)).toBe(6);
  });
  it("lo guardado como contador se limpia: solo enteros de 0 a 999999", () => {
    for (const malo of [-1, 1.5, "7", 1000000, null, [1]]) {
      localStorage.setItem("pipo2.total", JSON.stringify(malo));
      store.remove("total");
      localStorage.setItem("pipo2.total", JSON.stringify(malo));
      expect(store.get("total", null)).toBeNull();
    }
  });
});

describe("ajustes de la clase del profesor", () => {
  const aula = (lists, diffs) =>
    store.set("cls", { code: "ABC234", name: "1º A", alias: "Pipa", kind: "aula", owner: false, lists, diffs });
  const lista = (n) => v.listInfs(LISTS[n - 1]);

  it("sin clase, o en un reto, todo está permitido", () => {
    expect(v.ajustesDeClase()).toEqual({
      lists: [1, 2, 3, 4, 5, 6],
      diffs: ["easy", "normal", "hard"],
      limitada: false,
    });
    store.set("cls", {
      code: "ABC234",
      name: "R",
      alias: "Pipa",
      kind: "reto",
      owner: true,
      lists: [1],
      diffs: ["easy"],
    });
    expect(v.ajustesDeClase().limitada).toBe(false);
    expect(v.verbosPermitidos()).toBeNull();
    expect(v.selSet().size).toBe(BASE.length);
  });
  it("una clase de aula con todo permitido no limita nada", () => {
    aula([1, 2, 3, 4, 5, 6], ["easy", "normal", "hard"]);
    expect(v.ajustesDeClase().limitada).toBe(false);
    expect(v.verbosPermitidos()).toBeNull();
  });
  it("una clase de aula limita las listas y las dificultades", () => {
    aula([1, 3], ["easy"]);
    expect(v.ajustesDeClase()).toEqual({ lists: [1, 3], diffs: ["easy"], limitada: true });
    expect([...v.verbosPermitidos()].sort()).toEqual([...lista(1), ...lista(3)].sort());
  });
  it("solo se pueden elegir verbos de las listas permitidas, aunque hubiera otros guardados", () => {
    store.set("sel", [...lista(1), ...lista(2)]);
    aula([2], ["normal"]);
    expect([...v.selSet()].sort()).toEqual([...lista(2)].sort());
    expect(v.selV().every((x) => lista(2).includes(x[0]))).toBe(true);
  });
  it("sin selección guardada se eligen todos los verbos permitidos (y solo ellos)", () => {
    aula([5], ["normal"]);
    expect([...v.selSet()].sort()).toEqual([...lista(5)].sort());
  });
  it("al guardar la selección se conservan los verbos que la clase no permite, para recuperarlos al salir", () => {
    store.set("sel", [...lista(1), ...lista(6)]);
    aula([1], ["normal"]);
    v.saveSel(new Set(lista(1).slice(0, 3)));
    expect([...v.selSet()].sort()).toEqual(lista(1).slice(0, 3).sort());
    store.remove("cls");
    expect([...v.selSet()].sort()).toEqual([...lista(1).slice(0, 3), ...lista(6)].sort());
  });
  it("sin selección guardada, al guardar dentro de la clase no se pierden los demás verbos al salir", () => {
    aula([1], ["normal"]);
    v.saveSel(new Set(lista(1).slice(0, 2)));
    store.remove("cls");
    expect(v.selSet().size).toBe(BASE.length - lista(1).length + 2);
  });
  it("la dificultad con la que se juega es la elegida si la clase la admite, y si no, la permitida más cercana", () => {
    store.set("diff", "hard");
    aula([1, 2, 3, 4, 5, 6], ["easy", "normal"]);
    expect(v.diffActual()).toBe("normal");
    aula([1, 2, 3, 4, 5, 6], ["hard"]);
    expect(v.diffActual()).toBe("hard");
    aula([1, 2, 3, 4, 5, 6], ["easy", "hard"]);
    expect(v.diffActual()).toBe("hard");
    store.set("diff", "normal");
    expect(v.diffActual()).toBe("easy");
    store.remove("cls");
    expect(v.diffActual()).toBe("normal");
  });
  it("coercionar la dificultad no modifica lo guardado", () => {
    store.set("diff", "hard");
    aula([1, 2, 3, 4, 5, 6], ["easy"]);
    v.diffActual();
    expect(store.get("diff", null)).toBe("hard");
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

describe("verbos elegidos y listas", () => {
  it("por defecto se eligen todos los verbos", () => {
    expect(v.selV()).toHaveLength(BASE.length);
  });
  it("saveSel guarda la selección", () => {
    v.saveSel(new Set(["go", "be"]));
    expect(v.selV().map((x) => x[0])).toEqual(["be", "go"]);
  });
  it("ignora verbos guardados que ya no existen (p. ej. los propios de versiones antiguas)", () => {
    store.set("sel", ["be", "swimmer", "go"]);
    expect(v.selV().map((x) => x[0])).toEqual(["be", "go"]);
  });
  it("listInfs devuelve los infinitivos de la lista, de `from` a `to`", () => {
    expect(v.listInfs({ from: "be", to: "eat" })).toHaveLength(15);
    expect(v.listInfs({ from: "go", to: "go" })).toEqual(["go"]);
  });
});
