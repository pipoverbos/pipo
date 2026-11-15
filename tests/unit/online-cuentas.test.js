// Cuentas en el módulo de conexión: alta, entrada, recuperación, cambio de contraseña y cierre de sesión.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient, MENSAJES } from "../../js/online.js";
import { store } from "../../js/store.js";

const URL = "https://ejemplo.supabase.co";
const KEY = "sb_publishable_prueba";
const TOKEN = "0123456789abcdef0123456789abcdef";
const OTRO = "fedcba9876543210fedcba9876543210";
const RECUPERACION = "3f9a21c7b04e88d16a5ce37f90b214dd7c68a0f5";
const CLAVE = "una contraseña larga";

function servidor(...respuestas) {
  const llamadas = [];
  const fetchFn = vi.fn(async (url, init) => {
    llamadas.push({ url, init, body: JSON.parse(init.body) });
    const r = respuestas.shift();
    if (r instanceof Error) throw r;
    return { status: r.status ?? 200, text: async () => JSON.stringify(r.body) };
  });
  return { fetchFn, llamadas, cliente: createClient({ url: URL, key: KEY, timeoutMs: 50, fetchFn }) };
}
const ok = (body) => ({ status: 200, body });
const fallo = (message) => ({ status: 400, body: { code: "P0001", message } });
const altaOk = ok([{ token: TOKEN, recovery_code: RECUPERACION }]);
const entradaOk = (role = "alumno", must = false) =>
  ok([{ token: TOKEN, role, must_change_password: must, error: null }]);
const guardado = () => JSON.parse(localStorage.getItem("pipo2.acc"));

beforeEach(() => {
  store.remove("acc");
  store.remove("hadacc");
});

