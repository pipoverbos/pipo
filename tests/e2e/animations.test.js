import { beforeAll, describe, expect, it } from "vitest";
import { $, $$, act, boot, livesLeft, makeMistake, solve } from "../helpers/app.js";

describe("animaciones de corazones y consejo de Pipo", () => {
  beforeAll(async () => {
    await boot({ storage: { diff: "hard" } }); // en difícil hay huecos de sobra para una racha de 10
    act("play");
    act("level", '[data-i="0"]');
  });

  it("al fallar, el corazón que se vacía lleva la animación «lose»", () => {
    makeMistake();
    expect(livesLeft()).toBe(4);
    const animados = $$(".hearts svg.lose");
    expect(animados).toHaveLength(1);
    expect(animados[0].classList.contains("lost")).toBe(true);
    expect($$(".hearts svg")[4]).toBe(animados[0]); // el último corazón es el que se pierde
  });

  it("al fallar, el globo de Pipo entra con la animación de consejo", () => {
    expect($(".bubble").classList.contains("tip")).toBe(true);
    expect($(".bubble").textContent).toContain("Pierdo una vida");
  });

  it("un acierto normal no anima corazones ni usa la animación de consejo", () => {
    solve(1);
    expect($$(".hearts svg.lose, .hearts svg.gain")).toHaveLength(0);
    expect($(".bubble").classList.contains("tip")).toBe(false);
  });

  it("al ganar una vida (10 aciertos seguidos) el corazón nuevo lleva la animación «gain»", () => {
    solve(8); // 9 aciertos seguidos contando el anterior
    expect($$(".hearts svg.gain")).toHaveLength(0);
    solve(1); // décimo acierto
    expect(livesLeft()).toBe(5);
    const nuevo = $$(".hearts svg.gain");
    expect(nuevo).toHaveLength(1);
    expect($$(".hearts svg")[4]).toBe(nuevo[0]);
  });

  it("los corazones y su descripción accesible no cambian por la animación", () => {
    expect($(".hearts").getAttribute("aria-label")).toBe("5 vidas");
  });
});
