// @vitest-environment node
// Cuentas de alumnado y profesorado, clases por cuenta y progreso (migraciones 0001, 0003 y 0004) sobre PostgreSQL
// de verdad (PGlite), llamando a las funciones con el rol «anon», que es lo que hará el navegador.
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
/** Una cuenta nueva (usuario distinto cada vez). */
async function cuenta(role = "alumno", usuario = `${role}${++n}`) {
  const [r] = await rpc("account_register", [role, usuario, PASS]);
  return { usuario, token: r.token, recuperacion: r.recovery_code };
}
const alumno = (u) => cuenta("alumno", u);
const profe = (u) => cuenta("profe", u);
const aula = async (p, nombre = "1º A") => (await rpc("prof_create_class", [p.token, nombre]))[0];
/** Un alumno que ya está dentro de una clase. */
async function dentro(code, alias = `Ana${++n}`) {
  const a = await alumno();
  await rpc("alu_join_class", [a.token, code, alias]);
  return { ...a, alias };
}
const envejecer = (token) =>
  sql(
    `update public.runs set created_at = now() - interval '1 minute'
     where player_id in (select p.id from public.players p join public.account_sessions s on s.account_id = p.account_id
                         where s.token_hash = encode(extensions.digest($1, 'sha256'), 'hex'))`,
    [token]
  );
