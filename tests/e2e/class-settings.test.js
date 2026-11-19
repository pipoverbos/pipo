// Lo que el profesor permite (listas de verbos y dificultades) se nota en el juego del alumno.
import { beforeAll, describe, expect, it } from "vitest";
import { $, $$, act, boot, click, SESION } from "../helpers/app.js";
import { BASE } from "../../js/data/base-verbs.js";
import { LISTS } from "../../js/data/config.js";
import { R } from "../../js/state.js";
import { store } from "../../js/store.js";
import { listInfs } from "../../js/verbs.js";

const LISTA_2 = listInfs(LISTS[1]);
const AULA = {
  code: "ABC234",
  name: "1º A de ESO",
  alias: "Pipa",
  kind: "aula",
  owner: false,
  lists: [2],
  diffs: ["easy", "normal"],
};

describe("el alumno en una clase con ajustes", () => {
  // La clase y la dificultad «difícil» ya estaban guardadas: la clase no admite esa dificultad.
  beforeAll(() => boot({ storage: { acc: SESION, cls: AULA, diff: "hard" } }));

  it("en el inicio solo aparecen las dificultades permitidas, y se avisa de por qué", () => {
    const botones = $$('[data-act="diff"]').map((b) => b.dataset.d);
    expect(botones).toEqual(["easy", "normal"]);
    expect($(".home").textContent).toContain("Tu profe ha elegido las listas de verbos y las dificultades");
  });

  it("si la dificultad elegida no está permitida, se juega con la permitida más cercana, sin tocar lo guardado", () => {
    expect($('[data-act="diff"][data-d="normal"]').getAttribute("aria-pressed")).toBe("true");
    expect(store.get("diff", null)).toBe("hard");
  });

  it("los verbos elegidos son solo los de las listas permitidas", () => {
    expect($(".home").textContent).toContain(LISTA_2.length + " elegidos");
  });

  it("«Mis verbos» solo enseña las listas y los verbos permitidos, con un aviso", () => {
    act("verbs");
    expect($("#view").textContent).toContain("Tu profe ha elegido estas listas de verbos para tu clase");
    const pills = $$('[data-act="pre"]').map((b) => b.dataset.p);
    expect(pills).toEqual(["all", "none", "l2"]);
    const verbos = $$('[data-act="tv"]').map((b) => b.dataset.inf);
    expect(verbos.sort()).toEqual([...LISTA_2].sort());
  });

  it("«Todos» elige todos los permitidos y no pregunta nada (el mapa estaba vacío)", () => {
    click($('[data-act="pre"][data-p="none"]'));
    expect($("#vcount").textContent).toContain("0");
    click($('[data-act="pre"][data-p="all"]'));
    expect($("#vcount").textContent).toContain(String(LISTA_2.length));
    expect($("#modal .modal")).toBeNull();
  });

  it("la partida se forma solo con verbos de las listas permitidas", () => {
    act("home");
    act("play");
    act("level", '[data-i="0"]');
    expect(R.rows.length).toBeGreaterThan(0);
    expect(R.rows.every((fila) => LISTA_2.includes(fila[0]))).toBe(true);
    act("map");
    act("home");
  });

  it("si se eligen menos de 10 verbos, no se puede jugar y se dice", () => {
    act("verbs");
    click($('[data-act="pre"][data-p="none"]'));
    for (const inf of LISTA_2.slice(0, 5)) click($(`[data-act="tv"][data-inf="${inf}"]`));
    act("home");
    expect($('[data-act="play"]').disabled).toBe(true);
    expect($(".home").textContent).toContain("Elige al menos 10 verbos");
  });

  it("al salir de la clase se recuperan todas las dificultades y los verbos que había elegido antes", () => {
    store.remove("cls");
    act("verbs");
    act("home");
    expect($$('[data-act="diff"]').map((b) => b.dataset.d)).toEqual(["easy", "normal", "hard"]);
    expect($('[data-act="diff"][data-d="hard"]').getAttribute("aria-pressed")).toBe("true");
    expect($(".home").textContent).not.toContain("Tu profe ha elegido");
    // los 5 de la lista 2 que dejó marcados, más todos los de las otras listas que no se tocaron
    expect($(".home").textContent).toContain(BASE.length - LISTA_2.length + 5 + " elegidos");
  });
});
