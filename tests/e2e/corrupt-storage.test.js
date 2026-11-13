import { beforeAll, describe, expect, it } from "vitest";
import { $, act, boot, solve } from "../helpers/app.js";

// Datos guardados rotos o de otra época: el juego tiene que arrancar y poder jugarse igualmente.
describe("arranque con datos guardados corruptos", () => {
  beforeAll(async () => {
    await boot({
      storage: {
        diff: "imposible",
        sound: "quizá",
        sel: "no-es-una-lista",
        miss: [1, 2, 3],
        "stars.normal": "tres",
        "stars.easy": { a: 1 },
      },
    });
  });

  it("llega al inicio sin errores", () => {
    expect($(".home")).not.toBeNull();
  });

  it("usa los valores por defecto: dificultad normal y todos los verbos", () => {
    expect($('[data-d="normal"]').getAttribute("aria-pressed")).toBe("true");
    act("verbs");
    expect(document.querySelectorAll('[role="checkbox"][aria-checked="true"]').length).toBeGreaterThan(70);
    act("home");
  });

  it("se puede jugar y superar un nivel", () => {
    act("play");
    act("level", '[data-i="0"]');
    solve();
    expect($("#modal h2").textContent).toBe("¡Nivel superado!");
  });
});
