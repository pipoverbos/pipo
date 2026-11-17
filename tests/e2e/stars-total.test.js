// Las estrellas se acumulan: el mapa de niveles empieza de nuevo al cambiar de verbos, pero el contador total sigue sumando.
import { beforeAll, describe, expect, it } from "vitest";
import { $, act, boot, click, makeMistake, solve, stored } from "../helpers/app.js";

const resumen = () => $(".home").textContent.replace(/\s+/g, " ");
const jugarNivel = (i, { fallos = 0 } = {}) => {
  act("play");
  act("level", `[data-i="${i}"]`);
  for (let k = 0; k < fallos; k++) makeMistake();
  solve();
  act("map");
  act("home");
};
const tocarVerbo = (inf) => click($(`[data-act="tv"][data-inf="${inf}"]`));

describe("contador de estrellas total y mapa de niveles", () => {
  // quien ya tenía estrellas antes de que existiera el contador (2 niveles en fácil: 3 + 2) empieza con ellas
  beforeAll(() => boot({ storage: { "stars.easy": [3, 2, 0, 0, 0] } }));

  it("quien ya tenía estrellas empieza con ellas en el contador, y el mapa es el de su dificultad", () => {
    expect(resumen()).toContain("5 estrellas en total · mapa 0 de 15 (Normal)");
    expect(stored("total")).toBeNull(); // se calcula; todavía no se ha guardado
  });

  it("al superar un nivel suma las estrellas que gana, en el contador y en el mapa", () => {
    jugarNivel(0, { fallos: 1 }); // 2 estrellas
    expect(resumen()).toContain("7 estrellas en total · mapa 2 de 15 (Normal)");
    expect(stored("total")).toBe(7);
  });

  it("repetir un nivel solo suma lo que mejora: peor o igual no suma nada, mejor suma la diferencia", () => {
    jugarNivel(0, { fallos: 2 }); // 2 estrellas otra vez: nada
    expect(resumen()).toContain("7 estrellas en total · mapa 2 de 15");
    jugarNivel(0); // 3 estrellas: +1
    expect(resumen()).toContain("8 estrellas en total · mapa 3 de 15");
  });

  it("cada dificultad tiene su mapa y todas suman en el mismo contador", () => {
    act("diff", '[data-d="hard"]');
    jugarNivel(0);
    expect(resumen()).toContain("11 estrellas en total · mapa 3 de 15 (Difícil)");
    act("diff", '[data-d="normal"]');
    expect(resumen()).toContain("11 estrellas en total · mapa 3 de 15 (Normal)");
  });

  it("cambiar los verbos avisa de que el mapa empieza de nuevo y de que las estrellas se quedan en el contador", () => {
    act("verbs");
    const quitar = $('[data-act="tv"].on').dataset.inf;
    tocarVerbo(quitar);
    expect($("#modal h2").textContent).toBe("¿Cambiar tus verbos?");
    expect($("#modal").textContent).toContain("empezará de nuevo");
    expect($("#modal").textContent).toContain("11");
    expect(stored("stars.normal")).not.toBeNull(); // todavía no ha cambiado nada
    click($('#modal [data-act="modalclose"]'));
    expect($('[data-act="tv"][data-inf="' + quitar + '"]').classList.contains("on")).toBe(true);
    expect(stored("stars.normal")).not.toBeNull();
    expect(stored("stars.hard")).not.toBeNull();
  });

  it("al confirmar, el mapa empieza de nuevo en las tres dificultades y el contador se queda", () => {
    const quitar = $('[data-act="tv"].on').dataset.inf;
    tocarVerbo(quitar);
    click($('#modal [data-act="verbschange"]'));
    expect($("#modal .modal")).toBeNull();
    expect($('[data-act="tv"][data-inf="' + quitar + '"]').classList.contains("on")).toBe(false);
    for (const d of ["easy", "normal", "hard"]) expect(stored("stars." + d)).toBeNull();
    expect(stored("total")).toBe(11);
  });

  it("mientras el mapa está vacío se pueden tocar más verbos sin que vuelva a preguntar", () => {
    const otro = $('[data-act="tv"].on').dataset.inf;
    tocarVerbo(otro);
    expect($("#modal .modal")).toBeNull();
    tocarVerbo(otro);
    expect($("#modal .modal")).toBeNull();
  });

  it("«Todos» cuando ya estaban todos no cambia nada (ni pregunta)", () => {
    click($('[data-act="pre"][data-p="all"]'));
    click($('[data-act="pre"][data-p="all"]'));
    expect($("#modal .modal")).toBeNull();
  });

  it("con verbos nuevos, las estrellas que se ganan siguen sumando al contador de antes", () => {
    act("home");
    expect(resumen()).toContain("11 estrellas en total · mapa 0 de 15 (Normal)");
    jugarNivel(0);
    expect(resumen()).toContain("14 estrellas en total · mapa 3 de 15 (Normal)");
  });

  it("el contador de por vida se guarda en la cuenta junto con el resto del progreso", () => {
    expect(stored("total")).toBe(14);
  });
});
