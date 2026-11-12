import { beforeAll, describe, expect, it } from "vitest";
import { $, $$, act, boot, stored, type } from "../helpers/app.js";

const fill = (inf, past, pp, mean) => {
  type("#a-inf", inf);
  type("#a-past", past);
  type("#a-pp", pp);
  type("#a-mean", mean);
  act("addverb");
};

describe("mis verbos", () => {
  beforeAll(async () => {
    await boot();
    act("verbs");
  });

  it("muestra los 30 verbos, todos elegidos", () => {
    expect($$(".vrow")).toHaveLength(30);
    expect($("#vcount").textContent).toContain("30 verbos elegidos");
  });

  it("el buscador filtra por verbo y por significado", () => {
    type("#vq", "bring");
    expect($$(".vrow")).toHaveLength(1);
    type("#vq", "comprar");
    expect($$(".vrow")[0].textContent).toContain("buy");
    type("#vq", "zzzz");
    expect($("#vlist").textContent).toContain("No hay ningún verbo");
    type("#vq", "");
  });

  it("'Ninguno' deja la lista vacía y avisa de que hacen falta 10", () => {
    act("pre", '[data-p="none"]');
    expect($("#vcount").textContent).toContain("necesitas al menos 10");
    act("pre", '[data-p="all"]');
    expect($("#vcount").textContent).toContain("30 verbos elegidos");
  });

  it("rechaza un verbo con campos vacíos", () => {
    fill("swim", "", "", "");
    expect($("#amsg").textContent).toContain("Rellena");
  });

  it("rechaza un verbo que no está escrito en inglés con letras", () => {
    fill("sw1m", "swam", "swum", "nadar");
    expect($("#amsg").textContent).toContain("solo con letras");
  });

  it("añade un verbo propio, lo elige y lo guarda", () => {
    fill("Swim", "swam", "swum", "nadar");
    expect($("#amsg").textContent).toContain("swim añadido");
    expect($("#vcount").textContent).toContain("31 verbos elegidos");
    expect(stored("custom").map((v) => v[0])).toEqual(["swim"]);
    expect($(".tag").textContent).toBe("tuyo");
  });

  it("no permite repetir un verbo", () => {
    fill("swim", "swam", "swum", "nadar");
    expect($("#amsg").textContent).toContain("ya está en tu lista");
  });

  it("borrar un verbo propio pide confirmación", () => {
    act("del", '[data-inf="swim"]');
    expect($('[data-act="del"]').textContent).toContain("¿Seguro?");
    expect(stored("custom")).toHaveLength(1);
    act("del", '[data-inf="swim"]');
    expect(stored("custom")).toHaveLength(0);
    expect($("#vcount").textContent).toContain("30 verbos elegidos");
  });
});
