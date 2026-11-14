// @vitest-environment node
// Cuentas de profesor, clases de aula y retos entre amigos (migración 0003) sobre PostgreSQL de verdad (PGlite),
// llamando a las funciones con el rol «anon», que es lo que hará el navegador con la clave pública.
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

let db;
const sql = async (text, params = []) => (await db.query(text, params)).rows;

async function rpc(fn, args = []) {
  await db.exec("set role anon");
  try {
    const marcadores = args.map((_, i) => "$" + (i + 1)).join(", ");
    return (await db.query(`select * from public.${fn}(${marcadores})`, args)).rows;
  } finally {
    await db.exec("reset role");
  }
}
async function comoAnon(text) {
  await db.exec("set role anon");
  try {
    return (await db.query(text)).rows;
  } finally {
    await db.exec("reset role");
  }
}

let n = 0;
const PASS = "una contraseña larga";
/** Una cuenta de profesor nueva (usuario distinto cada vez). */
async function profe(usuario = `profe${++n}`) {
  const [r] = await rpc("prof_register", [usuario, PASS]);
  return { usuario, token: r.token, recuperacion: r.recovery_code };
}
const aula = async (p, nombre = "1º A") => (await rpc("prof_create_class", [p.token, nombre]))[0];
const unirse = async (code, alias) => (await rpc("join_class", [code, alias]))[0];
const envejecer = (id) =>
  sql("update public.runs set created_at = now() - interval '1 minute' where player_id = $1", [id]);
const enviar = (j, level, dif, correct, mistakes, misses) =>
  rpc("submit_run", [j.player_id, j.player_secret, level, dif, correct, mistakes, misses ?? null]);

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema extensions;
    grant usage on schema public, extensions to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated;
  `);
  for (const f of ["0001_clases_y_ranking.sql", "0003_profesores_y_retos.sql"]) {
    await db.exec(fs.readFileSync(path.resolve(import.meta.dirname, "../../supabase/migrations", f), "utf8"));
  }
}, 60000);
afterAll(() => db?.close());

describe("todo sigue cerrado para el navegador", () => {
  for (const tabla of ["teachers", "teacher_sessions", "run_misses"]) {
    it(`anon no puede leer ni escribir «${tabla}»`, async () => {
      await expect(comoAnon(`select * from public.${tabla}`)).rejects.toThrow(/permission denied/);
      await expect(comoAnon(`delete from public.${tabla}`)).rejects.toThrow(/permission denied/);
    });
  }
  it("las seis tablas tienen RLS activado", async () => {
    const t = await sql(
      `select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'`
    );
    expect(t).toHaveLength(6);
    expect(t.every((x) => x.relrowsecurity)).toBe(true);
  });
  it("las funciones públicas son exactamente las previstas y todas ejecutables por anon", async () => {
    const f = await sql(`
      select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' order by 1`);
    expect(f.map((x) => x.proname)).toEqual([
      "class_info",
      "class_ranking",
      "create_challenge",
      "create_class",
      "join_class",
      "leave_class",
      "prof_classes",
      "prof_create_class",
      "prof_delete_account",
      "prof_delete_class",
      "prof_login",
      "prof_logout",
      "prof_misses",
      "prof_progress",
      "prof_register",
      "prof_remove_student",
      "prof_reset_password",
      "prof_set_config",
      "submit_run",
      "teacher_delete_class",
      "teacher_remove_player",
    ]);
    expect(f.every((x) => x.anon)).toBe(true);
  });
  it("anon no puede llamar a los ayudantes privados", async () => {
    await expect(comoAnon("select private.profe_de_sesion('x')")).rejects.toThrow(/permission denied/);
    await expect(comoAnon("select private.clave_recuperacion()")).rejects.toThrow(/permission denied/);
  });
});

