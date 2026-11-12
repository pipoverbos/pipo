// Auditoría automática de accesibilidad con axe-core sobre todas las pantallas del juego.
// El contraste de color no se puede medir en jsdom (no hay layout): lo cubre tests/unit/contrast.test.js.
import { beforeAll, describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import { $, act, boot, solve } from "../helpers/app.js";

// axe prueba un <canvas> para detectar ligaduras de iconos; jsdom no lo implementa y avisa por consola.
HTMLCanvasElement.prototype.getContext = () => null;

async function audit() {
  const result = await axe.run(document, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] },
    rules: { "color-contrast": { enabled: false } },
  });
  return result.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
}

describe("accesibilidad (axe-core)", () => {
  beforeAll(async () => {
    await boot();
    vi.useRealTimers(); // axe usa setTimeout por dentro: con temporizadores falsos nunca termina
  });

  it("inicio", async () => expect(await audit()).toEqual([]));

  it("mis verbos", async () => {
    act("verbs");
    expect(await audit()).toEqual([]);
  });

  it("mapa de niveles", async () => {
    act("home");
    act("play");
    expect(await audit()).toEqual([]);
  });

  it("juego con fichas", async () => {
    act("level", '[data-i="0"]');
    expect(await audit()).toEqual([]);
  });

  it("ventana de nivel superado", async () => {
    solve();
    expect($("#modal .modal")).not.toBeNull();
    expect(await audit()).toEqual([]);
  });

  it("juego escribiendo (nivel 5)", async () => {
    for (let n = 2; n <= 4; n++) {
      act("next");
      solve();
    }
    act("next");
    expect($(".tray")).toBeNull();
    expect(await audit()).toEqual([]);
  });

  it("ventana de fin del juego", async () => {
    solve();
    expect(await audit()).toEqual([]);
  });
});

describe("accesibilidad: primera visita", () => {
  // Cada archivo de test arranca el juego una sola vez, así que la presentación va en su propio describe
  // dentro del mismo arranque: se comprueba antes de terminar de ver la carga.
  it("presentación de Pipo (3 pasos)", async () => {
    act("map"); // cierra la ventana final
    act("home");
    act("meetpipo");
    for (let step = 0; step < 3; step++) {
      expect(await audit(), `paso ${step + 1}`).toEqual([]);
      if (step < 2) act("meetnext");
    }
  });
});
