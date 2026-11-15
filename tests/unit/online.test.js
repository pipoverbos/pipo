// Clases, retos, ranking y progreso en el módulo de conexión, con la sesión de la cuenta.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient, cleanCode, MENSAJES, OnlineError } from "../../js/online.js";
import { store } from "../../js/store.js";

const URL = "https://ejemplo.supabase.co";
const KEY = "sb_publishable_prueba";
const TOKEN = "0123456789abcdef0123456789abcdef";

/** Servidor falso: cada llamada devuelve la siguiente respuesta {status, body} (o lanza si es un Error). */
function servidor(...respuestas) {
  const llamadas = [];
  const fetchFn = vi.fn(async (url, init) => {
    llamadas.push({ url, init, body: JSON.parse(init.body) });
    const r = respuestas.shift();
    if (r instanceof Error) throw r;
    return {
      status: r.status ?? 200,
      text: async () => (typeof r.body === "string" ? r.body : JSON.stringify(r.body)),
    };
  });
  return { fetchFn, llamadas, cliente: createClient({ url: URL, key: KEY, timeoutMs: 50, fetchFn }) };
}
const ok = (body) => ({ status: 200, body });
const fallo = (message) => ({ status: 400, body: { code: "P0001", message } });
const alumno = () => store.set("acc", { token: TOKEN, role: "alumno", username: "pipa.leo8" });
const CLASE = {
  code: "ABC234",
  name: "1ºA",
  alias: "Pipa",
  kind: "aula",
  owner: false,
  lists: [1, 2],
  diffs: ["easy", "normal"],
};
const dentro = (extra = {}) => store.set("cls", { ...CLASE, ...extra });
const FILA = {
  code: "ABC234",
  name: "1ºA",
  alias: "Pipa",
  kind: "aula",
  allowed_lists: [1, 2],
  allowed_difficulties: ["easy", "normal"],
  is_owner: false,
};

beforeEach(() => {
  store.remove("cls");
  store.remove("acc");
  alumno();
});

describe("cleanCode", () => {
  it("pasa a mayúsculas y quita espacios", () => expect(cleanCode(" abc 234 ")).toBe("ABC234"));
  it.each(["", "ABC23", "ABC2345", "ABCIO0", "abc-23", null, undefined])("rechaza %j", (c) =>
    expect(cleanCode(c)).toBeNull()
  );
});

describe("la petición", () => {
  it("va por POST a /rest/v1/rpc/<función> con la clave pública y sin cabecera Authorization", async () => {
    const { cliente, llamadas } = servidor(ok([{ class_name: "1ºA", kind: "aula" }]));
    await cliente.joinClass("abc 234", "Pipa");
    const [l] = llamadas;
    expect(l.url).toBe(`${URL}/rest/v1/rpc/alu_join_class`);
    expect(l.init.method).toBe("POST");
    expect(l.init.headers).toEqual({ apikey: KEY, "Content-Type": "application/json" });
    expect(l.body).toEqual({ p_token: TOKEN, p_code: "ABC234", p_alias: "Pipa" });
  });
});

describe("errores", () => {
  it.each(
    Object.keys(MENSAJES).filter(
      (k) =>
        ![
          "sin_conexion",
          "tiempo_agotado",
          "error_servidor",
          "sin_clase",
          "codigo_invalido",
          "sesion_no_valida",
        ].includes(k)
    )
  )("el código %s del servidor llega con su mensaje en español", async (codigo) => {
    const { cliente } = servidor(fallo(codigo));
    await expect(cliente.joinClass("ABC234", "Pipa")).rejects.toMatchObject({
      code: codigo,
      message: MENSAJES[codigo],
    });
  });
  it("un error desconocido del servidor no filtra su texto", async () => {
    const { cliente } = servidor({ status: 500, body: { message: 'relation "private.x" does not exist' } });
    const e = await cliente.joinClass("ABC234", "Pipa").catch((x) => x);
    expect(e).toBeInstanceOf(OnlineError);
    expect(e.code).toBe("error_servidor");
    expect(e.message).not.toMatch(/relation|private/);
  });
  it("un 429 se trata como «demasiado rápido»", async () => {
    const { cliente } = servidor({ status: 429, body: "Too Many Requests" });
    await expect(cliente.joinClass("ABC234", "Pipa")).rejects.toMatchObject({ code: "demasiado_rapido" });
  });
  it("sin red: sin_conexion", async () => {
    const { cliente } = servidor(new TypeError("Failed to fetch"));
    await expect(cliente.joinClass("ABC234", "Pipa")).rejects.toMatchObject({ code: "sin_conexion" });
  });
  it("si el servidor no contesta a tiempo: tiempo_agotado", async () => {
    const fetchFn = (_u, { signal }) =>
      new Promise((_, rechazar) =>
        signal.addEventListener("abort", () => rechazar(Object.assign(new Error("abortado"), { name: "AbortError" })))
      );
    const cliente = createClient({ url: URL, key: KEY, timeoutMs: 20, fetchFn });
    await expect(cliente.joinClass("ABC234", "Pipa")).rejects.toMatchObject({ code: "tiempo_agotado" });
  });
  it("una respuesta que no es JSON es un error del servidor", async () => {
    const { cliente } = servidor({ status: 200, body: "<html>hola</html>" });
    await expect(cliente.joinClass("ABC234", "Pipa")).rejects.toMatchObject({ code: "error_servidor" });
  });
  it("los mensajes de error nunca contienen la ficha de acceso", async () => {
    dentro();
    const { cliente } = servidor(fallo("partida_imposible"));
    const e = await cliente.submitRun({ level: 0, difficulty: "easy", correct: 5, mistakes: 20 }).catch((x) => x);
    expect(JSON.stringify([e.message, e.code, e.name])).not.toContain(TOKEN);
  });
});

