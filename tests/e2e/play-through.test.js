import { beforeAll, describe, expect, it } from "vitest";
import { BASE } from "../../js/data/base-verbs.js";
import { $, $$, act, boot, modalTitle, solve, stored } from "../helpers/app.js";

describe("partida completa sin errores", () => {
  beforeAll(() => boot());

  it("el inicio permite jugar con todos los verbos", () => {
    expect($(".home")).not.toBeNull();
    expect($('[data-act="play"]').disabled).toBe(false);
    expect($(".opt small").textContent).toContain(`${BASE.length} elegidos`);
  });

  it("el mapa solo tiene abierto el nivel 1", () => {
    act("play");
    const levels = $$(".lvl");
    expect(levels).toHaveLength(5);
    expect(levels[0].classList.contains("lock")).toBe(false);
    for (const locked of levels.slice(1)) expect(locked.classList.contains("lock")).toBe(true);
  });

  it("el nivel 1 se supera con 3 estrellas", () => {
    act("level", '[data-i="0"]');
    expect($(".gtitle").textContent).toBe("Nivel 1 · Calentamiento");
    solve();
    expect(modalTitle()).toBe("¡Nivel superado!");
    expect(stored("stars.normal")).toEqual([3, 0, 0, 0, 0]);
  });

  it("los niveles 2, 3 y 4 (con fichas y trampas) se superan seguidos", () => {
    for (const n of [2, 3, 4]) {
      act("next");
      expect($(".gtitle").textContent).toContain(`Nivel ${n}`);
      solve();
      expect(modalTitle()).toBe("¡Nivel superado!");
    }
    expect(stored("stars.normal")).toEqual([3, 3, 3, 3, 0]);
  });

  it("el nivel 5 se juega escribiendo y termina el juego", () => {
    act("next");
    expect($(".gtitle").textContent).toContain("Nivel 5");
    expect($(".tray")).toBeNull(); // sin fichas
    solve();
    expect(modalTitle()).toBe("¡Has terminado el juego!");
    expect(stored("stars.normal")).toEqual([3, 3, 3, 3, 3]);
    expect($('[data-act="next"]')).toBeNull(); // no hay nivel 6
  });

  it("al volver al mapa están todos los niveles abiertos", () => {
    act("map");
    expect($$(".lvl.lock")).toHaveLength(0);
  });
});
