import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient, cleanCode, MENSAJES, OnlineError } from "../../js/online.js";
import { store } from "../../js/store.js";

const URL = "https://ejemplo.supabase.co";
const KEY = "sb_publishable_prueba";
const ID = "123e4567-e89b-42d3-a456-426614174000";
const SECRETO = "0123456789abcdef0123456789abcdef";
const PROFE = "fedcba9876543210fedcba9876543210";

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
const RETO = { code: "ABC234", teacher_secret: PROFE, player_id: ID, player_secret: SECRETO, class_name: "Los de 1ºB" };
const fallo = (message) => ({ status: 400, body: { code: "P0001", message } });
const dentro = () => store.set("cls", { code: "ABC234", name: "1ºA", alias: "Pipa", id: ID, secret: SECRETO });

beforeEach(() => {
  store.remove("cls");
  store.remove("teach");
});

describe("cleanCode", () => {
  it("pasa a mayúsculas y quita espacios", () => expect(cleanCode(" abc 234 ")).toBe("ABC234"));
  it.each(["", "ABC23", "ABC2345", "ABCIO0", "abc-23", null, undefined])("rechaza %j", (c) =>
    expect(cleanCode(c)).toBeNull()
  );
});

describe("la petición", () => {
  it("va por POST a /rest/v1/rpc/<función> con la clave pública y sin cabecera Authorization", async () => {
    const { cliente, llamadas } = servidor(ok([RETO]));
    await cliente.createChallenge("1ºA", "Pipa");
    const [l] = llamadas;
    expect(l.url).toBe(`${URL}/rest/v1/rpc/create_challenge`);
    expect(l.init.method).toBe("POST");
    expect(l.init.headers).toEqual({ apikey: KEY, "Content-Type": "application/json" });
    expect(l.body).toEqual({ p_name: "1ºA", p_alias: "Pipa" });
  });
});

describe("errores", () => {
  it.each(
    Object.keys(MENSAJES).filter(
      (k) => !["sin_conexion", "tiempo_agotado", "error_servidor", "sin_clase", "codigo_invalido"].includes(k)
    )
  )("el código %s del servidor llega con su mensaje en español", async (codigo) => {
    const { cliente } = servidor(fallo(codigo));
    await expect(cliente.createChallenge("x", "Pipa")).rejects.toMatchObject({
      code: codigo,
      message: MENSAJES[codigo],
    });
  });
  it("un error desconocido del servidor no filtra su texto", async () => {
    const { cliente } = servidor({ status: 500, body: { message: 'relation "private.x" does not exist' } });
    const e = await cliente.createChallenge("x", "Pipa").catch((x) => x);
    expect(e).toBeInstanceOf(OnlineError);
    expect(e.code).toBe("error_servidor");
    expect(e.message).not.toMatch(/relation|private/);
  });
  it("un 429 se trata como «demasiado rápido»", async () => {
    const { cliente } = servidor({ status: 429, body: "Too Many Requests" });
    await expect(cliente.createChallenge("x", "Pipa")).rejects.toMatchObject({ code: "demasiado_rapido" });
  });
  it("sin red: sin_conexion", async () => {
    const { cliente } = servidor(new TypeError("Failed to fetch"));
    await expect(cliente.createChallenge("x", "Pipa")).rejects.toMatchObject({ code: "sin_conexion" });
  });
  it("si el servidor no contesta a tiempo: tiempo_agotado", async () => {
    const fetchFn = (_u, { signal }) =>
      new Promise((_, rechazar) =>
        signal.addEventListener("abort", () => rechazar(Object.assign(new Error("abortado"), { name: "AbortError" })))
      );
    const cliente = createClient({ url: URL, key: KEY, timeoutMs: 20, fetchFn });
    await expect(cliente.createChallenge("x", "Pipa")).rejects.toMatchObject({ code: "tiempo_agotado" });
  });
  it("una respuesta que no es JSON es un error del servidor", async () => {
    const { cliente } = servidor({ status: 200, body: "<html>hola</html>" });
    await expect(cliente.createChallenge("x", "Pipa")).rejects.toMatchObject({ code: "error_servidor" });
  });
  it("los mensajes de error nunca contienen secretos", async () => {
    dentro();
    const { cliente } = servidor(fallo("partida_imposible"));
    const e = await cliente.submitRun({ level: 0, difficulty: "easy", correct: 5, mistakes: 20 }).catch((x) => x);
    expect(JSON.stringify([e.message, e.code, e.name])).not.toContain(SECRETO);
  });
});

