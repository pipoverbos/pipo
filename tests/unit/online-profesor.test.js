// Panel del profesor en el módulo de conexión: clases, ajustes, seguimiento y gestión de alumnos.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient, MENSAJES } from "../../js/online.js";
import { store } from "../../js/store.js";

const URL = "https://ejemplo.supabase.co";
const KEY = "sb_publishable_prueba";
const TOKEN = "0123456789abcdef0123456789abcdef";

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
const profe = () => store.set("acc", { token: TOKEN, role: "profe", username: "marta.lopez" });

const CLASE = {
  code: "ABC234",
  name: "1º A",
  players: 3,
  last_run: "2026-11-18T10:00:00+00:00",
  allowed_lists: [1, 2, 3],
  allowed_difficulties: ["easy", "normal"],
  created_at: "2026-11-01T10:00:00+00:00",
};

beforeEach(() => {
  store.remove("acc");
  store.remove("cls");
  profe();
});

describe("quién puede usarlo", () => {
  const llamadas = [
    ["profClasses", []],
    ["profCreateClass", ["1º A"]],
    ["profSetConfig", ["ABC234", [1], ["easy"]]],
    ["profProgress", ["ABC234"]],
    ["profMisses", ["ABC234"]],
    ["profRemoveStudent", ["ABC234", "Ana"]],
    ["profResetStudent", ["ABC234", "Ana"]],
    ["profDeleteClass", ["ABC234"]],
  ];
  it.each(llamadas)("%s sin sesión pide entrar y no llama al servidor", async (metodo, args) => {
    store.remove("acc");
    const { cliente, fetchFn } = servidor(ok([]));
    await expect(cliente[metodo](...args)).rejects.toMatchObject({ code: "sesion_no_valida" });
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it.each(llamadas)("%s con una sesión de alumno no llama al servidor", async (metodo, args) => {
    store.set("acc", { token: TOKEN, role: "alumno", username: "pipa.leo8" });
    const { cliente, fetchFn } = servidor(ok([]));
    await expect(cliente[metodo](...args)).rejects.toMatchObject({ code: "rol_no_permitido" });
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it("si el servidor dice que la sesión no vale, se olvida", async () => {
    const { cliente } = servidor(fallo("sesion_no_valida"));
    await expect(cliente.profClasses()).rejects.toMatchObject({ code: "sesion_no_valida" });
    expect(cliente.account()).toBeNull();
  });
});

describe("profClasses", () => {
  it("devuelve las clases con la ficha de acceso en la petición", async () => {
    const { cliente, llamadas } = servidor(ok([CLASE, { ...CLASE, code: "DEF567", last_run: null, players: 0 }]));
    const r = await cliente.profClasses();
    expect(llamadas[0].url).toBe(`${URL}/rest/v1/rpc/prof_classes`);
    expect(llamadas[0].body).toEqual({ p_token: TOKEN });
    expect(r[0]).toEqual({
      code: "ABC234",
      name: "1º A",
      players: 3,
      lastRun: "2026-11-18T10:00:00+00:00",
      lists: [1, 2, 3],
      diffs: ["easy", "normal"],
    });
    expect(r[1]).toMatchObject({ code: "DEF567", players: 0, lastRun: null });
  });
  it.each([
    [{}],
    [[{ ...CLASE, code: "mal" }]],
    [[{ ...CLASE, name: "" }]],
    [[{ ...CLASE, players: -1 }]],
    [[{ ...CLASE, last_run: 5 }]],
    [[{ ...CLASE, allowed_lists: [] }]],
    [[{ ...CLASE, allowed_lists: [7] }]],
    [[{ ...CLASE, allowed_difficulties: ["imposible"] }]],
  ])("rechaza una respuesta mal formada %j", async (cuerpo) => {
    const { cliente } = servidor(ok(cuerpo));
    await expect(cliente.profClasses()).rejects.toMatchObject({ code: "error_servidor" });
  });
});

describe("profCreateClass", () => {
  it("crea la clase y devuelve su código", async () => {
    const { cliente, llamadas } = servidor(ok([{ code: "ABC234", name: "1º A" }]));
    expect(await cliente.profCreateClass("1º A")).toEqual({ code: "ABC234", name: "1º A" });
    expect(llamadas[0].body).toEqual({ p_token: TOKEN, p_name: "1º A" });
  });
  it.each(["nombre_invalido", "demasiadas_clases", "sin_codigo_libre"])(
    "el error %s llega con su mensaje",
    async (codigo) => {
      const { cliente } = servidor(fallo(codigo));
      await expect(cliente.profCreateClass("x")).rejects.toMatchObject({ code: codigo, message: MENSAJES[codigo] });
    }
  );
  it.each([[[]], [[{ code: "mal", name: "x" }]], [[{ code: "ABC234", name: "" }]]])(
    "rechaza una respuesta mal formada %j",
    async (cuerpo) => {
      const { cliente } = servidor(ok(cuerpo));
      await expect(cliente.profCreateClass("x")).rejects.toMatchObject({ code: "error_servidor" });
    }
  );
});

describe("profSetConfig", () => {
  it("envía las listas y las dificultades", async () => {
    const { cliente, llamadas } = servidor(ok(true));
    expect(await cliente.profSetConfig(" abc 234 ", [1, 3], ["easy", "hard"])).toBe(true);
    expect(llamadas[0].body).toEqual({
      p_token: TOKEN,
      p_code: "ABC234",
      p_lists: [1, 3],
      p_difficulties: ["easy", "hard"],
    });
  });
  it.each([
    ["ABC234", [], ["easy"]],
    ["ABC234", [1], []],
    ["ABC234", [0], ["easy"]],
    ["ABC234", [7], ["easy"]],
    ["ABC234", [1.5], ["easy"]],
    ["ABC234", [1], ["imposible"]],
    ["ABC234", null, ["easy"]],
  ])("rechaza %j / %j / %j sin llamar al servidor", async (codigo, listas, dificultades) => {
    const { cliente, fetchFn } = servidor(ok(true));
    await expect(cliente.profSetConfig(codigo, listas, dificultades)).rejects.toMatchObject({
      code: "configuracion_invalida",
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it("un código mal escrito no llama al servidor", async () => {
    const { cliente, fetchFn } = servidor(ok(true));
    await expect(cliente.profSetConfig("mal", [1], ["easy"])).rejects.toMatchObject({ code: "codigo_invalido" });
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it("rechaza una respuesta que no sea true", async () => {
    const { cliente } = servidor(ok("no"));
    await expect(cliente.profSetConfig("ABC234", [1], ["easy"])).rejects.toMatchObject({ code: "error_servidor" });
  });
});

describe("profProgress y profMisses", () => {
  const FILA = {
    alias: "Ana",
    level: 0,
    difficulty: "normal",
    plays: 2,
    best_stars: 3,
    best_points: 438,
    last_played: "2026-11-18T10:00:00+00:00",
  };
  const SIN_JUGAR = {
    alias: "Zoe",
    level: null,
    difficulty: null,
    plays: 0,
    best_stars: null,
    best_points: null,
    last_played: null,
  };
  it("devuelve una fila por alumno y combinación, incluidos los que aún no han jugado", async () => {
    const { cliente, llamadas } = servidor(ok([FILA, SIN_JUGAR]));
    const r = await cliente.profProgress("abc234");
    expect(llamadas[0].url).toBe(`${URL}/rest/v1/rpc/prof_progress`);
    expect(llamadas[0].body).toEqual({ p_token: TOKEN, p_code: "ABC234" });
    expect(r).toEqual([
      {
        alias: "Ana",
        level: 0,
        difficulty: "normal",
        plays: 2,
        stars: 3,
        points: 438,
        last: "2026-11-18T10:00:00+00:00",
      },
      { alias: "Zoe", level: null, difficulty: null, plays: 0, stars: null, points: null, last: null },
    ]);
  });
  it.each([
    [{}],
    [[{ ...FILA, alias: 1 }]],
    [[{ ...FILA, plays: -1 }]],
    [[{ ...FILA, level: 5 }]],
    [[{ ...FILA, difficulty: "imposible" }]],
    [[{ ...FILA, best_stars: 4 }]],
    [[{ ...FILA, best_stars: 0 }]],
    [[{ ...FILA, best_points: "x" }]],
    [[{ ...FILA, last_played: 3 }]],
  ])("profProgress rechaza una respuesta mal formada %j", async (cuerpo) => {
    const { cliente } = servidor(ok(cuerpo));
    await expect(cliente.profProgress("ABC234")).rejects.toMatchObject({ code: "error_servidor" });
  });
  it("profMisses devuelve alumno, verbo y veces", async () => {
    const { cliente, llamadas } = servidor(ok([{ alias: "Ana", verb: "go", times: 3 }]));
    expect(await cliente.profMisses("ABC234")).toEqual([{ alias: "Ana", verb: "go", times: 3 }]);
    expect(llamadas[0].url).toBe(`${URL}/rest/v1/rpc/prof_misses`);
  });
  it.each([
    [{}],
    [[{ alias: "Ana", verb: 1, times: 3 }]],
    [[{ alias: "Ana", verb: "go", times: -1 }]],
    [[{ verb: "go", times: 1 }]],
  ])("profMisses rechaza una respuesta mal formada %j", async (cuerpo) => {
    const { cliente } = servidor(ok(cuerpo));
    await expect(cliente.profMisses("ABC234")).rejects.toMatchObject({ code: "error_servidor" });
  });
});

describe("gestión de alumnos y de la clase", () => {
  it("quitar a un alumno envía código y apodo y dice si había alguien", async () => {
    const { cliente, llamadas } = servidor(ok(true), ok(false));
    expect(await cliente.profRemoveStudent("ABC234", "Ana")).toBe(true);
    expect(llamadas[0].body).toEqual({ p_token: TOKEN, p_code: "ABC234", p_alias: "Ana" });
    expect(await cliente.profRemoveStudent("ABC234", "Nadie")).toBe(false);
  });
  it("restablecer la contraseña devuelve la temporal (8 caracteres legibles)", async () => {
    const { cliente, llamadas } = servidor(ok("k3m9x2ab"));
    expect(await cliente.profResetStudent("ABC234", "Ana")).toBe("k3m9x2ab");
    expect(llamadas[0].url).toBe(`${URL}/rest/v1/rpc/prof_reset_student`);
  });
  it.each(["corta", "k3m9x2abc", "K3M9X2AB", "k3m9x2a!", 12345678, null, ["k3m9x2ab"]])(
    "rechaza una contraseña temporal con mala forma: %j",
    async (cuerpo) => {
      const { cliente } = servidor(ok(cuerpo));
      await expect(cliente.profResetStudent("ABC234", "Ana")).rejects.toMatchObject({ code: "error_servidor" });
    }
  );
  it.each(["alumno_no_existe", "alumno_sin_cuenta", "clase_no_existe"])(
    "el error %s llega con su mensaje",
    async (codigo) => {
      const { cliente } = servidor(fallo(codigo));
      await expect(cliente.profResetStudent("ABC234", "Ana")).rejects.toMatchObject({
        code: codigo,
        message: MENSAJES[codigo],
      });
    }
  );
  it("borrar la clase", async () => {
    const { cliente, llamadas } = servidor(ok(true));
    expect(await cliente.profDeleteClass("ABC234")).toBe(true);
    expect(llamadas[0].body).toEqual({ p_token: TOKEN, p_code: "ABC234" });
  });
  it("sin conexión conserva la sesión y avisa", async () => {
    const { cliente } = servidor(new TypeError("Failed to fetch"));
    await expect(cliente.profDeleteClass("ABC234")).rejects.toMatchObject({ code: "sin_conexion" });
    expect(cliente.account()).not.toBeNull();
  });
});