describe("prof_register", () => {
  it("devuelve una sesión (32 hex) y un código de recuperación (40 hex)", async () => {
    const p = await profe();
    expect(p.token).toMatch(/^[0-9a-f]{32}$/);
    expect(p.recuperacion).toMatch(/^[0-9a-f]{40}$/);
  });
  it("guarda la contraseña con bcrypt y el resto solo como hash, nunca en claro", async () => {
    const p = await profe("guardado");
    const [t] = await sql("select * from public.teachers where username = 'guardado'");
    expect(t.pass_hash).toMatch(/^\$2[aby]\$10\$/);
    expect(JSON.stringify(t)).not.toContain(PASS);
    expect(JSON.stringify(t)).not.toContain(p.recuperacion);
    const [s] = await sql("select * from public.teacher_sessions where teacher_id = $1", [t.id]);
    expect(s.token_hash).not.toBe(p.token);
  });
  it("rechaza usuarios y contraseñas inválidos", async () => {
    for (const u of ["ab", "a".repeat(31), "con espacio", "raro<>", "ñandú", "", null])
      await expect(rpc("prof_register", [u, PASS])).rejects.toThrow(/usuario_invalido/);
    for (const c of ["corta", "x".repeat(73), "", null])
      await expect(rpc("prof_register", ["valido1", c])).rejects.toThrow(/contrasena_invalida/);
  });
  it("no deja repetir el usuario, sin distinguir mayúsculas", async () => {
    await profe("Marta.Lopez");
    await expect(rpc("prof_register", ["marta.lopez", PASS])).rejects.toThrow(/usuario_en_uso/);
  });
  it("frena el alta masiva de cuentas", async () => {
    await sql("update public.teachers set created_at = now()");
    const ya = (await sql("select count(*)::int as n from public.teachers"))[0].n;
    for (let i = ya; i < 30; i++)
      await sql("insert into public.teachers (username, pass_hash, recovery_hash) values ($1, 'x', 'y')", [
        `relleno${i}`,
      ]);
    await expect(rpc("prof_register", ["unomas", PASS])).rejects.toThrow(/demasiado_rapido/);
    await sql("update public.teachers set created_at = now() - interval '2 hours'");
  });
});

describe("prof_login", () => {
  it("entra con usuario (sin distinguir mayúsculas) y contraseña", async () => {
    const p = await profe("Entrada");
    const [r] = await rpc("prof_login", ["  entrada ", PASS]);
    expect(r.token).toMatch(/^[0-9a-f]{32}$/);
    expect(r.error).toBeNull();
    expect(p.token).not.toBe(r.token);
  });
  it("una contraseña mal o un usuario que no existe dan el mismo error", async () => {
    await profe("existe");
    const [a] = await rpc("prof_login", ["existe", "otra contraseña"]);
    const [b] = await rpc("prof_login", ["noexiste", PASS]);
    expect(a).toEqual({ token: null, error: "credenciales_invalidas" });
    expect(b).toEqual(a);
  });
  it("tras 5 fallos seguidos bloquea la cuenta, aunque luego se acierte; y se desbloquea con el tiempo", async () => {
    await profe("bloqueo");
    for (let i = 0; i < 4; i++)
      expect((await rpc("prof_login", ["bloqueo", "mal"]))[0].error).toBe("credenciales_invalidas");
    expect((await rpc("prof_login", ["bloqueo", "mal"]))[0].error).toBe("cuenta_bloqueada");
    expect((await rpc("prof_login", ["bloqueo", PASS]))[0]).toEqual({ token: null, error: "cuenta_bloqueada" });
    await sql("update public.teachers set locked_until = now() - interval '1 second' where username = 'bloqueo'");
    expect((await rpc("prof_login", ["bloqueo", PASS]))[0].error).toBeNull();
  });
  it("un acierto pone a cero los fallos", async () => {
    await profe("racha");
    for (let i = 0; i < 4; i++) await rpc("prof_login", ["racha", "mal"]);
    await rpc("prof_login", ["racha", PASS]);
    expect((await rpc("prof_login", ["racha", "mal"]))[0].error).toBe("credenciales_invalidas");
  });
});