describe("createChallenge", () => {
  it("entra en el reto y guarda la clave de quien lo crea; devuelve solo datos públicos", async () => {
    const { cliente } = servidor(ok([RETO]));
    expect(await cliente.createChallenge("Los de 1ºB", " Pipa ")).toEqual({
      code: "ABC234",
      name: "Los de 1ºB",
      alias: "Pipa",
    });
    expect(cliente.challengeOwner()).toEqual({ code: "ABC234", secret: PROFE });
    expect(cliente.session()).toEqual({ code: "ABC234", name: "Los de 1ºB", alias: "Pipa" });
    expect(store.get("cls", null).secret).toBe(SECRETO);
  });
  it("un apodo inválido ni siquiera llama al servidor", async () => {
    const { cliente, fetchFn } = servidor(ok([RETO]));
    await expect(cliente.createChallenge("x", "<b>")).rejects.toMatchObject({ code: "apodo_invalido" });
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it.each([
    [[]],
    [[{ ...RETO, code: "mal" }]],
    [[{ ...RETO, teacher_secret: "corto" }]],
    [[{ ...RETO, player_id: "no-uuid" }]],
    [[{ ...RETO, player_secret: "corto" }]],
    [[{ ...RETO, class_name: "" }]],
    [[{ ...RETO, class_name: "x".repeat(41) }]],
    [{ code: "ABC234" }],
  ])("rechaza una respuesta mal formada %j", async (cuerpo) => {
    const { cliente } = servidor(ok(cuerpo));
    await expect(cliente.createChallenge("x", "Pipa")).rejects.toMatchObject({ code: "error_servidor" });
    expect(cliente.challengeOwner()).toBeNull();
    expect(cliente.session()).toBeNull();
  });
});

describe("joinClass", () => {
  it("normaliza el código y el apodo, y recuerda la clase sin exponer el secreto", async () => {
    const { cliente, llamadas } = servidor(ok([{ player_id: ID, player_secret: SECRETO, class_name: "1ºA" }]));
    expect(await cliente.joinClass(" abc 234", "  Pipa   Uno ")).toEqual({
      code: "ABC234",
      name: "1ºA",
      alias: "Pipa Uno",
    });
    expect(llamadas[0].body).toEqual({ p_code: "ABC234", p_alias: "Pipa Uno" });
    expect(cliente.session()).toEqual({ code: "ABC234", name: "1ºA", alias: "Pipa Uno" });
    expect(JSON.stringify(cliente.session())).not.toContain(SECRETO);
    expect(store.get("cls", null)).toEqual({ code: "ABC234", name: "1ºA", alias: "Pipa Uno", id: ID, secret: SECRETO });
  });
  it("no llama al servidor con un código o un apodo imposibles", async () => {
    const { cliente, fetchFn } = servidor();
    await expect(cliente.joinClass("xx", "Pipa")).rejects.toMatchObject({ code: "codigo_invalido" });
    await expect(cliente.joinClass("ABC234", "<b>")).rejects.toMatchObject({ code: "apodo_invalido" });
    await expect(cliente.joinClass("ABC234", "a")).rejects.toMatchObject({ code: "apodo_invalido" });
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it("si el servidor rechaza el apodo, no se guarda nada", async () => {
    const { cliente } = servidor(fallo("apodo_en_uso"));
    await expect(cliente.joinClass("ABC234", "Pipa")).rejects.toMatchObject({ code: "apodo_en_uso" });
    expect(cliente.session()).toBeNull();
  });
  it("rechaza respuestas con identificadores mal formados", async () => {
    const { cliente } = servidor(ok([{ player_id: "1", player_secret: SECRETO, class_name: "1ºA" }]));
    await expect(cliente.joinClass("ABC234", "Pipa")).rejects.toMatchObject({ code: "error_servidor" });
    expect(cliente.session()).toBeNull();
  });
});

describe("submitRun", () => {
  const partida = { level: 2, difficulty: "normal", correct: 20, mistakes: 1 };
  it("envía la partida con las credenciales guardadas y devuelve lo que calcula el servidor", async () => {
    dentro();
    const { cliente, llamadas } = servidor(ok([{ points: 340, stars: 2 }]));
    expect(await cliente.submitRun(partida)).toEqual({ points: 340, stars: 2 });
    expect(llamadas[0].body).toEqual({
      p_player: ID,
      p_secret: SECRETO,
      p_level: 2,
      p_difficulty: "normal",
      p_correct: 20,
      p_mistakes: 1,
    });
  });
  it("sin clase no llama al servidor", async () => {
    const { cliente, fetchFn } = servidor();
    await expect(cliente.submitRun(partida)).rejects.toMatchObject({ code: "sin_clase" });
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it("si el servidor dice que ya no estamos en la clase, se olvida la clase", async () => {
    dentro();
    const { cliente } = servidor(fallo("jugador_no_valido"));
    await expect(cliente.submitRun(partida)).rejects.toMatchObject({ code: "jugador_no_valido" });
    expect(cliente.session()).toBeNull();
  });
  it.each(["sin_conexion", "demasiado_rapido"])("con el fallo temporal %s se conserva la clase", async (codigo) => {
    dentro();
    const { cliente } = servidor(codigo === "sin_conexion" ? new TypeError("x") : fallo(codigo));
    await expect(cliente.submitRun(partida)).rejects.toMatchObject({ code: codigo });
    expect(cliente.session()).not.toBeNull();
  });
  it("rechaza puntos negativos o que no son números", async () => {
    dentro();
    for (const cuerpo of [[{ points: -1, stars: 2 }], [{ points: "9", stars: 2 }], [], [{}]]) {
      const { cliente } = servidor(ok(cuerpo));
      await expect(cliente.submitRun(partida)).rejects.toMatchObject({ code: "error_servidor" });
    }
  });
});

describe("ranking", () => {
  const filas = [
    { alias: "Ana", points: 400, levels: 3 },
    { alias: "Bo", points: 100, levels: 1 },
  ];
  it("por defecto usa la clase de este navegador", async () => {
    dentro();
    const { cliente, llamadas } = servidor(ok(filas));
    expect(await cliente.ranking()).toEqual(filas);
    expect(llamadas[0].body).toEqual({ p_code: "ABC234" });
  });
  it("puede consultar otro código sin estar dentro", async () => {
    const { cliente, llamadas } = servidor(ok(filas));
    await cliente.ranking("def 567");
    expect(llamadas[0].body).toEqual({ p_code: "DEF567" });
  });
  it("sin clase ni código: sin_clase; con un código malo: codigo_invalido", async () => {
    const { cliente, fetchFn } = servidor();
    await expect(cliente.ranking()).rejects.toMatchObject({ code: "sin_clase" });
    await expect(cliente.ranking("mal")).rejects.toMatchObject({ code: "codigo_invalido" });
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it("devuelve solo los campos esperados (descarta lo extra, como identificadores)", async () => {
    dentro();
    const { cliente } = servidor(ok([{ alias: "Ana", points: 1, levels: 1, id: "x", secret_hash: "y" }]));
    expect(await cliente.ranking()).toEqual([{ alias: "Ana", points: 1, levels: 1 }]);
  });
  it("rechaza filas mal formadas y limita a 100", async () => {
    dentro();
    await expect(servidor(ok([{ alias: 5, points: 1, levels: 1 }])).cliente.ranking()).rejects.toMatchObject({
      code: "error_servidor",
    });
    await expect(servidor(ok({ alias: "x" })).cliente.ranking()).rejects.toMatchObject({ code: "error_servidor" });
    const muchas = Array.from({ length: 300 }, (_, i) => ({ alias: "J" + i, points: 1, levels: 1 }));
    expect(await servidor(ok(muchas)).cliente.ranking()).toHaveLength(100);
  });
});

describe("leaveClass", () => {
  it("borra en el servidor y olvida la clase", async () => {
    dentro();
    const { cliente } = servidor(ok(true));
    expect(await cliente.leaveClass()).toBe(true);
    expect(cliente.session()).toBeNull();
  });
  it("sin conexión conserva la clase para poder reintentarlo", async () => {
    dentro();
    const { cliente } = servidor(new TypeError("x"));
    await expect(cliente.leaveClass()).rejects.toMatchObject({ code: "sin_conexion" });
    expect(cliente.session()).not.toBeNull();
  });
  it("si el servidor ya no nos conoce, se olvida igualmente", async () => {
    dentro();
    const { cliente } = servidor(fallo("jugador_no_valido"));
    await cliente.leaveClass();
    expect(cliente.session()).toBeNull();
  });
  it("si el servidor contesta false (ya estaba borrado), se olvida igualmente", async () => {
    dentro();
    const { cliente } = servidor(ok(false));
    expect(await cliente.leaveClass()).toBe(false);
    expect(cliente.session()).toBeNull();
  });
  it("sin clase: sin_clase", async () => {
    await expect(servidor().cliente.leaveClass()).rejects.toMatchObject({ code: "sin_clase" });
  });
});

describe("deleteChallenge", () => {
  beforeEach(() => store.set("teach", { code: "ABC234", secret: PROFE }));
  it("envía código y clave, y olvida el reto y la pertenencia a él", async () => {
    dentro();
    const { cliente, llamadas } = servidor(ok(true));
    expect(await cliente.deleteChallenge()).toBe(true);
    expect(llamadas[0].body).toEqual({ p_code: "ABC234", p_teacher_secret: PROFE });
    expect(cliente.challengeOwner()).toBeNull();
    expect(cliente.session()).toBeNull();
  });
  it("si este navegador estaba en otra clase, no la toca", async () => {
    store.set("cls", { code: "ZZZ222", name: "Otra", alias: "Pipa", id: ID, secret: SECRETO });
    await servidor(ok(true)).cliente.deleteChallenge();
    expect(store.get("cls", null)).not.toBeNull();
  });
  it("sin conexión conserva la clave para poder reintentar", async () => {
    const { cliente } = servidor(new TypeError("Failed to fetch"));
    await expect(cliente.deleteChallenge()).rejects.toMatchObject({ code: "sin_conexion" });
    expect(cliente.challengeOwner()).not.toBeNull();
  });
  it("sin reto creado aquí: sin_clase y sin llamar al servidor", async () => {
    store.remove("teach");
    const { cliente, fetchFn } = servidor();
    await expect(cliente.deleteChallenge()).rejects.toMatchObject({ code: "sin_clase" });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("lo guardado en localStorage", () => {
  const put = (k, v) => localStorage.setItem("pipo2." + k, JSON.stringify(v));
  it.each([
    ["cls", { code: "ABC234", name: "1ºA", alias: "Pipa", id: "no-uuid", secret: SECRETO }],
    ["cls", { code: "abc234", name: "1ºA", alias: "Pipa", id: ID, secret: SECRETO }],
    ["cls", { code: "ABC234", name: "", alias: "Pipa", id: ID, secret: SECRETO }],
    ["cls", { code: "ABC234", name: "1ºA", alias: "<b>", id: ID, secret: SECRETO }],
    ["cls", { code: "ABC234", name: "1ºA", id: ID, secret: SECRETO }],
    ["cls", "texto"],
    ["teach", { code: "ABC234", secret: "corto" }],
    ["teach", [1, 2]],
  ])("descarta %s manipulado: %j", (k, v) => {
    store.remove(k);
    put(k, v);
    // fuera de la copia en memoria: se lee desde localStorage como tras recargar
    expect(store.get(k, null)).toBeNull();
  });
});
