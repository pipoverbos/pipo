// Auditoría automática de accesibilidad (axe-core) de las pantallas de las cuentas.
// El contraste de color no se puede medir en jsdom: lo cubre tests/unit/contrast.test.js para los colores de tokens.css.
import { beforeAll, describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import { $, act, boot, click, type } from "../helpers/app.js";

HTMLCanvasElement.prototype.getContext = () => null;

const TOKEN = "0123456789abcdef0123456789abcdef";
const RECUPERACION = "3f9a21c7b04e88d16a5ce37f90b214dd7c68a0f5";

async function audit() {
  const result = await axe.run(document, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] },
    rules: { "color-contrast": { enabled: false } },
  });
  return result.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
}
const esperar = () => new Promise((r) => setTimeout(r, 20));

describe("accesibilidad de las cuentas (axe-core)", () => {
  beforeAll(async () => {
    const respuestas = {
      account_register: [{ token: TOKEN, recovery_code: RECUPERACION }],
      account_login: [{ token: null, role: null, must_change_password: null, error: "credenciales_invalidas" }],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => ({ status: 200, text: async () => JSON.stringify(respuestas[url.split("/rpc/")[1]]) }))
    );
    await boot({ role: false, account: false });
    vi.useRealTimers(); // axe usa setTimeout por dentro: con temporizadores falsos nunca termina
  });

  it("elección de rol", async () => expect(await audit()).toEqual([]));

  it("crear cuenta", async () => {
    act("student");
    expect(await audit()).toEqual([]);
  });

  it("crear cuenta, con un error en el campo", async () => {
    act("authsubmit");
    await esperar();
    expect($("#au-err").textContent).not.toBe("");
    expect(await audit()).toEqual([]);
  });

  it("entrar, con un error de contraseña", async () => {
    act("authmode", '[data-m="login"]');
    type("#au", "pipa.leo8");
    type("#ap", "una contraseña larga");
    act("authsubmit");
    await esperar();
    expect($("#auth-err").textContent).not.toBe("");
    expect(await audit()).toEqual([]);
  });

  it("contraseña olvidada", async () => {
    act("forgot");
    expect(await audit()).toEqual([]);
  });

  it("código de recuperación", async () => {
    act("authback");
    act("student");
    act("authmode", '[data-m="register"]');
    type("#au", "pipa.leo8");
    type("#ap", "una contraseña larga");
    act("authsubmit");
    await esperar();
    expect($(".reccode")).not.toBeNull();
    expect(await audit()).toEqual([]);
    click($("#recok"));
    expect(await audit()).toEqual([]);
  });

  it("zona del profesorado", async () => {
    act("reccontinue");
    act("logout");
    await esperar();
    localStorage.setItem("pipo2.acc", JSON.stringify({ token: TOKEN, role: "profe", username: "marta.lopez" }));
    act("profe");
    expect($("#view h1").textContent).toBe("Mis clases");
    expect(await audit()).toEqual([]);
  });

  it("elige tu contraseña (contraseña temporal)", async () => {
    localStorage.setItem("pipo2.acc", JSON.stringify({ token: TOKEN, role: "alumno", username: "pipa.leo8" }));
    document.querySelector('[data-act="logout"]').dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await esperar();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 200,
        text: async () => JSON.stringify([{ token: TOKEN, role: "alumno", must_change_password: true, error: null }]),
      }))
    );
    act("student");
    act("authmode", '[data-m="login"]');
    type("#au", "pipa.leo8");
    type("#ap", "temporal1");
    act("authsubmit");
    await esperar();
    expect($("#view h1").textContent).toBe("Elige tu contraseña");
    expect(await audit()).toEqual([]);
  });
});
