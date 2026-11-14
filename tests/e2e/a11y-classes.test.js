// Auditoría automática de accesibilidad (axe-core) de las pantallas de las clases.
// El contraste de color no se puede medir en jsdom: lo cubre tests/unit/contrast.test.js para los colores de tokens.css.
import { beforeAll, describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import { $, act, boot, solve, type } from "../helpers/app.js";

HTMLCanvasElement.prototype.getContext = () => null;

const ID = "123e4567-e89b-42d3-a456-426614174000";
const SECRETO = "0123456789abcdef0123456789abcdef";

async function audit() {
  const result = await axe.run(document, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] },
    rules: { "color-contrast": { enabled: false } },
  });
  return result.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
}
const esperar = () => new Promise((r) => setTimeout(r, 20));

describe("accesibilidad de las clases (axe-core)", () => {
  beforeAll(async () => {
    const respuestas = {
      join_class: [{ player_id: ID, player_secret: SECRETO, class_name: "1º A de ESO" }],
      class_ranking: [
        { alias: "Lobo gris", points: 1240, levels: 5 },
        { alias: "Pipa", points: 540, levels: 2 },
      ],
      submit_run: [{ points: 340, stars: 3 }],
      leave_class: true,
      create_class: [{ code: "DEF567", teacher_secret: "fedcba9876543210fedcba9876543210" }],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => ({
        status: 200,
        text: async () => JSON.stringify(respuestas[url.split("/rpc/")[1]]),
      }))
    );
    await boot();
    vi.useRealTimers(); // axe usa setTimeout por dentro: con temporizadores falsos nunca termina
  });

  it("inicio con «Mi clase»", async () => expect(await audit()).toEqual([]));

  it("unirse a una clase", async () => {
    act("class");
    expect(await audit()).toEqual([]);
  });

  it("unirse a una clase, con un error en el campo", async () => {
    act("joinclass");
    await esperar();
    expect($("#cc-err").textContent).not.toBe("");
    expect(await audit()).toEqual([]);
  });

  it("ranking", async () => {
    type("#cc", "ABC234");
    act("joinclass");
    await esperar();
    expect($(".rank")).not.toBeNull();
    expect(await audit()).toEqual([]);
  });

  it("confirmación de salir de la clase", async () => {
    act("leaveask");
    expect(await audit()).toEqual([]);
    act("modalclose");
  });

  it("ventana de nivel superado con el recuadro del ranking", async () => {
    act("home");
    act("play");
    act("level", '[data-i="0"]');
    solve();
    await esperar();
    expect($("#rank-msg").textContent).toContain("+340 puntos");
    expect(await audit()).toEqual([]);
  });

  it("crear una clase, antes y después de crearla", async () => {
    act("map");
    act("home");
    act("class");
    act("leaveask"); // quien está en una clase no ve «Crear una clase»: se sale primero
    act("leavedo");
    await esperar();
    act("class");
    act("teacher");
    expect(await audit()).toEqual([]);
    type("#tn", "1º B de ESO");
    act("teachercreate");
    await esperar();
    expect($(".codebig")).not.toBeNull();
    expect(await audit()).toEqual([]);
  });
});
