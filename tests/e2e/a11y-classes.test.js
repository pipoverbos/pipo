// Auditoría automática de accesibilidad (axe-core) de las pantallas de las clases y de «Mi cuenta».
// El contraste de color no se puede medir en jsdom: lo cubre tests/unit/contrast.test.js para los colores de tokens.css.
import { beforeAll, describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import { $, act, boot, solve, type } from "../helpers/app.js";

HTMLCanvasElement.prototype.getContext = () => null;

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
      alu_join_class: [
        {
          class_name: "1º A de ESO",
          alias: "Pipa",
          kind: "aula",
          allowed_lists: [1, 2, 3, 4, 5, 6],
          allowed_difficulties: ["easy", "normal", "hard"],
        },
      ],
      class_ranking: [
        { alias: "Lobo gris", points: 1240, levels: 5 },
        { alias: "Pipa", points: 540, levels: 2 },
      ],
      alu_submit_run: [{ points: 340, stars: 3 }],
      alu_leave_class: true,
      alu_create_challenge: [{ code: "DEF567", class_name: "Los de 1º B" }],
      alu_delete_challenge: true,
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

  it("inicio con «Unirme a una clase», «Reta a tus amigos» y «Mi cuenta»", async () =>
    expect(await audit()).toEqual([]));

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

  it("reta a tus amigos, antes y después de crearlo", async () => {
    act("map");
    act("home");
    act("class");
    act("leaveask"); // quien está en una clase no ve «Reta a tus amigos»: se sale primero
    act("leavedo");
    await esperar();
    act("challenge");
    expect(await audit()).toEqual([]);
    type("#rn", "Los de 1º B");
    act("challengemake");
    await esperar();
    expect($(".codebig")).not.toBeNull();
    expect(await audit()).toEqual([]);
  });

  it("confirmación de borrar el reto", async () => {
    act("challengedelask");
    expect(await audit()).toEqual([]);
    act("modalclose");
  });

  it("mi cuenta, cambiar contraseña y confirmación de borrar la cuenta", async () => {
    act("home");
    act("myaccount");
    expect($("#view h1").textContent).toBe("Mi cuenta");
    expect(await audit()).toEqual([]);
    act("changepassopen");
    expect($("#view h1").textContent).toBe("Cambiar contraseña");
    expect(await audit()).toEqual([]);
    act("myaccount");
    act("accountdelask");
    expect($("#da-pw")).not.toBeNull();
    expect(await audit()).toEqual([]);
    act("modalclose");
  });
});
