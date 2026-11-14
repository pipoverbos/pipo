import { describe, expect, it } from "vitest";
import { datosDePartida } from "../../js/classes.js";

// El servidor (supabase/migrations/0001) rechaza una partida con más de 4 + aciertos/10 errores.
const topeServidor = (correct) => 4 + Math.floor(correct / 10);
const estrellas = (mistakes) => (mistakes === 0 ? 3 : mistakes <= 2 ? 2 : 1);

describe("datosDePartida", () => {
  it("lleva el nivel, la dificultad, los huecos acertados y los errores", () => {
    expect(datosDePartida({ idx: 2, total: 24, mis: 1 }, "hard")).toEqual({
      level: 2,
      difficulty: "hard",
      correct: 24,
      mistakes: 1,
    });
  });
  it("recorta los errores al máximo que admite el servidor (las vidas se acumulan entre niveles)", () => {
    expect(datosDePartida({ idx: 4, total: 24, mis: 9 }, "normal").mistakes).toBe(topeServidor(24));
    expect(datosDePartida({ idx: 4, total: 8, mis: 30 }, "normal").mistakes).toBe(4);
  });
  it("recortar no cambia la nota: el tope nunca baja de 3 errores, que ya es 1 estrella", () => {
    for (const total of [1, 5, 9, 10, 24, 80, 200]) {
      const mis = 40;
      const enviados = datosDePartida({ idx: 0, total, mis }, "easy").mistakes;
      expect(enviados).toBeLessThanOrEqual(topeServidor(total));
      expect(estrellas(enviados)).toBe(estrellas(mis));
    }
  });
  it("mantiene los aciertos dentro del rango que admite el servidor (1 a 200)", () => {
    expect(datosDePartida({ idx: 0, total: 0, mis: 0 }, "easy").correct).toBe(1);
    expect(datosDePartida({ idx: 0, total: 999, mis: 0 }, "easy").correct).toBe(200);
  });
});
