// Cuentas de punta a punta: el juego real sobre jsdom con un servidor falso en lugar de Supabase.
// Es un recorrido seguido (crear cuenta, cerrar sesión, entrar, olvidar la contraseña...), así que depende del orden.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { $, act, boot, click, stored, type } from "../helpers/app.js";
import { S } from "../../js/state.js";

const TOKEN = "0123456789abcdef0123456789abcdef";
const RECUPERACION = "3f9a21c7b04e88d16a5ce37f90b214dd7c68a0f5";
const NUEVA = "fedcba9876543210fedcba9876543210a1b2c3d4";

const llamadas = [];
const respuestas = {};
const ok = (body) => ({ status: 200, body });
const fallo = (message) => ({ status: 400, body: { code: "P0001", message } });
const llamadasA = (fn) => llamadas.filter((l) => l.fn === fn);
const entrada = (role, must = false, error = null) =>
  ok([{ token: error ? null : TOKEN, role: error ? null : role, must_change_password: error ? null : must, error }]);

beforeAll(async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, init) => {
      const fn = url.split("/rpc/")[1];
      llamadas.push({ fn, body: JSON.parse(init.body) });
      const r = respuestas[fn]?.();
      if (r instanceof Error) throw r;
      if (!r) return { status: 404, text: async () => "{}" };
      return { status: r.status, text: async () => JSON.stringify(r.body) };
    })
  );
  await boot({ role: false, account: false });
});

const flush = async () => {
  for (let i = 0; i < 6; i++) await vi.advanceTimersByTimeAsync(0);
};
const titulo = () => $("#view h1")?.textContent;
const enter = (sel) => $(sel).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
const texto = (sel) => $(sel)?.textContent ?? null;

