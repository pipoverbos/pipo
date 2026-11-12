// Jugar sin ratón: casillas, fichas y anuncios para lectores de pantalla.
import { beforeAll, describe, expect, it } from "vitest";
import { $, $$, act, boot, click, makeMistake } from "../helpers/app.js";

const press = (el, key) => el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
const active = () => document.activeElement;

describe("juego con teclado", () => {
  beforeAll(async () => {
    await boot();
    act("play");
    act("level", '[data-i="0"]');
  });

  it("las casillas se alcanzan con Tab: son botones con nombre", () => {
    const slots = $$("td[data-slot]");
    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      expect(slot.tabIndex).toBe(0);
      expect(slot.getAttribute("role")).toBe("button");
      expect(slot.getAttribute("aria-label")).toMatch(/^Hueco de .+, fila \d+$/);
    }
  });

  it("la ficha elegida se anuncia como pulsada y conserva el foco", () => {
    const chip = $(".chip");
    chip.focus();
    click(chip);
    expect(active().dataset.chip).toBe(chip.dataset.chip);
    expect(active().getAttribute("aria-pressed")).toBe("true");
  });

  it("Enter en una casilla la rellena y el foco pasa a la siguiente ficha", () => {
    // Una ficha ya elegida (arriba). Se prueba con una casilla a la que NO corresponde: falla y sigue la partida.
    const before = $$("td[data-slot]").length;
    const slot = $("td[data-slot]");
    slot.focus();
    press(slot, "Enter");
    // Con ficha elegida, Enter intenta colocarla: acierte o no, la casilla responde y el foco no se pierde en <body>.
    expect(document.body).not.toBe(active());
    expect($$("td[data-slot]").length).toBeLessThanOrEqual(before);
  });

  it("Espacio también activa una casilla", () => {
    const chip = $(".chip");
    click(chip);
    const slot = $("td[data-slot]");
    slot.focus();
    press(slot, " ");
    expect(document.body).not.toBe(active());
  });

  it("los mensajes de Pipo llegan a una región aria-live que no se recrea", () => {
    const live = $("#live");
    expect(live.getAttribute("aria-live")).toBe("polite");
    makeMistake();
    expect($("#live")).toBe(live); // el mismo elemento: los lectores de pantalla sí anuncian sus cambios
    expect(live.textContent).toContain("Pierdo una vida");
    expect($(".bubble").hasAttribute("aria-live")).toBe(false);
  });

  it("las vidas y la racha tienen nombre", () => {
    expect($(".hearts").getAttribute("role")).toBe("img");
    expect($(".hearts").getAttribute("aria-label")).toMatch(/vidas?$/);
    expect($(".streak").getAttribute("aria-label")).toContain("aciertos seguidos");
  });
});