describe("register", () => {
  it("crea la cuenta, entra con ella y devuelve el código de recuperación", async () => {
    const { cliente, llamadas } = servidor(altaOk);
    expect(await cliente.register("alumno", "  pipa.leo8 ", CLAVE)).toEqual({ recoveryCode: RECUPERACION });
    expect(llamadas[0].url).toBe(`${URL}/rest/v1/rpc/account_register`);
    expect(llamadas[0].body).toEqual({ p_role: "alumno", p_username: "pipa.leo8", p_password: CLAVE });
    expect(cliente.account()).toEqual({ role: "alumno", username: "pipa.leo8" });
    expect(store.get("hadacc", false)).toBe(true);
  });
  it("la ficha de acceso solo vive en el navegador: ni account() ni el código de recuperación se guardan", async () => {
    const { cliente } = servidor(altaOk);
    await cliente.register("profe", "marta.lopez", CLAVE);
    expect(guardado()).toEqual({ token: TOKEN, role: "profe", username: "marta.lopez" });
    expect(JSON.stringify(cliente.account())).not.toContain(TOKEN);
    expect(JSON.stringify(Object.entries(localStorage))).not.toContain(RECUPERACION);
  });
  it.each([
    ["admin", "pipa.leo8", CLAVE, "rol_invalido"],
    ["alumno", "ab", CLAVE, "usuario_invalido"],
    ["alumno", "con espacio", CLAVE, "usuario_invalido"],
    ["alumno", "<b>raro</b>", CLAVE, "usuario_invalido"],
    ["alumno", "x".repeat(31), CLAVE, "usuario_invalido"],
    ["alumno", "pipa.leo8", "corta", "contrasena_invalida"],
    ["alumno", "pipa.leo8", "x".repeat(73), "contrasena_invalida"],
  ])("rechaza %s / %s sin llamar al servidor", async (rol, usuario, clave, codigo) => {
    const { cliente, fetchFn } = servidor(altaOk);
    await expect(cliente.register(rol, usuario, clave)).rejects.toMatchObject({
      code: codigo,
      message: MENSAJES[codigo],
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it("un usuario repetido llega con su mensaje y no deja sesión", async () => {
    const { cliente } = servidor(fallo("usuario_en_uso"));
    await expect(cliente.register("alumno", "pipa.leo8", CLAVE)).rejects.toMatchObject({ code: "usuario_en_uso" });
    expect(cliente.account()).toBeNull();
  });
  it.each([
    [[]],
    [[{ token: "corto", recovery_code: RECUPERACION }]],
    [[{ token: TOKEN, recovery_code: "corto" }]],
    [[{ token: TOKEN }]],
    [{ token: TOKEN }],
  ])("rechaza una respuesta mal formada %j", async (cuerpo) => {
    const { cliente } = servidor(ok(cuerpo));
    await expect(cliente.register("alumno", "pipa.leo8", CLAVE)).rejects.toMatchObject({ code: "error_servidor" });
    expect(cliente.account()).toBeNull();
  });
});

describe("login", () => {
  it("entra, guarda la sesión con el usuario tal como se escribió y devuelve el rol", async () => {
    const { cliente, llamadas } = servidor(entradaOk("profe"));
    expect(await cliente.login(" Marta.Lopez ", CLAVE)).toEqual({ role: "profe", mustChange: false });
    expect(llamadas[0].body).toEqual({ p_username: "Marta.Lopez", p_password: CLAVE });
    expect(cliente.account()).toEqual({ role: "profe", username: "Marta.Lopez" });
  });
  it("avisa si hay que cambiar la contraseña (era una temporal)", async () => {
    const { cliente } = servidor(entradaOk("alumno", true));
    expect(await cliente.login("pipa.leo8", "temporal1")).toEqual({ role: "alumno", mustChange: true });
  });
  it.each([["credenciales_invalidas"], ["cuenta_bloqueada"]])(
    "el error %s del servidor llega con su mensaje",
    async (codigo) => {
      const { cliente } = servidor(ok([{ token: null, role: null, must_change_password: null, error: codigo }]));
      await expect(cliente.login("pipa.leo8", CLAVE)).rejects.toMatchObject({
        code: codigo,
        message: MENSAJES[codigo],
      });
      expect(cliente.account()).toBeNull();
    }
  );
  it("un usuario con formato imposible o sin contraseña da «credenciales inválidas» sin llamar al servidor", async () => {
    const { cliente, fetchFn } = servidor(entradaOk());
    await expect(cliente.login("a", CLAVE)).rejects.toMatchObject({ code: "credenciales_invalidas" });
    await expect(cliente.login("pipa.leo8", "")).rejects.toMatchObject({ code: "credenciales_invalidas" });
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it.each([
    [[]],
    [[{ token: "corto", role: "alumno", must_change_password: false, error: null }]],
    [[{ token: TOKEN, role: "admin", must_change_password: false, error: null }]],
    [[{ token: TOKEN, role: "alumno", must_change_password: "no", error: null }]],
  ])("rechaza una respuesta mal formada %j", async (cuerpo) => {
    const { cliente } = servidor(ok(cuerpo));
    await expect(cliente.login("pipa.leo8", CLAVE)).rejects.toMatchObject({ code: "error_servidor" });
    expect(cliente.account()).toBeNull();
  });
  it("sin conexión: sin_conexion y no se toca la sesión anterior", async () => {
    store.set("acc", { token: OTRO, role: "alumno", username: "anterior" });
    const { cliente } = servidor(new TypeError("Failed to fetch"));
    await expect(cliente.login("pipa.leo8", CLAVE)).rejects.toMatchObject({ code: "sin_conexion" });
    expect(cliente.account()).toEqual({ role: "alumno", username: "anterior" });
  });
});

describe("resetPassword", () => {
  it("con el código (escrito como sea) pone la contraseña nueva, entra y devuelve el código nuevo", async () => {
    const { cliente, llamadas } = servidor(
      ok([{ token: TOKEN, recovery_code: OTRO + "01234567", role: "alumno", error: null }])
    );
    const agrupado = RECUPERACION.toUpperCase().replace(/(.{4})/g, "$1-");
    expect(await cliente.resetPassword("pipa.leo8", agrupado, "contraseña nueva")).toEqual({
      role: "alumno",
      recoveryCode: OTRO + "01234567",
    });
    expect(llamadas[0].body).toEqual({
      p_username: "pipa.leo8",
      p_recovery_code: RECUPERACION,
      p_new_password: "contraseña nueva",
    });
    expect(cliente.account()).toEqual({ role: "alumno", username: "pipa.leo8" });
  });
  it("un código que no tiene 40 caracteres hexadecimales no llama al servidor", async () => {
    const { cliente, fetchFn } = servidor();
    await expect(cliente.resetPassword("pipa.leo8", "123", CLAVE)).rejects.toMatchObject({
      code: "credenciales_invalidas",
    });
    await expect(cliente.resetPassword("pipa.leo8", "z".repeat(40), CLAVE)).rejects.toMatchObject({
      code: "credenciales_invalidas",
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it("valida usuario y contraseña nueva antes de llamar", async () => {
    const { cliente, fetchFn } = servidor();
    await expect(cliente.resetPassword("a", RECUPERACION, CLAVE)).rejects.toMatchObject({ code: "usuario_invalido" });
    await expect(cliente.resetPassword("pipa.leo8", RECUPERACION, "corta")).rejects.toMatchObject({
      code: "contrasena_invalida",
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it("un error del servidor no deja sesión", async () => {
    const { cliente } = servidor(ok([{ token: null, recovery_code: null, role: null, error: "cuenta_bloqueada" }]));
    await expect(cliente.resetPassword("pipa.leo8", RECUPERACION, CLAVE)).rejects.toMatchObject({
      code: "cuenta_bloqueada",
    });
    expect(cliente.account()).toBeNull();
  });
});

describe("changePassword", () => {
  beforeEach(() => store.set("acc", { token: TOKEN, role: "alumno", username: "pipa.leo8" }));
  it("envía la ficha de acceso, la contraseña actual y la nueva", async () => {
    const { cliente, llamadas } = servidor(ok(true));
    expect(await cliente.changePassword("temporal1", "contraseña nueva")).toBe(true);
    expect(llamadas[0].body).toEqual({ p_token: TOKEN, p_old: "temporal1", p_new: "contraseña nueva" });
  });
  it("una contraseña nueva corta no llama al servidor", async () => {
    const { cliente, fetchFn } = servidor(ok(true));
    await expect(cliente.changePassword("temporal1", "corta")).rejects.toMatchObject({ code: "contrasena_invalida" });
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it("si la actual no es correcta, lo dice y conserva la sesión", async () => {
    const { cliente } = servidor(fallo("credenciales_invalidas"));
    await expect(cliente.changePassword("mal", "contraseña nueva")).rejects.toMatchObject({
      code: "credenciales_invalidas",
    });
    expect(cliente.account()).not.toBeNull();
  });
  it("si la sesión ya no vale, se olvida", async () => {
    const { cliente } = servidor(fallo("sesion_no_valida"));
    await expect(cliente.changePassword("a", "contraseña nueva")).rejects.toMatchObject({ code: "sesion_no_valida" });
    expect(cliente.account()).toBeNull();
  });
  it("sin sesión: sesion_no_valida sin llamar al servidor", async () => {
    store.remove("acc");
    const { cliente, fetchFn } = servidor();
    await expect(cliente.changePassword("a", "contraseña nueva")).rejects.toMatchObject({ code: "sesion_no_valida" });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("logout", () => {
  beforeEach(() => store.set("acc", { token: TOKEN, role: "alumno", username: "pipa.leo8" }));
  it("avisa al servidor y olvida la sesión", async () => {
    const { cliente, llamadas } = servidor(ok(true));
    await cliente.logout();
    expect(llamadas[0].body).toEqual({ p_token: TOKEN });
    expect(cliente.account()).toBeNull();
  });
  it("sin conexión cierra igualmente en este navegador", async () => {
    const { cliente } = servidor(new TypeError("Failed to fetch"));
    await expect(cliente.logout()).resolves.toBeUndefined();
    expect(cliente.account()).toBeNull();
  });
  it("sin sesión no hace nada ni llama al servidor", async () => {
    store.remove("acc");
    const { cliente, fetchFn } = servidor();
    await cliente.logout();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("lo guardado de la cuenta en localStorage", () => {
  const put = (v) => localStorage.setItem("pipo2.acc", JSON.stringify(v));
  it.each([
    [{ token: "corto", role: "alumno", username: "pipa.leo8" }],
    [{ token: TOKEN, role: "admin", username: "pipa.leo8" }],
    [{ token: TOKEN, role: "alumno", username: "a" }],
    [{ token: TOKEN, role: "alumno", username: "<b>raro</b>" }],
    [{ token: TOKEN, role: "alumno" }],
    ["texto"],
    [[1, 2]],
  ])("descarta una sesión manipulada: %j", (v) => {
    put(v);
    expect(store.get("acc", null)).toBeNull();
  });
  it("conserva una sesión válida", () => {
    put({ token: TOKEN, role: "profe", username: "Marta.Lopez" });
    expect(store.get("acc", null)).toEqual({ token: TOKEN, role: "profe", username: "Marta.Lopez" });
  });
});
