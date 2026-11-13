import { beforeEach, describe, expect, it, vi } from "vitest";

// store.js guarda una copia en memoria, así que cada test importa el módulo nuevo para empezar de cero.
let store, mod;
const put = (k, v) => localStorage.setItem("pipo2." + k, JSON.stringify(v));
const raw = (k) => localStorage.getItem("pipo2." + k);

beforeEach(async () => {
  localStorage.clear();
  vi.resetModules();
  mod = await import("../../js/store.js");
  store = mod.store;
});

describe("lectura y escritura", () => {
  it("devuelve el valor por defecto si no hay nada guardado", () => {
    expect(store.get("diff", "normal")).toBe("normal");
  });
  it("guarda con el prefijo pipo2. y lo lee de vuelta", () => {
    store.set("diff", "hard");
    expect(raw("diff")).toBe('"hard"');
    expect(store.get("diff", "normal")).toBe("hard");
  });
  it("remove borra la clave", () => {
    store.set("sound", false);
    store.remove("sound");
    expect(raw("sound")).toBeNull();
    expect(store.get("sound", true)).toBe(true);
  });
  it("si localStorage está bloqueado, funciona con la copia en memoria", () => {
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    store.set("diff", "easy");
    expect(store.get("diff", "normal")).toBe("easy");
    set.mockRestore();
    get.mockRestore();
  });
});

describe("validación al leer: un dato inservible no rompe nada", () => {
  it("JSON roto → valor por defecto, y se borra", () => {
    localStorage.setItem("pipo2.diff", "{no es json");
    expect(store.get("diff", "normal")).toBe("normal");
    expect(raw("diff")).toBeNull();
  });
  it("dificultad desconocida → por defecto, y se borra", () => {
    put("diff", "imposible");
    expect(store.get("diff", "normal")).toBe("normal");
    expect(raw("diff")).toBeNull();
  });
  it("sound y seen deben ser booleanos", () => {
    put("sound", "yes");
    put("seen", 1);
    expect(store.get("sound", true)).toBe(true);
    expect(store.get("seen", false)).toBe(false);
  });
  it("el apodo debe ser válido", () => {
    put("name", "<script>");
    expect(store.get("name", "")).toBe("");
    put("name", "Ana");
    expect(store.get("name", "")).toBe("Ana");
  });
  it("estrellas: array de 5 números de 0 a 3; se corrige lo que se pueda", () => {
    put("stars.normal", [3, 2, 1]);
    expect(store.get("stars.normal", [0, 0, 0, 0, 0])).toEqual([3, 2, 1, 0, 0]);
    put("stars.hard", [99, -4, "x", null, 2.5]);
    expect(store.get("stars.hard", [0, 0, 0, 0, 0])).toEqual([3, 0, 0, 0, 0]);
  });
  it("estrellas: si no es un array, se usa el valor por defecto", () => {
    put("stars.easy", { 0: 3 });
    expect(store.get("stars.easy", [0, 0, 0, 0, 0])).toEqual([0, 0, 0, 0, 0]);
  });
  it("estrellas de una dificultad inventada no se aceptan", () => {
    put("stars.loca", [3, 3, 3, 3, 3]);
    expect(store.get("stars.loca", null)).toBeNull();
  });
  it("sel: se quedan solo los textos", () => {
    put("sel", ["go", 5, null, "be", { a: 1 }]);
    expect(store.get("sel", null)).toEqual(["go", "be"]);
  });
  it("sel: una lista vacía es válida (es «Ninguno»)", () => {
    put("sel", []);
    expect(store.get("sel", null)).toEqual([]);
  });
  it("sel: si no es un array, se usa el valor por defecto", () => {
    put("sel", "go");
    expect(store.get("sel", null)).toBeNull();
  });
  it("miss: se descartan las entradas absurdas", () => {
    put("miss", { go: 2, be: -1, run: "mucho", fly: 1.5, [`x${"a".repeat(40)}`]: 3 });
    expect(store.get("miss", {})).toEqual({ go: 2 });
  });
  it("miss: un array o un número no valen", () => {
    put("miss", [1, 2]);
    expect(store.get("miss", {})).toEqual({});
    put("miss", 7);
    expect(store.get("miss", {})).toEqual({});
  });
  it("una clave sin esquema se devuelve tal cual", () => {
    put("futuro", { a: 1 });
    expect(store.get("futuro", null)).toEqual({ a: 1 });
  });
});

describe("versionado y migraciones", () => {
  it("sin «v» (datos de antes del versionado) se toma como versión 1 y se anota", () => {
    store.set("diff", "hard");
    store.init();
    expect(store.get("v", 0)).toBe(mod.VERSION);
    expect(store.get("diff", "normal")).toBe("hard"); // no se pierde nada
  });
  it("en una instalación nueva también se anota la versión", () => {
    store.init();
    expect(raw("v")).toBe(String(mod.VERSION));
  });
  it("una versión más nueva que la conocida se respeta y no se rebaja", () => {
    put("v", mod.VERSION + 5);
    store.init();
    expect(store.get("v", 0)).toBe(mod.VERSION + 5);
  });
  it("una «v» rota se trata como versión 1", () => {
    put("v", "banana");
    store.init();
    expect(store.get("v", 0)).toBe(mod.VERSION);
  });
  it("hay una migración registrada para cada salto de versión (hoy ninguno)", () => {
    for (let n = 1; n < mod.VERSION; n++) expect(typeof mod.MIGRATIONS[n]).toBe("function");
  });
});