const enviar = (a, level, dif, correct, mistakes, misses) =>
  rpc("alu_submit_run", [a.token, level, dif, correct, mistakes, misses ?? null]);

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema extensions;
    grant usage on schema public, extensions to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated;
  `);
  for (const f of ["0001_clases_y_ranking.sql", "0003_profesores_y_retos.sql", "0004_cuentas.sql"]) {
    await db.exec(fs.readFileSync(path.resolve(import.meta.dirname, "../../supabase/migrations", f), "utf8"));
  }
}, 60000);
afterAll(() => db?.close());

describe("todo sigue cerrado para el navegador", () => {
  for (const [tabla, columna] of [
    ["accounts", "last_login"],
    ["account_sessions", "expires_at"],
  ]) {
    it(`anon no puede leer ni escribir «${tabla}»`, async () => {
      await expect(comoAnon(`select * from public.${tabla}`)).rejects.toThrow(/permission denied/);
      await expect(comoAnon(`update public.${tabla} set ${columna} = now()`)).rejects.toThrow(/permission denied/);
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
      "account_change_password",
      "account_delete",
      "account_login",
      "account_logout",
      "account_me",
      "account_register",
      "account_reset_password",
      "alu_create_challenge",
      "alu_delete_challenge",
      "alu_join_class",
      "alu_leave_class",
      "alu_my_class",
      "alu_save_progress",
      "alu_submit_run",
      "class_info",
      "class_ranking",
      "create_challenge",
      "create_class",
      "join_class",
      "leave_class",
      "prof_classes",
      "prof_create_class",
      "prof_delete_class",
      "prof_misses",
      "prof_progress",
      "prof_remove_student",
      "prof_reset_student",
      "prof_set_config",
      "submit_run",
      "teacher_delete_class",
      "teacher_remove_player",
    ]);
    expect(f.every((x) => x.anon)).toBe(true);
  });
  it("anon no puede llamar a los ayudantes privados", async () => {
    for (const q of [
      "select private.cuenta_de_sesion('x')",
      "select private.guardar_partida(gen_random_uuid(), 0, 'easy', 1, 0, null)",
      "select private.progreso_limpio('{}')",
      "select private.contrasena_temporal()",
    ])
      await expect(comoAnon(q)).rejects.toThrow(/permission denied/);
  });
});

describe("account_register", () => {
  it("crea cuentas de alumno y de profesor: sesión de 32 hex y código de recuperación de 40", async () => {
    for (const rol of ["alumno", "profe"]) {
      const c = await cuenta(rol);
      expect(c.token).toMatch(/^[0-9a-f]{32}$/);
      expect(c.recuperacion).toMatch(/^[0-9a-f]{40}$/);
    }
  });
  it("guarda el rol, la contraseña con bcrypt y nada en claro", async () => {
    const a = await alumno("guardada");
    const [t] = await sql("select * from public.accounts where username = 'guardada'");
    expect(t.role).toBe("alumno");
    expect(t.pass_hash).toMatch(/^\$2[aby]\$10\$/);
    expect(JSON.stringify(t)).not.toContain(PASS);
    expect(JSON.stringify(t)).not.toContain(a.recuperacion);
    expect(t.progress).toEqual({});
    expect(t.must_change_password).toBe(false);
  });
  it("rechaza un rol, un usuario o una contraseña inválidos", async () => {
    for (const r of ["admin", "", null])
      await expect(rpc("account_register", [r, "validoo", PASS])).rejects.toThrow(/rol_invalido/);
    for (const u of ["ab", "a".repeat(31), "con espacio", "raro<>", "ñandú", "", null])
      await expect(rpc("account_register", ["alumno", u, PASS])).rejects.toThrow(/usuario_invalido/);
    for (const c of ["corta", "x".repeat(73), "", null])
      await expect(rpc("account_register", ["alumno", "validoo", c])).rejects.toThrow(/contrasena_invalida/);
  });
  it("el usuario es único en todo el juego, sin distinguir mayúsculas ni rol", async () => {
    await alumno("Marta.Lopez");
    await expect(rpc("account_register", ["alumno", "marta.lopez", PASS])).rejects.toThrow(/usuario_en_uso/);
    await expect(rpc("account_register", ["profe", "MARTA.LOPEZ", PASS])).rejects.toThrow(/usuario_en_uso/);
  });
  it("frena el alta masiva: 30 profesores y 300 alumnos por hora", async () => {
    await sql("update public.accounts set created_at = now() - interval '2 hours'");
    const rellenar = (rol, k) =>
      sql(
        `insert into public.accounts (role, username, pass_hash, recovery_hash)
         select $1, $1 || 'relleno' || g, 'x', 'y' from generate_series(1, $2::int) g`,
        [rol, k]
      );
    await rellenar("profe", 30);
    await expect(rpc("account_register", ["profe", "unprofemas", PASS])).rejects.toThrow(/demasiado_rapido/);
    await expect(alumno("unalumnoaun")).resolves.toBeTruthy(); // el tope de alumnos es aparte
    await rellenar("alumno", 300);
    await expect(rpc("account_register", ["alumno", "unalumnomas", PASS])).rejects.toThrow(/demasiado_rapido/);
    await sql("update public.accounts set created_at = now() - interval '2 hours'");
  });
});

describe("account_login, account_me y cierre de sesión", () => {
  it("entra con el usuario (sin distinguir mayúsculas) y devuelve el rol", async () => {
    await alumno("Entrada");
    const [r] = await rpc("account_login", ["  entrada ", PASS]);
    expect(r).toMatchObject({ role: "alumno", must_change_password: false, error: null });
    expect(r.token).toMatch(/^[0-9a-f]{32}$/);
  });
  it("contraseña mala y usuario inexistente dan el mismo error", async () => {
    await alumno("existe");
    const [a] = await rpc("account_login", ["existe", "otra contraseña"]);
    const [b] = await rpc("account_login", ["noexiste", PASS]);
    expect(a).toEqual({ token: null, role: null, must_change_password: null, error: "credenciales_invalidas" });
    expect(b).toEqual(a);
  });
  it("tras 5 fallos seguidos bloquea la cuenta, aunque luego se acierte, y se desbloquea con el tiempo", async () => {
    await alumno("bloqueo");
    for (let i = 0; i < 4; i++)
      expect((await rpc("account_login", ["bloqueo", "mal"]))[0].error).toBe("credenciales_invalidas");
    expect((await rpc("account_login", ["bloqueo", "mal"]))[0].error).toBe("cuenta_bloqueada");
    expect((await rpc("account_login", ["bloqueo", PASS]))[0].error).toBe("cuenta_bloqueada");
    await sql("update public.accounts set locked_until = now() - interval '1 second' where username = 'bloqueo'");
    expect((await rpc("account_login", ["bloqueo", PASS]))[0].error).toBeNull();
  });
  it("account_me devuelve rol, usuario y progreso de la sesión; una sesión falsa o caducada no vale", async () => {
    const a = await alumno("yo.mismo");
    expect(await rpc("account_me", [a.token])).toEqual([
      { role: "alumno", username: "yo.mismo", progress: {}, must_change_password: false },
    ]);
    await expect(rpc("account_me", ["x"])).rejects.toThrow(/sesion_no_valida/);
    await sql("update public.account_sessions set expires_at = now() - interval '1 second'");
    await expect(rpc("account_me", [a.token])).rejects.toThrow(/sesion_no_valida/);
  });
  it("account_me cuenta como actividad", async () => {
    const a = await alumno("activa");
    await sql("update public.accounts set last_login = now() - interval '5 months' where username = 'activa'");
    await rpc("account_me", [a.token]);
    const [t] = await sql(
      "select last_login > now() - interval '1 minute' as hoy from public.accounts where username = 'activa'"
    );
    expect(t.hoy).toBe(true);
  });
  it("al cerrar sesión el token deja de valer", async () => {
    const a = await alumno();
    expect(await rpc("account_logout", [a.token])).toEqual([{ account_logout: true }]);
    await expect(rpc("account_me", [a.token])).rejects.toThrow(/sesion_no_valida/);
  });
});

describe("recuperar y cambiar la contraseña", () => {
  it("con el código se pone una nueva (aunque se escriba agrupado), se renueva el código y se cierran las demás sesiones", async () => {
    const a = await alumno("olvidada");
    const agrupado = a.recuperacion.toUpperCase().replace(/(.{8})/g, "$1-");
    const [r] = await rpc("account_reset_password", ["olvidada", agrupado, "contraseña nueva 1"]);
    expect(r).toMatchObject({ role: "alumno", error: null });
    expect(r.recovery_code).toMatch(/^[0-9a-f]{40}$/);
    expect(r.recovery_code).not.toBe(a.recuperacion);
    expect((await rpc("account_login", ["olvidada", PASS]))[0].error).toBe("credenciales_invalidas");
    expect((await rpc("account_login", ["olvidada", "contraseña nueva 1"]))[0].error).toBeNull();
    await expect(rpc("account_me", [a.token])).rejects.toThrow(/sesion_no_valida/);
    await expect(rpc("account_me", [r.token])).resolves.toHaveLength(1);
    expect((await rpc("account_reset_password", ["olvidada", a.recuperacion, "contraseña nueva 2"]))[0].error).toBe(
      "credenciales_invalidas"
    );
  });
  it("un código equivocado cuenta como intento fallido y acaba bloqueando", async () => {
    await alumno("adivina");
    for (let i = 0; i < 4; i++)
      expect((await rpc("account_reset_password", ["adivina", "0".repeat(40), "otra contraseña"]))[0].error).toBe(
        "credenciales_invalidas"
      );
    expect((await rpc("account_reset_password", ["adivina", "0".repeat(40), "otra contraseña"]))[0].error).toBe(
      "cuenta_bloqueada"
    );
  });
  it("rechaza una contraseña nueva corta", async () => {
    const a = await alumno("corta1");
    await expect(rpc("account_reset_password", ["corta1", a.recuperacion, "corta"])).rejects.toThrow(
      /contrasena_invalida/
    );
    await expect(rpc("account_change_password", [a.token, PASS, "corta"])).rejects.toThrow(/contrasena_invalida/);
  });
  it("cambiar la contraseña pide la actual y cierra las otras sesiones, no la propia", async () => {
    const a = await alumno("cambia");
    const [otra] = await rpc("account_login", ["cambia", PASS]);
    await expect(rpc("account_change_password", [a.token, "mal", "nueva contraseña"])).rejects.toThrow(
      /credenciales_invalidas/
    );
    await rpc("account_change_password", [a.token, PASS, "nueva contraseña"]);
    await expect(rpc("account_me", [a.token])).resolves.toHaveLength(1);
    await expect(rpc("account_me", [otra.token])).rejects.toThrow(/sesion_no_valida/);
    expect((await rpc("account_login", ["cambia", "nueva contraseña"]))[0].error).toBeNull();
  });
});

describe("separación de roles", () => {
  it("una sesión de alumno no sirve para el profesorado y al revés", async () => {
    const a = await alumno();
    const p = await profe();
    for (const [fn, args] of [
      ["prof_create_class", [a.token, "x"]],
      ["prof_classes", [a.token]],
      ["prof_reset_student", [a.token, "ABCDEF", "x"]],
    ])
      await expect(rpc(fn, args)).rejects.toThrow(/rol_no_permitido/);
    for (const [fn, args] of [
      ["alu_save_progress", [p.token, {}]],
      ["alu_my_class", [p.token]],
      ["alu_join_class", [p.token, "ABCDEF", "Ana"]],
      ["alu_leave_class", [p.token]],
      ["alu_create_challenge", [p.token, "x", "Ana"]],
    ])
      await expect(rpc(fn, args)).rejects.toThrow(/rol_no_permitido/);
  });
  it("sin sesión válida no se puede usar ninguna función de cuenta", async () => {
    for (const [fn, args] of [
      ["account_me", ["x"]],
      ["account_change_password", ["x", PASS, PASS]],
      ["account_delete", ["x", PASS]],
      ["alu_save_progress", ["x", {}]],
      ["alu_my_class", ["x"]],
      ["alu_join_class", ["x", "ABCDEF", "Ana"]],
      ["alu_leave_class", ["x"]],
      ["alu_submit_run", ["x", 0, "easy", 1, 0, null]],
      ["alu_create_challenge", ["x", "r", "Ana"]],
      ["alu_delete_challenge", ["x", "ABCDEF"]],
      ["prof_classes", ["x"]],
      ["prof_reset_student", ["x", "ABCDEF", "Ana"]],
    ])
      await expect(rpc(fn, args)).rejects.toThrow(/sesion_no_valida/);
  });
});

describe("progreso del alumno", () => {
  const BUENO = {
    stars: { easy: [3, 2, 1, 0, 0], normal: [1, 0, 0, 0, 0], hard: [0, 0, 0, 0, 0] },
    sel: ["go", "be", "put up"],
    miss: { go: 3, be: 1 },
    diff: "hard",
  };
  it("guarda y devuelve el progreso, en otra sesión y todo", async () => {
    const a = await alumno("progreso");
    expect(await rpc("alu_save_progress", [a.token, BUENO])).toEqual([{ alu_save_progress: true }]);
    const [otra] = await rpc("account_login", ["progreso", PASS]);
    expect((await rpc("account_me", [otra.token]))[0].progress).toEqual(BUENO);
  });
  it("acepta un progreso parcial y se queda solo con lo conocido", async () => {
    const a = await alumno();
    await rpc("alu_save_progress", [a.token, { diff: "easy", sel: [], intruso: "no", otro: { x: 1 } }]);
    expect((await rpc("account_me", [a.token]))[0].progress).toEqual({ diff: "easy", sel: [] });
  });
  it.each([
    ["no es un objeto", [1, 2]],
    ["estrellas con la dificultad mal", { stars: { imposible: [0, 0, 0, 0, 0] } }],
    ["estrellas con menos de 5 niveles", { stars: { easy: [0, 0, 0] } }],
    ["estrellas fuera de rango", { stars: { easy: [4, 0, 0, 0, 0] } }],
    ["estrellas que no son números", { stars: { easy: ["a", 0, 0, 0, 0] } }],
    ["estrellas decimales", { stars: { easy: [1.5, 0, 0, 0, 0] } }],
    ["verbos que no son una lista", { sel: "go" }],
    ["un verbo con símbolos", { sel: ["go<script>"] }],
    ["un verbo que no es texto", { sel: [1] }],
    ["más de 200 verbos", { sel: Array.from({ length: 201 }, (_, i) => "v" + "a".repeat(i % 5)) }],
    ["fallos con un verbo inválido", { miss: { "Go;": 1 } }],
    ["fallos con un número negativo", { miss: { go: -1 } }],
    ["fallos con cero", { miss: { go: 0 } }],
    ["fallos con un decimal", { miss: { go: 1.5 } }],
    ["fallos enormes", { miss: { go: 100000 } }],
    ["dificultad inválida", { diff: "imposible" }],
    ["dificultad que no es texto", { diff: 3 }],
  ])("rechaza el progreso: %s", async (_motivo, progreso) => {
    const a = await alumno();
    await expect(rpc("alu_save_progress", [a.token, progreso])).rejects.toThrow(/progreso_invalido/);
    expect((await rpc("account_me", [a.token]))[0].progress).toEqual({});
  });
  it("rechaza más de 200 fallos distintos", async () => {
    const a = await alumno();
    const miss = Object.fromEntries(
      Array.from({ length: 201 }, (_, i) => ["v" + "x".repeat(i % 20) + "y".repeat(Math.floor(i / 20)), 1])
    );
    await expect(rpc("alu_save_progress", [a.token, { miss }])).rejects.toThrow(/progreso_invalido/);
  });
  it("la tabla impide guardar un progreso enorme aunque se saltaran las funciones", async () => {
    await alumno("grande");
    await expect(
      sql(`update public.accounts set progress = jsonb_build_object('x', repeat('a', 30000)) where username = 'grande'`)
    ).rejects.toThrow(/check/);
  });
});

describe("clase por cuenta", () => {
  it("el alumno se une con su apodo; solo está en una clase a la vez", async () => {
    const p = await profe();
    const a1 = await aula(p, "1º A");
    const a2 = await aula(p, "1º B");
    const al = await alumno();
    const [j] = await rpc("alu_join_class", [al.token, " " + a1.code.toLowerCase() + " ", "  Lobo   gris "]);
    expect(j).toEqual({
      class_name: "1º A",
      alias: "Lobo gris",
      kind: "aula",
      allowed_lists: [1, 2, 3, 4, 5, 6],
      allowed_difficulties: ["easy", "normal", "hard"],
    });
    await expect(rpc("alu_join_class", [al.token, a2.code, "Otro"])).rejects.toThrow(/ya_en_clase/);
    expect(await rpc("alu_my_class", [al.token])).toEqual([
      {
        code: a1.code,
        name: "1º A",
        alias: "Lobo gris",
        kind: "aula",
        allowed_lists: [1, 2, 3, 4, 5, 6],
        allowed_difficulties: ["easy", "normal", "hard"],
        is_owner: false,
      },
    ]);
  });
  it("la tabla misma impide estar en dos clases, aunque dos peticiones coincidieran", async () => {
    const p = await profe();
    const a1 = await aula(p, "A");
    const a2 = await aula(p, "B");
    const al = await dentro(a1.code, "Primera");
    await expect(
      sql(
        `insert into public.players (class_id, alias, account_id)
         select c.id, 'Segunda', pl.account_id from public.classes c, public.players pl
         where c.code = $1 and pl.alias = 'Primera'`,
        [a2.code]
      )
    ).rejects.toThrow(/players_una_clase/);
    expect(al.alias).toBe("Primera");
  });
  it("sin clase, alu_my_class no devuelve nada", async () => {
    expect(await rpc("alu_my_class", [(await alumno()).token])).toEqual([]);
  });
  it("rechaza apodos inválidos, repetidos en la clase, clases que no existen y clases llenas", async () => {
    const p = await profe();
    const a = await aula(p);
    const al = await alumno();
    for (const alias of ["", "x", "x".repeat(21), "<b>", null])
      await expect(rpc("alu_join_class", [al.token, a.code, alias])).rejects.toThrow(/apodo_invalido/);
    await expect(rpc("alu_join_class", [al.token, "ZZZZZZ", "Ana"])).rejects.toThrow(/clase_no_existe/);
    await dentro(a.code, "Ana");
    await expect(rpc("alu_join_class", [al.token, a.code, "ANA"])).rejects.toThrow(/apodo_en_uso/);
    await sql(
      `insert into public.accounts (role, username, pass_hash, recovery_hash)
       select 'alumno', 'lleno' || g, 'x', 'y' from generate_series(1, 59) g`
    );
    await sql(
      `insert into public.players (class_id, alias, account_id)
       select c.id, 'relleno' || a.username, a.id from public.classes c, public.accounts a
       where c.code = $1 and a.username like 'lleno%'`,
      [a.code]
    );
    await expect(rpc("alu_join_class", [al.token, a.code, "Sobro"])).rejects.toThrow(/clase_llena/);
  });
  it("el mismo apodo se puede usar en otra clase", async () => {
    const p = await profe();
    const a = await aula(p, "A");
    const b = await aula(p, "B");
    await dentro(a.code, "Pipa");
    await expect(dentro(b.code, "Pipa")).resolves.toBeTruthy();
  });
  it("salir borra su sitio y sus partidas, y la cuenta sigue", async () => {
    const p = await profe();
    const a = await aula(p);
    const al = await dentro(a.code, "Se va");
    await enviar(al, 0, "normal", 24, 0);
    expect(await rpc("alu_leave_class", [al.token])).toEqual([{ alu_leave_class: true }]);
    expect(await rpc("alu_leave_class", [al.token])).toEqual([{ alu_leave_class: false }]);
    expect((await rpc("class_ranking", [a.code])).map((r) => r.alias)).not.toContain("Se va");
    await expect(rpc("account_me", [al.token])).resolves.toHaveLength(1);
    await expect(rpc("alu_join_class", [al.token, a.code, "Vuelvo"])).resolves.toHaveLength(1);
  });
});

describe("partidas por cuenta", () => {
  it("sin clase no se puede enviar", async () => {
    await expect(enviar(await alumno(), 0, "normal", 24, 0)).rejects.toThrow(/sin_clase/);
  });
  it("el servidor calcula los puntos: 10 x 12 + 3 x 50 en normal sin errores", async () => {
    const p = await profe();
    const al = await dentro((await aula(p)).code);
    expect(await enviar(al, 0, "normal", 10, 0)).toEqual([{ points: 270, stars: 3 }]);
    await envejecer(al.token);
    expect(await enviar(al, 1, "hard", 24, 3)).toEqual([{ points: 24 * 15 + 50, stars: 1 }]);
  });
  it("rechaza partidas imposibles y limita la frecuencia", async () => {
    const p = await profe();
    const al = await dentro((await aula(p)).code);
    for (const [l, d, c, m] of [
      [5, "easy", 10, 0],
      [-1, "easy", 10, 0],
      [0, "imposible", 10, 0],
      [0, "easy", 0, 0],
      [0, "easy", 201, 0],
      [0, "easy", 10, -1],
      [0, "easy", 10, 6],
    ])
      await expect(enviar(al, l, d, c, m)).rejects.toThrow(/partida_imposible/);
    await expect(enviar(al, 0, "easy", 10, 5)).resolves.toHaveLength(1);
    await expect(enviar(al, 0, "easy", 10, 0)).rejects.toThrow(/demasiado_rapido/);
  });
  it("respeta las dificultades que el profesor permite", async () => {
    const p = await profe();
    const a = await aula(p);
    const al = await dentro(a.code);
    await rpc("prof_set_config", [p.token, a.code, [1, 2], ["easy"]]);
    await expect(enviar(al, 0, "hard", 10, 0)).rejects.toThrow(/dificultad_no_permitida/);
    await expect(enviar(al, 0, "easy", 10, 0)).resolves.toHaveLength(1);
    expect(await rpc("class_info", [a.code])).toEqual([
      { name: "1º A", kind: "aula", allowed_lists: [1, 2], allowed_difficulties: ["easy"] },
    ]);
  });
  it("en las clases de aula guarda los verbos fallados y el profesor los ve; los alumnos de la clase no ven los de otros", async () => {
    const p = await profe();
    const a = await aula(p);
    const ana = await dentro(a.code, "Ana");
    await enviar(ana, 0, "normal", 24, 3, ["go", "go", "be"]);
    expect(await rpc("prof_misses", [p.token, a.code])).toEqual([
      { alias: "Ana", verb: "go", times: 2 },
      { alias: "Ana", verb: "be", times: 1 },
    ]);
    await expect(enviar(ana, 1, "normal", 24, 1, ["go", "be"])).rejects.toThrow(/demasiado_rapido|partida_imposible/);
  });
  it("en un reto NO guarda los verbos fallados, aunque el navegador los mande", async () => {
    const al = await alumno();
    const [c] = await rpc("alu_create_challenge", [al.token, "Sin fallos", "Pipa"]);
    await enviar(al, 0, "normal", 24, 2, ["go", "be"]);
    expect(
      await sql(
        "select count(*)::int as n from public.runs r join public.players p on p.id = r.player_id join public.classes c on c.id = p.class_id where c.code = $1",
        [c.code]
      )
    ).toEqual([{ n: 1 }]);
    expect(
      await sql(
        "select * from public.run_misses where run_id in (select r.id from public.runs r join public.players p on p.id = r.player_id join public.classes c on c.id = p.class_id where c.code = $1)",
        [c.code]
      )
    ).toEqual([]);
  });
  it("la función antigua con secreto sigue funcionando para el juego ya publicado", async () => {
    const [c] = await rpc("create_class", ["Antigua"]);
    const [j] = await rpc("join_class", [c.code, "Vieja"]);
    expect(await rpc("submit_run", [j.player_id, j.player_secret, 0, "normal", 10, 0, null])).toEqual([
      { points: 270, stars: 3 },
    ]);
    await expect(rpc("submit_run", [j.player_id, "mal", 0, "normal", 10, 0, null])).rejects.toThrow(
      /jugador_no_valido/
    );
  });
});

describe("retos entre amigos con cuenta", () => {
  it("el reto es de la cuenta: se crea, el creador entra y es el dueño", async () => {
    const al = await alumno();
    const [c] = await rpc("alu_create_challenge", [al.token, "Los de 1º B", "Lobo gris"]);
    expect(c.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(c.class_name).toBe("Los de 1º B");
    expect((await rpc("alu_my_class", [al.token]))[0]).toMatchObject({
      code: c.code,
      kind: "reto",
      alias: "Lobo gris",
      is_owner: true,
    });
    expect((await rpc("class_ranking", [c.code])).map((r) => r.alias)).toEqual(["Lobo gris"]);
    expect((await rpc("class_info", [c.code]))[0]).toMatchObject({ kind: "reto" });
    const [t] = await sql("select owner_id, teacher_hash, max_players from public.classes where code = $1", [c.code]);
    expect(t.owner_id).not.toBeNull();
    expect(t.teacher_hash).toBeNull();
    expect(t.max_players).toBe(30);
  });
  it("otros se unen con el código; no son dueños", async () => {
    const dueno = await alumno();
    const [c] = await rpc("alu_create_challenge", [dueno.token, "Reto", "Uno"]);
    const otro = await alumno();
    await rpc("alu_join_class", [otro.token, c.code, "Dos"]);
    expect((await rpc("alu_my_class", [otro.token]))[0].is_owner).toBe(false);
    expect((await rpc("class_ranking", [c.code])).map((r) => r.alias).sort()).toEqual(["Dos", "Uno"]);
  });
  it("validaciones: nombre, apodo, y no se crea estando en una clase", async () => {
    const al = await alumno();
    await expect(rpc("alu_create_challenge", [al.token, "<b>", "Ana"])).rejects.toThrow(/nombre_invalido/);
    await expect(rpc("alu_create_challenge", [al.token, "Bien", "x"])).rejects.toThrow(/apodo_invalido/);
    expect(await rpc("alu_my_class", [al.token])).toEqual([]);
    await rpc("alu_create_challenge", [al.token, "Bien", "Ana"]);
    await expect(rpc("alu_create_challenge", [al.token, "Otro", "Ana"])).rejects.toThrow(/ya_en_clase/);
  });
  it("máximo 5 retos por cuenta", async () => {
    const al = await alumno();
    for (let i = 0; i < 5; i++) {
      await rpc("alu_create_challenge", [al.token, `Reto ${i}`, "Ana"]);
      await rpc("alu_leave_class", [al.token]);
    }
    await expect(rpc("alu_create_challenge", [al.token, "Sexto", "Ana"])).rejects.toThrow(/demasiados_retos/);
  });
  it("solo el dueño lo borra, y se lleva a todos los participantes", async () => {
    const dueno = await alumno();
    const [c] = await rpc("alu_create_challenge", [dueno.token, "Se borra", "Uno"]);
    const otro = await alumno();
    await rpc("alu_join_class", [otro.token, c.code, "Dos"]);
    expect(await rpc("alu_delete_challenge", [otro.token, c.code])).toEqual([{ alu_delete_challenge: false }]);
    expect(await rpc("alu_delete_challenge", [dueno.token, c.code])).toEqual([{ alu_delete_challenge: true }]);
    await expect(rpc("class_ranking", [c.code])).rejects.toThrow(/clase_no_existe/);
    expect(await rpc("alu_my_class", [otro.token])).toEqual([]);
  });
  it("un alumno no puede borrar una clase de aula con alu_delete_challenge", async () => {
    const p = await profe();
    const a = await aula(p);
    expect(await rpc("alu_delete_challenge", [(await alumno()).token, a.code])).toEqual([
      { alu_delete_challenge: false },
    ]);
    expect(await rpc("class_info", [a.code])).toHaveLength(1);
  });
  it("las funciones de profesorado no ven los retos", async () => {
    const al = await alumno();
    const [c] = await rpc("alu_create_challenge", [al.token, "Reto", "Ana"]);
    const p = await profe();
    await expect(rpc("prof_set_config", [p.token, c.code, [1], ["easy"]])).rejects.toThrow(/clase_no_existe/);
    expect(await rpc("prof_classes", [p.token])).toEqual([]);
  });
  it("la tabla no admite un reto sin dueño ni hash, ni un aula con hash", async () => {
    await expect(sql("insert into public.classes (code, name, kind) values ('ABCDEF', 'x', 'reto')")).rejects.toThrow(
      /classes_tipo/
    );
    await expect(
      sql("insert into public.classes (code, name, kind, teacher_hash) values ('ABCDEG', 'x', 'aula', 'h')")
    ).rejects.toThrow(/classes_tipo/);
  });
});

describe("el profesor restablece la contraseña de un alumno", () => {
  it("le pone una temporal que se enseña una vez, obliga a cambiarla y cierra sus sesiones", async () => {
    const p = await profe();
    const a = await aula(p);
    const al = await dentro(a.code, "Olvidadizo");
    const [{ prof_reset_student: temporal }] = await rpc("prof_reset_student", [p.token, a.code, " olvidadizo "]);
    expect(temporal).toMatch(/^[a-hj-km-np-z2-9]{8}$/);
    await expect(rpc("account_me", [al.token])).rejects.toThrow(/sesion_no_valida/);
    expect((await rpc("account_login", [al.usuario, PASS]))[0].error).toBe("credenciales_invalidas");
    const [r] = await rpc("account_login", [al.usuario, temporal]);
    expect(r).toMatchObject({ role: "alumno", must_change_password: true, error: null });
    await rpc("account_change_password", [r.token, temporal, "mi nueva contraseña"]);
    expect((await rpc("account_me", [r.token]))[0].must_change_password).toBe(false);
    expect(
      (await sql("select pass_hash from public.accounts where username = $1", [al.usuario]))[0].pass_hash
    ).not.toContain(temporal);
  });
  it("desbloquea una cuenta bloqueada por intentos fallidos", async () => {
    const p = await profe();
    const a = await aula(p);
    const al = await dentro(a.code, "Bloqueado");
    for (let i = 0; i < 5; i++) await rpc("account_login", [al.usuario, "mal"]);
    expect((await rpc("account_login", [al.usuario, PASS]))[0].error).toBe("cuenta_bloqueada");
    const [{ prof_reset_student: temporal }] = await rpc("prof_reset_student", [p.token, a.code, "Bloqueado"]);
    expect((await rpc("account_login", [al.usuario, temporal]))[0].error).toBeNull();
  });
  it("solo sirve para alumnos de las clases de ese profesor", async () => {
    const p = await profe();
    const q = await profe();
    const a = await aula(p);
    await dentro(a.code, "Ana");
    await expect(rpc("prof_reset_student", [q.token, a.code, "Ana"])).rejects.toThrow(/clase_no_existe/);
    await expect(rpc("prof_reset_student", [p.token, a.code, "Nadie"])).rejects.toThrow(/alumno_no_existe/);
  });
  it("un jugador antiguo, sin cuenta, no tiene contraseña que restablecer", async () => {
    const p = await profe();
    const a = await aula(p);
    await rpc("join_class", [a.code, "Antiguo"]);
    await expect(rpc("prof_reset_student", [p.token, a.code, "Antiguo"])).rejects.toThrow(/alumno_sin_cuenta/);
  });
  it("no se puede restablecer la cuenta de otro profesor ni un alumno de un reto", async () => {
    const al = await alumno();
    const [c] = await rpc("alu_create_challenge", [al.token, "Reto", "Ana"]);
    const p = await profe();
    await expect(rpc("prof_reset_student", [p.token, c.code, "Ana"])).rejects.toThrow(/clase_no_existe/);
  });
});

describe("seguimiento del profesor con cuentas", () => {
  it("ve a cada alumno de su clase con los niveles y dificultades que ha jugado", async () => {
    const p = await profe();
    const a = await aula(p);
    const ana = await dentro(a.code, "Ana");
    await dentro(a.code, "Zoe");
    await enviar(ana, 0, "normal", 24, 0);
    await envejecer(ana.token);
    await enviar(ana, 2, "hard", 10, 0);
    const r = await rpc("prof_progress", [p.token, a.code]);
    expect(r.map((x) => [x.alias, x.level, x.difficulty, x.plays])).toEqual([
      ["Ana", 0, "normal", 1],
      ["Ana", 2, "hard", 1],
      ["Zoe", null, null, 0],
    ]);
  });
  it("quitar a un alumno solo lo saca de la clase; su cuenta sigue", async () => {
    const p = await profe();
    const a = await aula(p);
    const al = await dentro(a.code, "Ana");
    expect(await rpc("prof_remove_student", [p.token, a.code, " ana "])).toEqual([{ prof_remove_student: true }]);
    expect(await rpc("alu_my_class", [al.token])).toEqual([]);
    await expect(rpc("account_me", [al.token])).resolves.toHaveLength(1);
  });
});

describe("borrar la cuenta", () => {
  it("pide la contraseña y se lleva el progreso, el sitio en la clase y las partidas", async () => {
    const p = await profe();
    const a = await aula(p);
    const al = await dentro(a.code, "Adios");
    await enviar(al, 0, "normal", 10, 1, ["go"]);
    await expect(rpc("account_delete", [al.token, "mal"])).rejects.toThrow(/credenciales_invalidas/);
    expect(await rpc("account_delete", [al.token, PASS])).toEqual([{ account_delete: true }]);
    expect((await rpc("class_ranking", [a.code])).map((r) => r.alias)).not.toContain("Adios");
    expect(await sql("select * from public.accounts where username = $1", [al.usuario])).toEqual([]);
    expect(
      await sql("select * from public.run_misses where verb = 'go' and run_id not in (select id from public.runs)")
    ).toEqual([]);
  });
  it("si es profesor, se lleva sus clases con todos los alumnos", async () => {
    const p = await profe();
    const a = await aula(p);
    const al = await dentro(a.code, "Se queda sin clase");
    await rpc("account_delete", [p.token, PASS]);
    await expect(rpc("class_ranking", [a.code])).rejects.toThrow(/clase_no_existe/);
    expect(await rpc("alu_my_class", [al.token])).toEqual([]);
    await expect(rpc("account_me", [al.token])).resolves.toHaveLength(1);
  });
});

describe("limpieza por inactividad", () => {
  it("retos a los 3 meses y aulas a los 12", async () => {
    const p = await profe();
    const vieja = await aula(p, "Aula vieja");
    const reciente = await aula(p, "Aula de 6 meses");
    const a1 = await alumno();
    const a2 = await alumno();
    const [r1] = await rpc("alu_create_challenge", [a1.token, "Reto de 4 meses", "Ana"]);
    const [r2] = await rpc("alu_create_challenge", [a2.token, "Reto de 2 meses", "Bea"]);
    await sql("update public.classes set created_at = now() - interval '13 months' where code = $1", [vieja.code]);
    await sql("update public.classes set created_at = now() - interval '6 months' where code = $1", [reciente.code]);
    await sql("update public.classes set created_at = now() - interval '4 months' where code = $1", [r1.code]);
    await sql("update public.classes set created_at = now() - interval '2 months' where code = $1", [r2.code]);
    await sql("select private.purgar_clases_inactivas()");
    const quedan = (
      await sql(
        "select name from public.classes where name in ('Aula vieja','Aula de 6 meses','Reto de 4 meses','Reto de 2 meses') order by 1"
      )
    ).map((x) => x.name);
    expect(quedan).toEqual(["Aula de 6 meses", "Reto de 2 meses"]);
  });
  it("borra cuentas de alumno que llevan 12 meses sin entrar, y las de profesor solo si no tienen clases", async () => {
    const viejo = await alumno("alumnoviejo");
    const recien = await alumno("alumnorecien");
    await profe("profesinclases");
    const conClase = await profe("profeconclase");
    await aula(conClase);
    await sql(
      "update public.accounts set last_login = now() - interval '13 months' where username in ('alumnoviejo','profesinclases','profeconclase')"
    );
    await sql("update public.account_sessions set expires_at = now() - interval '1 day'");
    await sql("select private.purgar_clases_inactivas()");
    const quedan = (
      await sql(
        "select username from public.accounts where username in ('alumnoviejo','alumnorecien','profesinclases','profeconclase') order by 1"
      )
    ).map((x) => x.username);
    expect(quedan).toEqual(["alumnorecien", "profeconclase"]);
    expect(await sql("select 1 from public.account_sessions")).toEqual([]);
    expect([viejo.usuario, recien.usuario]).toEqual(["alumnoviejo", "alumnorecien"]);
  });
});