describe("prof_reset_password", () => {
  it("con el código pone una contraseña nueva, renueva el código y cierra las sesiones abiertas", async () => {
    const p = await profe("olvidada");
    const formateado = p.recuperacion.toUpperCase().replace(/(.{8})/g, "$1-");
    const [r] = await rpc("prof_reset_password", ["olvidada", formateado, "contraseña nueva 1"]);
    expect(r.error).toBeNull();
    expect(r.recovery_code).toMatch(/^[0-9a-f]{40}$/);
    expect(r.recovery_code).not.toBe(p.recuperacion);
    expect((await rpc("prof_login", ["olvidada", PASS]))[0].error).toBe("credenciales_invalidas");
    expect((await rpc("prof_login", ["olvidada", "contraseña nueva 1"]))[0].error).toBeNull();
    await expect(rpc("prof_classes", [p.token])).rejects.toThrow(/sesion_no_valida/);
    await expect(rpc("prof_classes", [r.token])).resolves.toEqual([]);
  });
  it("el código viejo ya no sirve", async () => {
    const p = await profe("renovada");
    await rpc("prof_reset_password", ["renovada", p.recuperacion, "contraseña nueva 2"]);
    const [r] = await rpc("prof_reset_password", ["renovada", p.recuperacion, "contraseña nueva 3"]);
    expect(r.error).toBe("credenciales_invalidas");
  });
  it("un código equivocado cuenta como intento fallido y acaba bloqueando", async () => {
    await profe("adivina");
    for (let i = 0; i < 4; i++)
      expect((await rpc("prof_reset_password", ["adivina", "0".repeat(40), "otra contraseña"]))[0].error).toBe(
        "credenciales_invalidas"
      );
    expect((await rpc("prof_reset_password", ["adivina", "0".repeat(40), "otra contraseña"]))[0].error).toBe(
      "cuenta_bloqueada"
    );
  });
  it("rechaza una contraseña nueva demasiado corta", async () => {
    const p = await profe("corta");
    await expect(rpc("prof_reset_password", ["corta", p.recuperacion, "corta"])).rejects.toThrow(/contrasena_invalida/);
  });
});

describe("sesiones", () => {
  it("sin sesión válida no se puede usar ninguna función de profesor", async () => {
    const llamadas = [
      ["prof_classes", ["x"]],
      ["prof_create_class", ["x", "Clase"]],
      ["prof_set_config", ["x", "ABCDEF", [1], ["easy"]]],
      ["prof_progress", ["x", "ABCDEF"]],
      ["prof_misses", ["x", "ABCDEF"]],
      ["prof_remove_student", ["x", "ABCDEF", "Ana"]],
      ["prof_delete_class", ["x", "ABCDEF"]],
      ["prof_delete_account", ["x", PASS]],
    ];
    for (const [fn, args] of llamadas) await expect(rpc(fn, args)).rejects.toThrow(/sesion_no_valida/);
  });
  it("al cerrar sesión el token deja de valer; una sesión caducada tampoco vale", async () => {
    const p = await profe();
    expect(await rpc("prof_logout", [p.token])).toEqual([{ prof_logout: true }]);
    await expect(rpc("prof_classes", [p.token])).rejects.toThrow(/sesion_no_valida/);
    const q = await profe();
    await sql("update public.teacher_sessions set expires_at = now() - interval '1 second'");
    await expect(rpc("prof_classes", [q.token])).rejects.toThrow(/sesion_no_valida/);
  });
});

