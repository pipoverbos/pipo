// Foco: al cambiar de pantalla y al repintar, el foco no se pierde.
import { beforeAll, describe, expect, it } from "vitest";
import { $, $$, act, boot, click } from "../helpers/app.js";

const active = () => document.activeElement;

describe("foco al cambiar de pantalla", () => {
  beforeAll(() => boot());

  it("al llegar a una pantalla, el foco va a su título", () => {
    expect(active().tagName).toBe("H1"); // inicio
    act("play");
    expect(active().tagName).toBe("H1");
    expect(active().textContent).toBe("Elige un nivel");
  });

  it("cada pantalla tiene un único <h1>", () => {
    for (const screen of ["verbs", "home", "play"]) {
      if (screen === "home") act("home");
      else if (screen === "verbs") (act("home"), act("verbs"));
      else act("play");
      expect($$("h1")).toHaveLength(1);
    }
  });

  it("cambiar la dificultad no hace perder el foco", () => {
    act("home");
    const hard = $('[data-act="diff"][data-d="hard"]');
    hard.focus();
    click(hard);
    expect(active().dataset.d).toBe("hard");
    expect(active().getAttribute("aria-pressed")).toBe("true");
  });

  it("marcar un verbo suelto no hace perder el foco", () => {
    act("verbs");
    const row = $('.vrow[data-inf="go"]');
    row.focus();
    click(row);
    expect(active().dataset.inf).toBe("go");
    expect(active().getAttribute("aria-checked")).toBe("false");
  });
});