describe("crear una cuenta de alumno", () => {
  it("sin cuenta, «Soy alumno» pide crear una (es la pestaña por defecto la primera vez)", () => {
    act("student");
    expect(titulo()).toBe("Soy alumno");
    expect($('[data-act="authmode"][data-m="register"]').getAttribute("aria-pressed")).toBe("true");
    expect($('[data-act="authsubmit"]').textContent).toBe("Crear cuenta");
    expect($("#au-help").textContent).toMatch(/elegirás un apodo/);
  });

  it("valida el usuario y la contraseña sin llamar al servidor, y da el foco al campo que falla", async () => {
    type("#au", "ab");
    act("authsubmit");
    await flush();
    expect(texto("#au-err")).toMatch(/3 a 30 letras/);
    expect($("#au").getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe($("#au"));
    type("#au", "pipa.leo8");
    type("#ap", "corta");
    act("authsubmit");
    await flush();
    expect(texto("#ap-err")).toMatch(/entre 8 y 72/);
    expect(document.activeElement).toBe($("#ap"));
    expect(texto("#au-err")).toBe("");
    expect(llamadas).toHaveLength(0);
  });

  it("«Mostrar la contraseña» cambia el tipo del campo", () => {
    expect($("#ap").type).toBe("password");
    click($("#showpw"));
    expect($("#ap").type).toBe("text");
    click($("#showpw"));
    expect($("#ap").type).toBe("password");
  });

  it("un usuario repetido se avisa en su campo y el botón vuelve a poder usarse", async () => {
    respuestas.account_register = () => fallo("usuario_en_uso");
    type("#ap", "una contraseña larga");
    act("authsubmit");
    await flush();
    expect(texto("#au-err")).toMatch(/ya existe/);
    expect($('[data-act="authsubmit"]').disabled).toBe(false);
    expect(stored("acc")).toBeNull();
  });

  it("un fallo de conexión se avisa debajo del botón y se puede reintentar", async () => {
    respuestas.account_register = () => new TypeError("Failed to fetch");
    act("authsubmit");
    await flush();
    expect(texto("#auth-err")).toMatch(/No hay conexión/);
    expect($('[data-act="authsubmit"]').disabled).toBe(false);
  });

  it("al crearla enseña el código de recuperación en grupos y guarda la sesión", async () => {
    respuestas.account_register = () => ok([{ token: TOKEN, recovery_code: RECUPERACION }]);
    enter("#ap"); // Intro en el campo es como pulsar el botón
    await flush();
    expect(llamadasA("account_register").at(-1).body).toEqual({
      p_role: "alumno",
      p_username: "pipa.leo8",
      p_password: "una contraseña larga",
    });
    expect(titulo()).toBe("Cuenta lista");
    expect(texto(".reccode")).toBe("3F9A 21C7 B04E 88D1 6A5C\nE37F 90B2 14DD 7C68 A0F5");
    expect(stored("acc")).toEqual({ token: TOKEN, role: "alumno", username: "pipa.leo8" });
    expect(document.body.textContent).not.toContain(TOKEN);
  });

  it("no deja continuar hasta marcar «Ya lo he guardado»", () => {
    expect($('[data-act="reccontinue"]').disabled).toBe(true);
    click($("#recok"));
    expect($('[data-act="reccontinue"]').disabled).toBe(false);
    click($("#recok"));
    expect($('[data-act="reccontinue"]').disabled).toBe(true);
  });

  it("copia el código y, si el navegador no deja, lo dice", async () => {
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    act("reccopy");
    await flush();
    expect(writeText).toHaveBeenCalledWith(RECUPERACION);
    expect(texto("#rec-msg")).toBe("Código copiado.");
    writeText.mockRejectedValue(new Error("denegado"));
    act("reccopy");
    await flush();
    expect(texto("#rec-msg")).toMatch(/Apúntalo a mano/);
    delete navigator.clipboard;
  });

  it("al continuar entra al inicio y el código ya no se puede volver a ver", () => {
    click($("#recok"));
    act("reccontinue");
    expect($(".home")).not.toBeNull();
    expect(document.body.textContent).not.toContain("3F9A");
    expect(S.rec).toBeNull(); // tampoco queda en la memoria del juego
  });
});

describe("cerrar sesión y volver a entrar", () => {
  it("«Cerrar sesión» avisa al servidor, olvida la sesión y vuelve a preguntar el rol", async () => {
    respuestas.account_logout = () => ok(true);
    act("logout");
    await flush();
    expect(llamadasA("account_logout").at(-1).body).toEqual({ p_token: TOKEN });
    expect(stored("acc")).toBeNull();
    expect($(".role")).not.toBeNull();
  });

  it("ahora la pestaña por defecto es «Entrar», y con usuario o contraseña mal se avisa sin dar pistas", async () => {
    act("student");
    expect($('[data-act="authmode"][data-m="login"]').getAttribute("aria-pressed")).toBe("true");
    respuestas.account_login = () => entrada(null, false, "credenciales_invalidas");
    type("#au", "pipa.leo8");
    type("#ap", "contraseña equivocada");
    act("authsubmit");
    await flush();
    expect(texto("#auth-err")).toBe("El usuario o la contraseña no son correctos.");
    expect($('[data-act="authsubmit"]').disabled).toBe(false);
  });

  it("una cuenta bloqueada lo dice", async () => {
    respuestas.account_login = () => entrada(null, false, "cuenta_bloqueada");
    act("authsubmit");
    await flush();
    expect(texto("#auth-err")).toMatch(/Espera 15 minutos/);
  });

  it("una cuenta de profesor no entra por «Soy alumno» y no deja sesión", async () => {
    respuestas.account_login = () => entrada("profe");
    respuestas.account_logout = () => ok(true);
    act("authsubmit");
    await flush();
    expect(texto("#auth-err")).toMatch(/Esa cuenta es de profesor/);
    expect(stored("acc")).toBeNull();
    expect(llamadasA("account_logout").at(-1).body).toEqual({ p_token: TOKEN });
  });

  it("con la contraseña buena entra al inicio", async () => {
    respuestas.account_login = () => entrada("alumno");
    type("#ap", "una contraseña larga");
    act("authsubmit");
    await flush();
    expect($(".home")).not.toBeNull();
    expect(stored("acc")).toMatchObject({ role: "alumno", username: "pipa.leo8" });
  });

  it("con la sesión abierta, elegir alumno va directo al inicio, sin pedir nada", async () => {
    act("logout");
    await flush();
    localStorage.setItem("pipo2.acc", JSON.stringify({ token: TOKEN, role: "alumno", username: "pipa.leo8" }));
    act("student");
    expect($(".home")).not.toBeNull();
  });
});

describe("soy profesor", () => {
  it("con una sesión de alumno abierta, «Soy profesor» pide entrar como profesor", async () => {
    act("logout");
    await flush();
    localStorage.setItem("pipo2.acc", JSON.stringify({ token: TOKEN, role: "alumno", username: "pipa.leo8" }));
    act("profe");
    expect(titulo()).toBe("Soy profesor");
  });

  it("puede crear su cuenta, que lleva a su zona tras guardar el código", async () => {
    act("authmode", '[data-m="register"]');
    expect($("#au-help").textContent).toMatch(/Mejor sin tu nombre completo/);
    respuestas.account_register = () => ok([{ token: TOKEN, recovery_code: RECUPERACION }]);
    type("#au", "marta.lopez");
    type("#ap", "otra contraseña larga");
    act("authsubmit");
    await flush();
    expect(llamadasA("account_register").at(-1).body.p_role).toBe("profe");
    click($("#recok"));
    act("reccontinue");
    expect(titulo()).toBe("Mis clases");
    expect($("#view").textContent).toContain("marta.lopez");
    expect(stored("acc")).toMatchObject({ role: "profe" });
  });

  it("con su sesión abierta, «Soy profesor» va directo a su zona; y puede cerrar sesión", async () => {
    respuestas.account_logout = () => ok(true);
    act("logout");
    await flush();
    act("profe");
    expect(titulo()).toBe("Soy profesor");
    respuestas.account_login = () => entrada("profe");
    act("authmode", '[data-m="login"]');
    type("#au", "marta.lopez");
    type("#ap", "otra contraseña larga");
    act("authsubmit");
    await flush();
    expect(titulo()).toBe("Mis clases");
    act("logout");
    await flush();
    expect($(".role")).not.toBeNull();
  });

  it("una cuenta de alumno no entra por «Soy profesor»", async () => {
    act("profe");
    respuestas.account_login = () => entrada("alumno");
    respuestas.account_logout = () => ok(true);
    act("authmode", '[data-m="login"]');
    type("#au", "pipa.leo8");
    type("#ap", "una contraseña larga");
    act("authsubmit");
    await flush();
    expect(texto("#auth-err")).toMatch(/Esa cuenta es de alumno/);
    expect(stored("acc")).toBeNull();
  });
});

describe("contraseña olvidada", () => {
  it("desde «Entrar» se llega a la pantalla del código de recuperación", () => {
    act("forgot");
    expect(titulo()).toBe("Contraseña olvidada");
  });

  it("valida cada campo y da el foco al que falla", async () => {
    act("forgotsubmit");
    await flush();
    expect(texto("#fu-err")).toMatch(/3 a 30 letras/);
    expect(document.activeElement).toBe($("#fu"));
    type("#fu", "pipa.leo8");
    type("#fc", "123");
    type("#fn", "corta");
    act("forgotsubmit");
    await flush();
    expect(texto("#fn-err")).toMatch(/entre 8 y 72/);
    expect(document.activeElement).toBe($("#fn"));
  });

  it("un código incorrecto da un mensaje claro", async () => {
    type("#fn", "contraseña nueva");
    act("forgotsubmit");
    await flush();
    expect(texto("#forgot-err")).toBe("El usuario o el código de recuperación no son correctos.");
    expect($('[data-act="forgotsubmit"]').disabled).toBe(false);
  });

  it("con el código bueno entra y enseña un código nuevo (el anterior deja de valer)", async () => {
    respuestas.account_reset_password = () => ok([{ token: TOKEN, recovery_code: NUEVA, role: "alumno", error: null }]);
    type("#fc", "3F9A-21C7-B04E-88D1-6A5C-E37F-90B2-14DD-7C68-A0F5");
    act("forgotsubmit");
    await flush();
    expect(llamadasA("account_reset_password").at(-1).body).toEqual({
      p_username: "pipa.leo8",
      p_recovery_code: RECUPERACION,
      p_new_password: "contraseña nueva",
    });
    expect(titulo()).toBe("Cuenta lista");
    expect(texto(".reccode").replace(/\s/g, "")).toBe(NUEVA.toUpperCase());
    click($("#recok"));
    act("reccontinue");
    expect($(".home")).not.toBeNull();
  });
});

describe("contraseña temporal puesta por el profesor", () => {
  it("al entrar con ella hay que elegir una contraseña nueva antes de jugar", async () => {
    respuestas.account_logout = () => ok(true);
    act("logout");
    await flush();
    act("student");
    respuestas.account_login = () => entrada("alumno", true);
    type("#au", "pipa.leo8");
    type("#ap", "temporal1");
    act("authsubmit");
    await flush();
    expect(titulo()).toBe("Elige tu contraseña");
    expect($(".home")).toBeNull();
  });

  it("valida la nueva y avisa si la temporal no era esa", async () => {
    type("#cp-old", "temporal1");
    type("#cp-new", "corta");
    act("changepasssubmit");
    await flush();
    expect(texto("#cp-new-err")).toMatch(/entre 8 y 72/);
    respuestas.account_change_password = () => fallo("credenciales_invalidas");
    type("#cp-new", "mi contraseña nueva");
    act("changepasssubmit");
    await flush();
    expect(texto("#cp-old-err")).toBe("La contraseña temporal no es correcta.");
    expect(document.activeElement).toBe($("#cp-old"));
  });

  it("si la sesión ya no vale, vuelve a preguntar el rol", async () => {
    respuestas.account_change_password = () => fallo("sesion_no_valida");
    act("changepasssubmit");
    await flush();
    expect($(".role")).not.toBeNull();
  });

  it("al cambiarla entra al inicio", async () => {
    act("student");
    respuestas.account_login = () => entrada("alumno", true);
    type("#au", "pipa.leo8");
    type("#ap", "temporal1");
    act("authsubmit");
    await flush();
    respuestas.account_change_password = () => ok(true);
    type("#cp-old", "temporal1");
    type("#cp-new", "mi contraseña nueva");
    enter("#cp-new");
    await flush();
    expect(llamadasA("account_change_password").at(-1).body).toEqual({
      p_token: TOKEN,
      p_old: "temporal1",
      p_new: "mi contraseña nueva",
    });
    expect($(".home")).not.toBeNull();
  });
});

describe("el progreso viaja con la cuenta", () => {
  const PROGRESO = { stars: { easy: [3, 2, 0, 0, 0] }, sel: ["go", "be", "put"], diff: "hard" };
  const me = (progress) => () => ok([{ role: "alumno", username: "pipa.leo8", progress, must_change_password: false }]);
  const sesion = () =>
    localStorage.setItem("pipo2.acc", JSON.stringify({ token: TOKEN, role: "alumno", username: "pipa.leo8" }));

  it("al entrar con la contraseña, el progreso del navegador pasa a ser el de la cuenta", async () => {
    respuestas.account_logout = () => ok(true);
    act("logout");
    await flush();
    localStorage.setItem("pipo2.stars.normal", JSON.stringify([1, 1, 1, 1, 1])); // de otra persona
    act("student");
    respuestas.account_login = () => entrada("alumno");
    respuestas.account_me = me(PROGRESO);
    respuestas.alu_my_class = () => ok([]);
    type("#au", "pipa.leo8");
    type("#ap", "una contraseña larga");
    act("authsubmit");
    await flush();
    expect($(".home")).not.toBeNull();
    expect(stored("stars.easy")).toEqual([3, 2, 0, 0, 0]);
    expect(stored("stars.normal")).toBeNull();
    expect(stored("diff")).toBe("hard");
    expect(stored("sel")).toEqual(["go", "be", "put"]);
    expect($(".home").textContent).toContain("mapa 0 de 15 (Difícil)");
  });

  it("al cambiar de dificultad se guarda en la cuenta pasados un par de segundos, una sola vez", async () => {
    respuestas.alu_save_progress = () => ok(true);
    const antes = llamadasA("alu_save_progress").length;
    act("diff", '[data-d="easy"]');
    act("diff", '[data-d="normal"]');
    await vi.advanceTimersByTimeAsync(1000);
    expect(llamadasA("alu_save_progress")).toHaveLength(antes);
    await vi.advanceTimersByTimeAsync(1500);
    expect(llamadasA("alu_save_progress")).toHaveLength(antes + 1);
    expect(llamadasA("alu_save_progress").at(-1).body).toEqual({
      p_token: TOKEN,
      p_progress: { stars: { easy: [3, 2, 0, 0, 0] }, sel: ["go", "be", "put"], diff: "normal" },
    });
  });

  it("al abrir el juego con la sesión puesta, trae lo de la cuenta sin hacer esperar", async () => {
    act("logout");
    await flush();
    sesion();
    respuestas.account_me = me({ stars: { normal: [3, 3, 0, 0, 0] }, diff: "normal" });
    respuestas.alu_my_class = () =>
      ok([
        {
          code: "ABC234",
          name: "1º A de ESO",
          alias: "Pipa",
          kind: "aula",
          allowed_lists: [1, 2, 3, 4, 5, 6],
          allowed_difficulties: ["easy", "normal", "hard"],
          is_owner: false,
        },
      ]);
    act("student");
    expect($(".home")).not.toBeNull(); // entra al momento
    await flush();
    expect(stored("stars.normal")).toEqual([3, 3, 0, 0, 0]);
    expect($(".home").textContent).toContain("mapa 6 de 15");
    expect($('[data-act="class"]').textContent).toContain("Ranking de 1º A de ESO");
  });

  it("si hay cambios sin enviar, no se pisan con lo de la cuenta: se envían", async () => {
    act("diff", '[data-d="hard"]'); // pendiente
    act("logout"); // no espera los 2 segundos: envía lo pendiente al salir
    await flush();
    expect(llamadasA("alu_save_progress").at(-1).body.p_progress.diff).toBe("hard");
  });

  it("cerrar sesión borra el progreso y la clase de este navegador, y deja el sonido y el apodo", async () => {
    expect(stored("stars.normal")).toBeNull();
    expect(stored("diff")).toBeNull();
    expect(stored("cls")).toBeNull();
    expect(stored("dirty")).toBeNull();
    expect(stored("name")).toBe("Pipa");
  });

  it("crear una cuenta nueva adopta el progreso que ya hubiera en el navegador", async () => {
    localStorage.setItem("pipo2.stars.easy", JSON.stringify([3, 3, 3, 0, 0]));
    act("student");
    act("authmode", '[data-m="register"]');
    respuestas.account_register = () => ok([{ token: TOKEN, recovery_code: RECUPERACION }]);
    type("#au", "nueva.cuenta");
    type("#ap", "una contraseña larga");
    act("authsubmit");
    await flush();
    expect(llamadasA("alu_save_progress").at(-1).body.p_progress).toEqual({ stars: { easy: [3, 3, 3, 0, 0] } });
    click($("#recok"));
    act("reccontinue");
    expect($(".home")).not.toBeNull();
  });

  it("si la sesión ha caducado al abrir, se pide entrar de nuevo con un aviso", async () => {
    respuestas.account_logout = () => ok(true);
    act("logout");
    await flush();
    sesion();
    respuestas.account_me = () => fallo("sesion_no_valida");
    act("student");
    await flush();
    expect(titulo()).toBe("Soy alumno");
    expect($(".err[role=alert]").textContent).toMatch(/Tu sesión ha caducado/);
    expect(stored("acc")).toBeNull();
  });
});

describe("mi cuenta", () => {
  const entrarAlumno = async () => {
    localStorage.setItem("pipo2.acc", JSON.stringify({ token: TOKEN, role: "alumno", username: "pipa.leo8" }));
    respuestas.account_me = () =>
      ok([{ role: "alumno", username: "pipa.leo8", progress: {}, must_change_password: false }]);
    respuestas.alu_my_class = () => ok([]);
    act("authback");
    act("student");
    await flush();
  };

  it("enseña el usuario y se llega desde el inicio", async () => {
    await entrarAlumno();
    act("myaccount");
    expect(titulo()).toBe("Mi cuenta");
    expect($("#view").textContent).toContain("pipa.leo8");
    act("accountback");
    expect($(".home")).not.toBeNull();
  });

  it("cambiar la contraseña pide la actual, avisa si no es y vuelve a «Mi cuenta»", async () => {
    act("myaccount");
    act("changepassopen");
    expect(titulo()).toBe("Cambiar contraseña");
    respuestas.account_change_password = () => fallo("credenciales_invalidas");
    type("#cp-old", "mal");
    type("#cp-new", "mi contraseña nueva");
    act("changepasssubmit");
    await flush();
    expect($("#cp-old-err").textContent).toMatch(/no es correcta/);
    respuestas.account_change_password = () => ok(true);
    type("#cp-old", "una contraseña larga");
    act("changepasssubmit");
    await flush();
    expect(titulo()).toBe("Mi cuenta");
  });

  it("borrar la cuenta pide la contraseña, avisa si es otra y, al confirmar, lo borra todo", async () => {
    act("accountdelask");
    expect($("#modal h2").textContent).toBe("¿Borrar mi cuenta?");
    expect($("#modal").textContent).toContain("pipa.leo8");
    expect($("#modal").textContent).toMatch(/retos/);
    click($('#modal [data-act="modalclose"]'));
    expect(stored("acc")).not.toBeNull();
    respuestas.account_delete = () => fallo("credenciales_invalidas");
    act("accountdelask");
    type("#da-pw", "mal");
    act("accountdel");
    await flush();
    expect($("#da-err").textContent).toBe("La contraseña no es correcta.");
    expect(stored("acc")).not.toBeNull();
    respuestas.account_delete = () => ok(true);
    type("#da-pw", "una contraseña larga");
    act("accountdel");
    await flush();
    expect(llamadasA("account_delete").at(-1).body).toEqual({ p_token: TOKEN, p_password: "una contraseña larga" });
    expect(stored("acc")).toBeNull();
    expect($("#modal .modal")).toBeNull();
    expect($(".role")).not.toBeNull();
  });
});