describe("clases de aula", () => {
  it("el profesor crea varias clases y las ve todas, con alumnos y última partida", async () => {
    const p = await profe();
    const a = await aula(p, "1º A");
    const b = await aula(p, "  1º   B ");
    expect(a.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(b.name).toBe("1º B");
    const j = await unirse(a.code, "Ana");
    await enviar(j, 0, "normal", 24, 0);
    const lista = await rpc("prof_classes", [p.token]);
    expect(lista.map((c) => c.name).sort()).toEqual(["1º A", "1º B"]);
    const la = lista.find((c) => c.name === "1º A");
    expect(la).toMatchObject({
      players: 1,
      allowed_lists: [1, 2, 3, 4, 5, 6],
      allowed_difficulties: ["easy", "normal", "hard"],
    });
    expect(la.last_run).not.toBeNull();
    expect(lista.find((c) => c.name === "1º B")).toMatchObject({ players: 0, last_run: null });
  });
  it("cada profesor ve solo lo suyo y no puede tocar la clase de otro", async () => {
    const p = await profe();
    const q = await profe();
    const a = await aula(p);
    expect(await rpc("prof_classes", [q.token])).toEqual([]);
    for (const [fn, args] of [
      ["prof_set_config", [q.token, a.code, [1], ["easy"]]],
      ["prof_progress", [q.token, a.code]],
      ["prof_misses", [q.token, a.code]],
      ["prof_remove_student", [q.token, a.code, "Ana"]],
      ["prof_delete_class", [q.token, a.code]],
    ])
      await expect(rpc(fn, args)).rejects.toThrow(/clase_no_existe/);
    expect((await rpc("class_ranking", [a.code])).length).toBe(0); // la clase sigue ahí
  });
  it("máximo 20 clases por profesor y nombres válidos", async () => {
    const p = await profe();
    for (let i = 0; i < 20; i++) await aula(p, `Clase ${i}`);
    await expect(rpc("prof_create_class", [p.token, "una más"])).rejects.toThrow(/demasiadas_clases/);
    const q = await profe();
    for (const nombre of ["", "x".repeat(41), "<b>", null])
      await expect(rpc("prof_create_class", [q.token, nombre])).rejects.toThrow(/nombre_invalido/);
  });
  it("admite hasta 60 alumnos", async () => {
    const p = await profe();
    const a = await aula(p);
    await sql(
      `insert into public.players (class_id, alias, secret_hash)
       select id, 'alumno' || g, 'x' from public.classes, generate_series(1, 60) g where code = $1`,
      [a.code]
    );
    await expect(unirse(a.code, "uno más")).rejects.toThrow(/clase_llena/);
  });
  it("quitar a un alumno y borrar la clase", async () => {
    const p = await profe();
    const a = await aula(p);
    const b = await aula(p, "Otra");
    await unirse(a.code, "Ana");
    await unirse(b.code, "Bea");
    expect(await rpc("prof_remove_student", [p.token, a.code, " ana "])).toEqual([{ prof_remove_student: true }]);
    expect(await rpc("prof_remove_student", [p.token, a.code, "Ana"])).toEqual([{ prof_remove_student: false }]);
    await rpc("prof_delete_class", [p.token, a.code]);
    expect((await rpc("prof_classes", [p.token])).map((c) => c.code)).toEqual([b.code]);
    expect((await rpc("class_ranking", [b.code])).map((x) => x.alias)).toEqual(["Bea"]);
  });
  it("borrar la cuenta pide la contraseña y se lleva clases, alumnos y partidas", async () => {
    const p = await profe();
    const a = await aula(p);
    const j = await unirse(a.code, "Ana");
    await enviar(j, 0, "easy", 10, 1, ["go"]);
    await expect(rpc("prof_delete_account", [p.token, "mal"])).rejects.toThrow(/credenciales_invalidas/);
    expect(await rpc("prof_delete_account", [p.token, PASS])).toEqual([{ prof_delete_account: true }]);
    await expect(rpc("class_ranking", [a.code])).rejects.toThrow(/clase_no_existe/);
    expect(await sql("select * from public.players where id = $1", [j.player_id])).toEqual([]);
    expect(await sql("select * from public.run_misses")).toEqual(
      expect.not.arrayContaining([expect.objectContaining({ verb: "go" })])
    );
  });
});

describe("configuración de la clase", () => {
  it("el profesor elige listas y dificultades; los alumnos pueden consultarla", async () => {
    const p = await profe();
    const a = await aula(p, "Con config");
    await rpc("prof_set_config", [p.token, a.code, [3, 1, 3], ["hard", "easy"]]);
    expect(await rpc("class_info", [a.code.toLowerCase()])).toEqual([
      { name: "Con config", kind: "aula", allowed_lists: [1, 3], allowed_difficulties: ["easy", "hard"] },
    ]);
  });
  it("rechaza configuraciones vacías o fuera de rango", async () => {
    const p = await profe();
    const a = await aula(p);
    for (const [l, d] of [
      [[], ["easy"]],
      [[1], []],
      [[0], ["easy"]],
      [[7], ["easy"]],
      [[1], ["imposible"]],
      [null, ["easy"]],
    ])
      await expect(rpc("prof_set_config", [p.token, a.code, l, d])).rejects.toThrow(/configuracion_invalida/);
  });
  it("el servidor rechaza una dificultad que el profesor no permite", async () => {
    const p = await profe();
    const a = await aula(p);
    const j = await unirse(a.code, "Ana");
    await rpc("prof_set_config", [p.token, a.code, [1, 2, 3, 4, 5, 6], ["easy"]]);
    await expect(enviar(j, 0, "hard", 10, 0)).rejects.toThrow(/dificultad_no_permitida/);
    await expect(enviar(j, 0, "easy", 10, 0)).resolves.toHaveLength(1);
  });
  it("class_info rechaza una clase que no existe", async () => {
    await expect(rpc("class_info", ["ZZZZZZ"])).rejects.toThrow(/clase_no_existe/);
  });
});

describe("seguimiento: niveles, dificultades y verbos fallados", () => {
  it("guarda los fallos por verbo y los suma por alumno", async () => {
    const p = await profe();
    const a = await aula(p);
    const ana = await unirse(a.code, "Ana");
    const bea = await unirse(a.code, "Bea");
    await enviar(ana, 0, "normal", 24, 3, ["go", "go", "be"]);
    await envejecer(ana.player_id);
    await enviar(ana, 1, "easy", 24, 1, ["go"]);
    await enviar(bea, 0, "hard", 24, 0);
    const m = await rpc("prof_misses", [p.token, a.code]);
    expect(m).toEqual([
      { alias: "Ana", verb: "go", times: 3 },
      { alias: "Ana", verb: "be", times: 1 },
    ]);
  });
  it("enseña por alumno qué niveles y dificultades ha jugado, y a quien aún no ha jugado", async () => {
    const p = await profe();
    const a = await aula(p);
    const ana = await unirse(a.code, "Ana");
    await unirse(a.code, "Zoe");
    await enviar(ana, 0, "normal", 24, 0);
    await envejecer(ana.player_id);
    await enviar(ana, 0, "normal", 24, 3);
    await envejecer(ana.player_id);
    await enviar(ana, 2, "hard", 10, 0);
    const r = await rpc("prof_progress", [p.token, a.code]);
    expect(r).toHaveLength(3);
    expect(r[0]).toMatchObject({ alias: "Ana", level: 0, difficulty: "normal", plays: 2, best_stars: 3 });
    expect(r[1]).toMatchObject({ alias: "Ana", level: 2, difficulty: "hard", plays: 1 });
    expect(r[2]).toMatchObject({ alias: "Zoe", level: null, difficulty: null, plays: 0 });
  });
  it("rechaza fallos mal formados o más de los errores de la partida", async () => {
    const p = await profe();
    const a = await aula(p);
    const j = await unirse(a.code, "Ana");
    for (const misses of [["go", "be"], ["Go"], ["go;drop"], ["<b>"], [""], ["x".repeat(31)]]) {
      await expect(enviar(j, 0, "normal", 24, 1, misses)).rejects.toThrow(/partida_imposible/);
      await envejecer(j.player_id);
    }
    await expect(enviar(j, 0, "normal", 24, 2, ["go", "be"])).resolves.toHaveLength(1);
  });
  it("un envío sin fallos por verbo (el juego ya publicado) sigue funcionando", async () => {
    const p = await profe();
    const a = await aula(p);
    const j = await unirse(a.code, "Ana");
    expect(await rpc("submit_run", [j.player_id, j.player_secret, 0, "normal", 24, 0])).toEqual([
      { points: 438, stars: 3 },
    ]);
  });
});

describe("retos entre amigos", () => {
  it("create_challenge crea el reto y mete dentro a quien lo crea", async () => {
    const [c] = await rpc("create_challenge", ["Los de 1º B", "Lobo gris"]);
    expect(c.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(c.player_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(c.class_name).toBe("Los de 1º B");
    expect((await rpc("class_ranking", [c.code])).map((r) => r.alias)).toEqual(["Lobo gris"]);
    expect((await rpc("class_info", [c.code]))[0]).toMatchObject({ kind: "reto", allowed_lists: [1, 2, 3, 4, 5, 6] });
    expect(await rpc("leave_class", [c.player_id, c.player_secret])).toEqual([{ leave_class: true }]);
  });
  it("quien lo crea puede borrarlo con su clave", async () => {
    const [c] = await rpc("create_challenge", ["Se borra", "Ana"]);
    expect(await rpc("teacher_delete_class", [c.code, c.teacher_secret])).toEqual([{ teacher_delete_class: true }]);
    await expect(rpc("class_ranking", [c.code])).rejects.toThrow(/clase_no_existe/);
  });
  it("un apodo o un nombre inválido no deja ningún reto a medias", async () => {
    const antes = (await sql("select count(*)::int as n from public.classes"))[0].n;
    await expect(rpc("create_challenge", ["Bien", "x"])).rejects.toThrow(/apodo_invalido/);
    await expect(rpc("create_challenge", ["<b>", "Ana"])).rejects.toThrow(/nombre_invalido/);
    expect((await sql("select count(*)::int as n from public.classes"))[0].n).toBe(antes);
  });
  it("admite hasta 30 personas", async () => {
    const [c] = await rpc("create_challenge", ["Lleno", "Primero"]);
    await sql(
      `insert into public.players (class_id, alias, secret_hash)
       select id, 'amigo' || g, 'x' from public.classes, generate_series(1, 29) g where code = $1`,
      [c.code]
    );
    await expect(unirse(c.code, "Sobra")).rejects.toThrow(/clase_llena/);
  });
  it("NO guarda los verbos fallados, aunque el navegador los mande", async () => {
    const [c] = await rpc("create_challenge", ["Sin fallos", "Ana"]);
    await enviar(c, 0, "normal", 24, 2, ["go", "be"]);
    expect(
      await sql("select * from public.run_misses where run_id in (select id from public.runs where player_id = $1)", [
        c.player_id,
      ])
    ).toEqual([]);
    expect(await sql("select count(*)::int as n from public.runs where player_id = $1", [c.player_id])).toEqual([
      { n: 1 },
    ]);
  });
  it("frena la creación masiva de retos", async () => {
    await sql("update public.classes set created_at = now() where kind = 'reto'");
    const ya = (await sql("select count(*)::int as n from public.classes where kind = 'reto'"))[0].n;
    await sql(
      `insert into public.classes (code, name, teacher_hash)
       select private.codigo_clase(), 'relleno', 'x' from generate_series(1, $1::int) g`,
      [100 - ya]
    );
    await expect(rpc("create_challenge", ["Uno más", "Ana"])).rejects.toThrow(/demasiado_rapido/);
    await sql("update public.classes set created_at = now() - interval '2 hours' where name = 'relleno'");
  });
});

describe("limpieza por inactividad", () => {
  it("borra retos tras 3 meses y aulas tras 12; no toca lo reciente", async () => {
    const p = await profe();
    const a = await aula(p, "Aula vieja");
    const b = await aula(p, "Aula de 6 meses");
    const [reto] = await rpc("create_challenge", ["Reto de 4 meses", "Ana"]);
    const [reto2] = await rpc("create_challenge", ["Reto de 2 meses", "Bea"]);
    await sql("update public.classes set created_at = now() - interval '13 months' where code = $1", [a.code]);
    await sql("update public.classes set created_at = now() - interval '6 months' where code = $1", [b.code]);
    await sql("update public.classes set created_at = now() - interval '4 months' where code = $1", [reto.code]);
    await sql("update public.classes set created_at = now() - interval '2 months' where code = $1", [reto2.code]);
    await sql("select private.purgar_clases_inactivas()");
    const quedan = (
      await sql(
        "select name from public.classes where name in ('Aula vieja','Aula de 6 meses','Reto de 4 meses','Reto de 2 meses') order by 1"
      )
    ).map((x) => x.name);
    expect(quedan).toEqual(["Aula de 6 meses", "Reto de 2 meses"]);
  });
  it("una partida reciente mantiene viva la clase", async () => {
    const [reto] = await rpc("create_challenge", ["Reto activo", "Ana"]);
    await sql("update public.classes set created_at = now() - interval '5 months' where code = $1", [reto.code]);
    await enviar(reto, 0, "easy", 10, 0);
    await sql("select private.purgar_clases_inactivas()");
    expect(await sql("select 1 from public.classes where code = $1", [reto.code])).toHaveLength(1);
  });
  it("borra cuentas de profesor sin clases que llevan 12 meses sin entrar, y sesiones caducadas", async () => {
    const vieja = await profe("cuentavieja");
    const conClase = await profe("cuentaconclase");
    await aula(conClase);
    await sql(
      "update public.teachers set last_login = now() - interval '13 months' where username in ('cuentavieja','cuentaconclase')"
    );
    await sql("update public.teacher_sessions set expires_at = now() - interval '1 day'");
    await sql("select private.purgar_clases_inactivas()");
    const quedan = (
      await sql("select username from public.teachers where username in ('cuentavieja','cuentaconclase')")
    ).map((x) => x.username);
    expect(quedan).toEqual(["cuentaconclase"]);
    expect(await sql("select 1 from public.teacher_sessions where teacher_id is not null")).toEqual([]);
    expect(vieja.usuario).toBe("cuentavieja");
  });
});
