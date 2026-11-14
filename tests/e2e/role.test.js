// La primera pantalla de cada visita pregunta cómo se entra: alumno o profesor.
import { beforeAll, describe, expect, it } from "vitest";
import { $, act, boot } from "../helpers/app.js";

const titulo = () => $("#view h1")?.textContent;

describe("elección de rol", () => {
  beforeAll(() => boot({ role: false }));

  it("al abrir pregunta «¿Cómo quieres entrar?» antes de nada, aunque ya se conozca el juego", () => {
    expect($(".role")).not.toBeNull();
    expect($(".bubble").textContent).toContain("¿Cómo quieres entrar hoy?");
    expect($(".home")).toBeNull();
  });

  it("«Soy profesor» aún no está disponible y no se puede pulsar", () => {
    expect($('[data-act="profe"]').disabled).toBe(true);
  });

  it("«Soy alumno» lleva al inicio de siempre", () => {
    act("student");
    expect(titulo()).toBe("Pipo y los verbos irregulares");
    expect($(".home")).not.toBeNull();
  });

  it("«Cambiar de rol» vuelve a preguntar, y se puede cambiar cuantas veces se quiera", () => {
    act("role");
    expect($(".role")).not.toBeNull();
    act("student");
    expect($(".home")).not.toBeNull();
  });

  it("en el inicio ya no está «Conoce a Pipo»", () => {
    expect($('[data-act="meetpipo"]')).toBeNull();
    expect($('[data-act="role"]').textContent).toBe("Cambiar de rol");
  });
});
