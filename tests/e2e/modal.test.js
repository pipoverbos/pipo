// Ventana modal accesible: nombre, foco, inerte y Escape.
import { beforeAll, describe, expect, it } from "vitest";
import { $, act, boot, livesLeft, makeMistake, solve } from "../helpers/app.js";

const press = (el, key) => el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
const active = () => document.activeElement;

describe("ventana modal", () => {
  beforeAll(async () => {
    await boot();
    act("play");
    act("level", '[data-i="0"]');
    while (livesLeft() > 0) makeMistake();
  });

  it("tiene nombre: el título de la ventana", () => {
    const dialog = $('#modal [role="dialog"]');
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const title = document.getElementById(dialog.getAttribute("aria-labelledby"));
    expect(title.textContent).toBe("Pipo se ha quedado sin vidas");
  });

  it("el foco entra en la ventana y el resto de la página queda inerte", () => {
    expect($("#modal").contains(active())).toBe(true);
    expect($("#sheet").hasAttribute("inert")).toBe(true);
  });

  it("Escape sale por la vía segura (mapa) y devuelve el foco al contenido", () => {
    press(active(), "Escape");
    expect($("#modal .modal")).toBeNull();
    expect($("#sheet").hasAttribute("inert")).toBe(false);
    expect(active().tagName).toBe("H1");
    expect(active().textContent).toBe("Elige un nivel");
  });

  it("reintentar lleva el foco al título de la partida", () => {
    act("level", '[data-i="0"]');
    while (livesLeft() > 0) makeMistake();
    act("retry");
    expect($("#sheet").hasAttribute("inert")).toBe(false);
    expect(active().tagName).toBe("H1");
    expect(active().textContent).toContain("Nivel 1");
  });

  it("al superar un nivel la ventana también recibe el foco", () => {
    solve();
    expect($("#modal").contains(active())).toBe(true);
    expect($("#modal h2").textContent).toBe("¡Nivel superado!");
  });
});
