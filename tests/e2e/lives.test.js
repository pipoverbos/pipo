import { beforeAll, describe, expect, it } from "vitest";
import { $, act, boot, livesLeft, makeMistake, modalTitle, solve, stored } from "../helpers/app.js";

describe("vidas, errores y reintento", () => {
  beforeAll(async () => {
    await boot();
    act("play");
    act("level", '[data-i="0"]');
  });

  it("empieza con 5 vidas", () => expect(livesLeft()).toBe(5));

  it("un error quita una vida y se guarda para el repaso", () => {
    makeMistake();
    expect(livesLeft()).toBe(4);
    expect(Object.keys(stored("miss"))).toHaveLength(1);
  });

  it("al perder todas las vidas Pipo muere", () => {
    for (let i = 0; i < 4; i++) makeMistake();
    expect(livesLeft()).toBe(0);
    expect(modalTitle()).toBe("Pipo se ha quedado sin vidas");
  });

  it("reintentar empieza el nivel de nuevo con 5 vidas", () => {
    act("retry");
    expect($("#modal .modal")).toBeNull();
    expect(livesLeft()).toBe(5);
  });

  it("con errores el nivel se supera con menos estrellas", () => {
    makeMistake();
    makeMistake();
    makeMistake();
    solve();
    expect(modalTitle()).toBe("¡Nivel superado!");
    expect(stored("stars.normal")[0]).toBe(1); // más de 2 errores: 1 estrella
  });
});