describe("sin sesión", () => {
  it.each([
    ["joinClass", ["ABC234", "Pipa"]],
    ["createChallenge", ["Reto", "Pipa"]],
    ["submitRun", [{ level: 0, difficulty: "easy", correct: 5, mistakes: 0 }]],
    ["leaveClass", []],
    ["deleteChallenge", []],
    ["saveProgress", [{}]],
    ["me", []],
    ["deleteAccount", ["una contraseña"]],
  ])("%s pide entrar y no llama al servidor", async (metodo, args) => {
    store.remove("acc");
    dentro({ owner: true });
    const { cliente, fetchFn } = servidor(ok(true));
    await expect(cliente[metodo](...args)).rejects.toMatchObject({ code: "sesion_no_valida" });
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it("si el servidor dice que la sesión no vale, se olvidan la cuenta y la clase de este navegador", async () => {
    dentro();
    const { cliente } = servidor(fallo("sesion_no_valida"));
    await expect(cliente.leaveClass()).rejects.toMatchObject({ code: "sesion_no_valida" });
    expect(cliente.account()).toBeNull();
    expect(cliente.session()).toBeNull();
  });
});

describe("createChallenge", () => {
  it("crea el reto con la sesión, entra en él como dueño y devuelve solo datos públicos", async () => {
    const { cliente, llamadas } = servidor(ok([{ code: "ABC234", class_name: "Los de 1ºB" }]));
    expect(await cliente.createChallenge("Los de 1ºB", " Pipa ")).toEqual({
      code: "ABC234",
      name: "Los de 1ºB",
      alias: "Pipa",
    });
    expect(llamadas[0].url).toBe(`${URL}/rest/v1/rpc/alu_create_challenge`);
    expect(llamadas[0].body).toEqual({ p_token: TOKEN, p_name: "Los de 1ºB", p_alias: "Pipa" });
    expect(cliente.session()).toEqual({
      code: "ABC234",
      name: "Los de 1ºB",
      alias: "Pipa",
      kind: "reto",
      isOwner: true,
      lists: [1, 2, 3, 4, 5, 6],
      diffs: ["easy", "normal", "hard"],
    });
  });
  it("un apodo inválido ni siquiera llama al servidor", async () => {
    const { cliente, fetchFn } = servidor(ok([]));
    await expect(cliente.createChallenge("x", "<b>")).rejects.toMatchObject({ code: "apodo_invalido" });
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it.each([[[]], [[{ code: "mal", class_name: "x" }]], [[{ code: "ABC234", class_name: "" }]], [{ code: "ABC234" }]])(
    "rechaza una respuesta mal formada %j",
    async (cuerpo) => {
      const { cliente } = servidor(ok(cuerpo));
      await expect(cliente.createChallenge("x", "Pipa")).rejects.toMatchObject({ code: "error_servidor" });
      expect(cliente.session()).toBeNull();
    }
  );
});

describe("joinClass", () => {
  const RESP = {
    class_name: "1ºA",
    alias: "Pipa",
    kind: "aula",
    allowed_lists: [1, 2],
    allowed_difficulties: ["easy"],
  };
  it("entra y recuerda la clase con sus ajustes", async () => {
    const { cliente } = servidor(ok([RESP]));
    expect(await cliente.joinClass(" abc 234 ", " Pipa ")).toEqual({ code: "ABC234", name: "1ºA", alias: "Pipa" });
    expect(cliente.session()).toEqual({
      code: "ABC234",
      name: "1ºA",
      alias: "Pipa",
      kind: "aula",
      isOwner: false,
      lists: [1, 2],
      diffs: ["easy"],
    });
  });
  it("un código o un apodo inválidos no llaman al servidor", async () => {
    const { cliente, fetchFn } = servidor(ok([RESP]));
    await expect(cliente.joinClass("ABC", "Pipa")).rejects.toMatchObject({ code: "codigo_invalido" });
    await expect(cliente.joinClass("ABC234", "<b>")).rejects.toMatchObject({ code: "apodo_invalido" });
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it.each([[[]], [[{ ...RESP, class_name: "" }]], [[{ ...RESP, kind: "otro" }]], [{}]])(
    "rechaza una respuesta mal formada %j",
    async (cuerpo) => {
      const { cliente } = servidor(ok(cuerpo));
      await expect(cliente.joinClass("ABC234", "Pipa")).rejects.toMatchObject({ code: "error_servidor" });
      expect(cliente.session()).toBeNull();
    }
  );
  it("un fallo no deja a medias la clase anterior", async () => {
    dentro();
    const { cliente } = servidor(fallo("clase_llena"));
    await expect(cliente.joinClass("ZZZ222", "Pipa")).rejects.toMatchObject({ code: "clase_llena" });
    expect(cliente.session().code).toBe("ABC234");
  });
});

describe("refreshClass", () => {
  it("copia lo que dice el servidor, incluido si es dueño", async () => {
    const { cliente, llamadas } = servidor(ok([{ ...FILA, kind: "reto", is_owner: true }]));
    expect(await cliente.refreshClass()).toMatchObject({ code: "ABC234", kind: "reto", isOwner: true });
    expect(llamadas[0].body).toEqual({ p_token: TOKEN });
  });
  it("si el servidor dice que ya no está en ninguna clase, se olvida la copia", async () => {
    dentro();
    const { cliente } = servidor(ok([]));
    expect(await cliente.refreshClass()).toBeNull();
    expect(cliente.session()).toBeNull();
  });
  it("sin conexión conserva la copia", async () => {
    dentro();
    const { cliente } = servidor(new TypeError("Failed to fetch"));
    await expect(cliente.refreshClass()).rejects.toMatchObject({ code: "sin_conexion" });
    expect(cliente.session()).not.toBeNull();
  });
  it("un profesor no tiene «clase de alumno» y no llama al servidor", async () => {
    store.set("acc", { token: TOKEN, role: "profe", username: "marta.lopez" });
    const { cliente, fetchFn } = servidor(ok([]));
    expect(await cliente.refreshClass()).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it.each([[{}], [[FILA, FILA]], [[{ ...FILA, kind: "otro" }]]])(
    "rechaza una respuesta mal formada %j",
    async (cuerpo) => {
      const { cliente } = servidor(ok(cuerpo));
      await expect(cliente.refreshClass()).rejects.toMatchObject({ code: "error_servidor" });
    }
  );
});

describe("submitRun", () => {
  beforeEach(() => dentro());
  it("envía la partida con la ficha de acceso y devuelve lo que calcula el servidor", async () => {
    const { cliente, llamadas } = servidor(ok([{ points: 340, stars: 3 }]));
    expect(await cliente.submitRun({ level: 1, difficulty: "normal", correct: 24, mistakes: 0 })).toEqual({
      points: 340,
      stars: 3,
    });
    expect(llamadas[0].url).toBe(`${URL}/rest/v1/rpc/alu_submit_run`);
    expect(llamadas[0].body).toEqual({
      p_token: TOKEN,
      p_level: 1,
      p_difficulty: "normal",
      p_correct: 24,
      p_mistakes: 0,
      p_misses: null,
    });
  });
  it("manda los verbos fallados cuando se le dan (clases de aula)", async () => {
    const { cliente, llamadas } = servidor(ok([{ points: 1, stars: 1 }]));
    await cliente.submitRun({ level: 0, difficulty: "easy", correct: 10, mistakes: 2, misses: ["go", "be"] });
    expect(llamadas[0].body.p_misses).toEqual(["go", "be"]);
  });
  it("sin clase: sin_clase y sin llamar al servidor", async () => {
    store.remove("cls");
    const { cliente, fetchFn } = servidor(ok([]));
    await expect(cliente.submitRun({ level: 0, difficulty: "easy", correct: 5, mistakes: 0 })).rejects.toMatchObject({
      code: "sin_clase",
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it("si el servidor ya no nos tiene en ninguna clase, se olvida la copia", async () => {
    const { cliente } = servidor(fallo("sin_clase"));
    await expect(cliente.submitRun({ level: 0, difficulty: "easy", correct: 5, mistakes: 0 })).rejects.toMatchObject({
      code: "sin_clase",
    });
    expect(cliente.session()).toBeNull();
  });
  it("conserva la clase si el fallo es de conexión o de la partida", async () => {
    for (const r of [new TypeError("Failed to fetch"), fallo("partida_imposible"), fallo("dificultad_no_permitida")]) {
      const { cliente } = servidor(r);
      await expect(cliente.submitRun({ level: 0, difficulty: "easy", correct: 5, mistakes: 0 })).rejects.toBeInstanceOf(
        OnlineError
      );
      expect(cliente.session()).not.toBeNull();
    }
  });
  it.each([[[]], [[{ points: "x", stars: 3 }]], [[{ points: 10 }]], [{}]])(
    "rechaza una respuesta mal formada %j",
    async (cuerpo) => {
      const { cliente } = servidor(ok(cuerpo));
      await expect(cliente.submitRun({ level: 0, difficulty: "easy", correct: 5, mistakes: 0 })).rejects.toMatchObject({
        code: "error_servidor",
      });
    }
  );
});

describe("ranking", () => {
  it("devuelve alias, puntos y niveles de la clase de este navegador", async () => {
    dentro();
    const { cliente, llamadas } = servidor(ok([{ alias: "Pipa", points: 340, levels: 1 }]));
    expect(await cliente.ranking()).toEqual([{ alias: "Pipa", points: 340, levels: 1 }]);
    expect(llamadas[0].body).toEqual({ p_code: "ABC234" });
  });
  it("sin clase y sin código: sin_clase; con un código raro: codigo_invalido", async () => {
    const { cliente, fetchFn } = servidor(ok([]));
    await expect(cliente.ranking()).rejects.toMatchObject({ code: "sin_clase" });
    await expect(cliente.ranking("mal")).rejects.toMatchObject({ code: "codigo_invalido" });
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it("no necesita sesión (el ranking es público)", async () => {
    store.remove("acc");
    const { cliente } = servidor(ok([{ alias: "Ana", points: 1, levels: 1 }]));
    await expect(cliente.ranking("ABC234")).resolves.toHaveLength(1);
  });
  it.each([[{}], [[{ alias: 1, points: 1, levels: 1 }]], [[{ alias: "a", points: -1, levels: 1 }]]])(
    "rechaza una respuesta mal formada %j",
    async (cuerpo) => {
      const { cliente } = servidor(ok(cuerpo));
      await expect(cliente.ranking("ABC234")).rejects.toMatchObject({ code: "error_servidor" });
    }
  );
});

describe("leaveClass", () => {
  beforeEach(() => dentro());
  it("sale en el servidor y olvida la copia", async () => {
    const { cliente, llamadas } = servidor(ok(true));
    expect(await cliente.leaveClass()).toBe(true);
    expect(llamadas[0].body).toEqual({ p_token: TOKEN });
    expect(cliente.session()).toBeNull();
  });
  it("si el servidor dice que no había nada, ya estaba fuera: se olvida igualmente", async () => {
    const { cliente } = servidor(ok(false));
    expect(await cliente.leaveClass()).toBe(false);
    expect(cliente.session()).toBeNull();
  });
  it("sin conexión conserva la clase para poder reintentarlo", async () => {
    const { cliente } = servidor(new TypeError("Failed to fetch"));
    await expect(cliente.leaveClass()).rejects.toMatchObject({ code: "sin_conexion" });
    expect(cliente.session()).not.toBeNull();
  });
  it("sin clase: sin_clase", async () => {
    store.remove("cls");
    await expect(servidor().cliente.leaveClass()).rejects.toMatchObject({ code: "sin_clase" });
  });
});

describe("deleteChallenge", () => {
  it("el dueño envía el código de su reto y olvida la copia", async () => {
    dentro({ kind: "reto", owner: true });
    const { cliente, llamadas } = servidor(ok(true));
    expect(await cliente.deleteChallenge()).toBe(true);
    expect(llamadas[0].url).toBe(`${URL}/rest/v1/rpc/alu_delete_challenge`);
    expect(llamadas[0].body).toEqual({ p_token: TOKEN, p_code: "ABC234" });
    expect(cliente.session()).toBeNull();
  });
  it("quien no es el dueño no llama al servidor", async () => {
    dentro({ kind: "reto", owner: false });
    const { cliente, fetchFn } = servidor(ok(true));
    await expect(cliente.deleteChallenge()).rejects.toMatchObject({ code: "sin_clase" });
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it("sin conexión conserva todo para reintentar", async () => {
    dentro({ kind: "reto", owner: true });
    const { cliente } = servidor(new TypeError("Failed to fetch"));
    await expect(cliente.deleteChallenge()).rejects.toMatchObject({ code: "sin_conexion" });
    expect(cliente.session()).not.toBeNull();
  });
});

describe("progreso y cuenta", () => {
  it("saveProgress envía el progreso con la ficha de acceso", async () => {
    const { cliente, llamadas } = servidor(ok(true));
    await cliente.saveProgress({ diff: "hard" });
    expect(llamadas[0].url).toBe(`${URL}/rest/v1/rpc/alu_save_progress`);
    expect(llamadas[0].body).toEqual({ p_token: TOKEN, p_progress: { diff: "hard" } });
  });
  it("saveProgress rechaza una respuesta que no sea true", async () => {
    const { cliente } = servidor(ok("no"));
    await expect(cliente.saveProgress({})).rejects.toMatchObject({ code: "error_servidor" });
  });
  it("me devuelve el progreso de la cuenta", async () => {
    const { cliente } = servidor(
      ok([{ role: "alumno", username: "pipa.leo8", progress: { diff: "hard" }, must_change_password: false }])
    );
    expect(await cliente.me()).toEqual({
      role: "alumno",
      username: "pipa.leo8",
      progress: { diff: "hard" },
      mustChange: false,
    });
  });
  it.each([
    [[]],
    [[{ role: "x", username: "a", progress: {} }]],
    [[{ role: "alumno", username: "a", progress: [1] }]],
    [{}],
  ])("me rechaza una respuesta mal formada %j", async (cuerpo) => {
    const { cliente } = servidor(ok(cuerpo));
    await expect(cliente.me()).rejects.toMatchObject({ code: "error_servidor" });
  });
  it("deleteAccount pide la contraseña y olvida la cuenta y la clase", async () => {
    dentro();
    const { cliente, llamadas } = servidor(ok(true));
    expect(await cliente.deleteAccount("una contraseña")).toBe(true);
    expect(llamadas[0].body).toEqual({ p_token: TOKEN, p_password: "una contraseña" });
    expect(cliente.account()).toBeNull();
    expect(cliente.session()).toBeNull();
  });
  it("deleteAccount con la contraseña mal no borra nada de este navegador", async () => {
    dentro();
    const { cliente } = servidor(fallo("credenciales_invalidas"));
    await expect(cliente.deleteAccount("mal")).rejects.toMatchObject({ code: "credenciales_invalidas" });
    expect(cliente.account()).not.toBeNull();
    expect(cliente.session()).not.toBeNull();
  });
});

describe("lo guardado de la clase en localStorage", () => {
  const put = (v) => localStorage.setItem("pipo2.cls", JSON.stringify(v));
  it.each([
    [{ ...CLASE, code: "abc234" }],
    [{ ...CLASE, name: "" }],
    [{ ...CLASE, alias: "<b>" }],
    [{ ...CLASE, kind: "otro" }],
    [{ ...CLASE, owner: "si" }],
    [{ ...CLASE, lists: [] }],
    [{ ...CLASE, lists: [7] }],
    [{ ...CLASE, diffs: ["imposible"] }],
    [{ ...CLASE, diffs: [] }],
    [{ code: "ABC234", name: "1ºA", alias: "Pipa" }],
    [{ code: "ABC234", name: "1ºA", alias: "Pipa", id: "x", secret: TOKEN }],
    ["texto"],
  ])("descarta una clase manipulada o del sistema antiguo: %j", (v) => {
    store.remove("cls");
    put(v);
    expect(store.get("cls", null)).toBeNull();
  });
  it("conserva una clase válida", () => {
    store.remove("cls");
    put(CLASE);
    expect(store.get("cls", null)).toEqual(CLASE);
  });
});
