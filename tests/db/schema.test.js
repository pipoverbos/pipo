// @vitest-environment node
// Prueba el esquema de supabase/migrations sobre PostgreSQL de verdad (PGlite) y llamando a las funciones
// con el rol «anon», que es lo que hará el navegador con la clave pública de Supabase.
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

let db;

/** Consulta como superusuario (para preparar y comprobar datos). */
const sql = async (text, params = []) => (await db.query(text, params)).rows;

/** Llama a una función pública como «anon». */
async function rpc(fn, args = []) {
  await db.exec("set role anon");
  try {
    const marcadores = args.map((_, i) => "$" + (i + 1)).join(", ");
    return (await db.query(`select * from public.${fn}(${marcadores})`, args)).rows;
  } finally {
    await db.exec("reset role");
  }
}

/** Ejecuta una consulta cualquiera como «anon». */
async function comoAnon(text) {
  await db.exec("set role anon");
  try {
    return (await db.query(text)).rows;
  } finally {
    await db.exec("reset role");
  }
}

const crearClase = async (nombre = "1º ESO B") => (await rpc("create_class", [nombre]))[0];
const unirse = async (code, alias) => (await rpc("join_class", [code, alias]))[0];
/** Una clase con un jugador ya dentro. */
async function jugador(alias = "Ana") {
  const clase = await crearClase();
  const j = await unirse(clase.code, alias);
  return { ...clase, ...j };
}
/** Adelanta las partidas de un jugador para saltarse el límite de frecuencia. */
const envejecer = (id) =>
  sql("update public.runs set created_at = now() - interval '1 minute' where player_id = $1", [id]);
const enviar = (j, level, difficulty, correct, mistakes) =>
  rpc("submit_run", [j.player_id, j.player_secret, level, difficulty, correct, mistakes]);

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  // Lo que Supabase trae ya puesto: roles, esquema de extensiones y permisos por defecto en «public».
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema extensions;
    grant usage on schema public, extensions to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated;
  `);
  const migracion = path.resolve(import.meta.dirname, "../../supabase/migrations/0001_clases_y_ranking.sql");
  await db.exec(fs.readFileSync(migracion, "utf8"));
}, 60000);

afterAll(() => db?.close());

describe("las tablas y los ayudantes están cerrados para el navegador", () => {
  for (const tabla of ["classes", "players", "runs"]) {
    it(`anon no puede leer, escribir ni borrar «${tabla}»`, async () => {
      await expect(comoAnon(`select * from public.${tabla}`)).rejects.toThrow(/permission denied/);
      await expect(comoAnon(`delete from public.${tabla}`)).rejects.toThrow(/permission denied/);
      await expect(comoAnon(`update public.${tabla} set created_at = now()`)).rejects.toThrow(/permission denied/);
    });
  }
  it("anon no puede insertar directamente", async () => {
    await expect(
      comoAnon("insert into public.classes (code, name, teacher_hash) values ('ABCDEF', 'x', 'y')")
    ).rejects.toThrow(/permission denied/);
  });
  it("anon no puede llamar a los ayudantes ni a la limpieza (esquema private)", async () => {
    await expect(comoAnon("select private.purgar_clases_inactivas()")).rejects.toThrow(/permission denied/);
    await expect(comoAnon("select private.hash('a')")).rejects.toThrow(/permission denied/);
  });
  it("solo hay siete funciones públicas, todas ejecutables por anon", async () => {
    const f = await sql(`
      select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' order by 1`);
    expect(f.map((x) => x.proname)).toEqual([
      "class_ranking",
      "create_class",
      "join_class",
      "leave_class",
      "submit_run",
      "teacher_delete_class",
      "teacher_remove_player",
    ]);
    expect(f.every((x) => x.anon)).toBe(true);
  });
  it("todas las tablas tienen RLS activado", async () => {
    const t = await sql(
      `select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'`
    );
    expect(t).toHaveLength(3);
    expect(t.every((x) => x.relrowsecurity)).toBe(true);
  });
});

describe("create_class", () => {
  it("devuelve un código de 6 caracteres sin letras confusas y una clave de 32 hex", async () => {
    const c = await crearClase();
    expect(c.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(c.teacher_secret).toMatch(/^[0-9a-f]{32}$/);
  });
  it("en la base de datos solo queda el hash de la clave, nunca la clave", async () => {
    const c = await crearClase();
    const [fila] = await sql("select teacher_hash from public.classes where code = $1", [c.code]);
    expect(fila.teacher_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(fila.teacher_hash).not.toContain(c.teacher_secret);
  });
  it("los códigos no se repiten", async () => {
    const codigos = new Set();
    for (let i = 0; i < 25; i++) codigos.add((await crearClase()).code);
    expect(codigos.size).toBe(25);
  });
  it("limpia espacios y rechaza nombres vacíos, largos o con símbolos peligrosos", async () => {
    const c = await crearClase("  2º   ESO  A ");
    expect((await sql("select name from public.classes where code = $1", [c.code]))[0].name).toBe("2º ESO A");
    for (const malo of ["", "   ", "a".repeat(41), "<b>x</b>", null]) {
      await expect(rpc("create_class", [malo]), String(malo)).rejects.toThrow("nombre_invalido");
    }
  });
});

describe("join_class", () => {
  it("une al alumno y devuelve su id, su secreto y el nombre de la clase", async () => {
    const c = await crearClase("Clase X");
    const j = await unirse(c.code, "Ana");
    expect(j.player_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(j.player_secret).toMatch(/^[0-9a-f]{32}$/);
    expect(j.class_name).toBe("Clase X");
    const [fila] = await sql("select secret_hash from public.players where id = $1", [j.player_id]);
    expect(fila.secret_hash).toMatch(/^[0-9a-f]{64}$/);
  });
  it("acepta el código en minúsculas y con espacios, y normaliza el apodo", async () => {
    const c = await crearClase();
    const j = await unirse(`  ${c.code.toLowerCase()} `, "  Ana   Mª ");
    expect((await sql("select alias from public.players where id = $1", [j.player_id]))[0].alias).toBe("Ana Mª");
  });
  it("rechaza una clase que no existe", async () => {
    await expect(rpc("join_class", ["ZZZZZZ", "Ana"])).rejects.toThrow("clase_no_existe");
    await expect(rpc("join_class", [null, "Ana"])).rejects.toThrow("clase_no_existe");
  });
  it("rechaza apodos inválidos", async () => {
    const c = await crearClase();
    for (const malo of ["", "A", " ", "a".repeat(21), "<script>", 'a"b', "a/b", "a\\b", "a@b", "a\u0007b", null]) {
      await expect(rpc("join_class", [c.code, malo]), String(malo)).rejects.toThrow("apodo_invalido");
    }
  });
  it("no deja repetir un apodo en la misma clase (sin distinguir mayúsculas), pero sí en otra", async () => {
    const c = await crearClase();
    await unirse(c.code, "Ana");
    await expect(rpc("join_class", [c.code, "ANA"])).rejects.toThrow("apodo_en_uso");
    const otra = await crearClase();
    await expect(unirse(otra.code, "Ana")).resolves.toBeTruthy();
  });
  it("una clase admite como mucho 60 alumnos", async () => {
    const c = await crearClase();
    await sql(
      `insert into public.players (class_id, alias, secret_hash)
       select (select id from public.classes where code = $1), 'Alumno ' || i, 'x' from generate_series(1, 60) i`,
      [c.code]
    );
    await expect(rpc("join_class", [c.code, "Uno más"])).rejects.toThrow("clase_llena");
  });
});

describe("submit_run: el servidor calcula los puntos y rechaza lo imposible", () => {
  it("calcula estrellas y puntos él mismo (sin errores, normal: 10 x 12 + 3 x 50)", async () => {
    const j = await jugador();
    expect(await enviar(j, 0, "normal", 10, 0)).toEqual([{ points: 270, stars: 3 }]);
  });
  it("estrellas según errores: 0 → 3, 1-2 → 2, más → 1", async () => {
    const j = await jugador();
    const estrellas = [];
    for (const errores of [0, 1, 2, 3, 4]) {
      estrellas.push((await enviar(j, 1, "easy", 10, errores))[0].stars);
      await envejecer(j.player_id);
    }
    expect(estrellas).toEqual([3, 2, 2, 1, 1]);
  });
  it("la dificultad suma puntos: fácil 10, normal 12, difícil 15 por acierto", async () => {
    const j = await jugador();
    const puntos = [];
    for (const d of ["easy", "normal", "hard"]) {
      puntos.push((await enviar(j, 2, d, 10, 0))[0].points);
      await envejecer(j.player_id);
    }
    expect(puntos).toEqual([250, 270, 300]);
  });
  it("rechaza un secreto o un jugador que no es", async () => {
    const j = await jugador();
    await expect(rpc("submit_run", [j.player_id, "no-es-el-secreto", 0, "easy", 10, 0])).rejects.toThrow(
      "jugador_no_valido"
    );
    await expect(
      rpc("submit_run", ["00000000-0000-0000-0000-000000000000", j.player_secret, 0, "easy", 10, 0])
    ).rejects.toThrow("jugador_no_valido");
    await expect(rpc("submit_run", [j.player_id, null, 0, "easy", 10, 0])).rejects.toThrow("jugador_no_valido");
  });
  it("el secreto de otro jugador no sirve", async () => {
    const a = await jugador("Ana");
    const b = await jugador("Beto");
    await expect(rpc("submit_run", [a.player_id, b.player_secret, 0, "easy", 10, 0])).rejects.toThrow(
      "jugador_no_valido"
    );
  });
  it("rechaza partidas imposibles", async () => {
    const j = await jugador();
    const malas = [
      [5, "easy", 10, 0], // nivel fuera de rango
      [-1, "easy", 10, 0],
      [0, "imposible", 10, 0], // dificultad desconocida
      [0, "easy", 0, 0], // sin aciertos
      [0, "easy", 201, 0], // demasiados aciertos
      [0, "easy", 10, -1], // errores negativos
      [0, "easy", 9, 5], // con 9 aciertos como mucho 4 errores: con 5 ya estaría muerto
      [0, "easy", 10, 6], // con 10 aciertos hay una vida extra: máximo 5 errores
      [0, null, 10, 0],
    ];
    for (const m of malas)
      await expect(rpc("submit_run", [j.player_id, j.player_secret, ...m]), JSON.stringify(m)).rejects.toThrow(
        "partida_imposible"
      );
  });
  it("acepta el máximo de errores posible con una vida extra", async () => {
    const j = await jugador();
    await expect(enviar(j, 0, "easy", 10, 5)).resolves.toBeTruthy();
  });
  it("limita la frecuencia: dos envíos seguidos no pasan", async () => {
    const j = await jugador();
    await enviar(j, 0, "easy", 10, 0);
    await expect(enviar(j, 1, "easy", 10, 0)).rejects.toThrow("demasiado_rapido");
    await envejecer(j.player_id);
    await expect(enviar(j, 1, "easy", 10, 0)).resolves.toBeTruthy();
  });
  it("no hay forma de enviar puntos propios: la función no tiene ese parámetro", async () => {
    const [f] = await sql(`select pg_get_function_arguments(oid) as args from pg_proc where proname = 'submit_run'`);
    expect(f.args).not.toMatch(/point|punto|star|estrella/i);
  });
});

describe("class_ranking", () => {
  it("devuelve solo apodo, puntos y niveles (ningún identificador), ordenado por puntos", async () => {
    const c = await crearClase();
    const ana = await unirse(c.code, "Ana");
    const beto = await unirse(c.code, "Beto");
    await unirse(c.code, "Cris"); // sin partidas: también aparece, con 0
    await enviar({ ...ana }, 0, "easy", 10, 0); // 250
    await enviar({ ...beto }, 0, "hard", 10, 0); // 300
    const r = await rpc("class_ranking", [c.code]);
    expect(Object.keys(r[0]).sort()).toEqual(["alias", "levels", "points"]);
    expect(r.map((x) => [x.alias, x.points, x.levels])).toEqual([
      ["Beto", 300, 1],
      ["Ana", 250, 1],
      ["Cris", 0, 0],
    ]);
  });
  it("de cada nivel y dificultad cuenta solo la mejor partida: repetir no acumula", async () => {
    const c = await crearClase();
    const ana = await unirse(c.code, "Ana");
    for (const errores of [3, 0, 0]) {
      await enviar(ana, 0, "easy", 10, errores); // 150 (1 estrella), luego 250
      await envejecer(ana.player_id);
    }
    await enviar(ana, 1, "easy", 10, 0); // otro nivel: suma
    const r = await rpc("class_ranking", [c.code]);
    expect(r).toEqual([{ alias: "Ana", points: 500, levels: 2 }]);
  });
  it("solo ve a los de su clase", async () => {
    const a = await crearClase();
    const b = await crearClase();
    await unirse(a.code, "Solo en A");
    await unirse(b.code, "Solo en B");
    expect((await rpc("class_ranking", [a.code])).map((x) => x.alias)).toEqual(["Solo en A"]);
  });
  it("rechaza una clase que no existe", async () => {
    await expect(rpc("class_ranking", ["ZZZZZZ"])).rejects.toThrow("clase_no_existe");
  });
});

describe("borrar datos", () => {
  it("el alumno se borra a sí mismo, con sus partidas, solo con su secreto", async () => {
    const j = await jugador();
    await enviar(j, 0, "easy", 10, 0);
    expect(await rpc("leave_class", [j.player_id, "secreto-erroneo"])).toEqual([{ leave_class: false }]);
    expect((await sql("select count(*)::int as n from public.players where id = $1", [j.player_id]))[0].n).toBe(1);
    expect(await rpc("leave_class", [j.player_id, j.player_secret])).toEqual([{ leave_class: true }]);
    expect((await sql("select count(*)::int as n from public.players where id = $1", [j.player_id]))[0].n).toBe(0);
    expect((await sql("select count(*)::int as n from public.runs where player_id = $1", [j.player_id]))[0].n).toBe(0);
  });
  it("quien creó la clase borra a un alumno, solo con su clave y de su clase", async () => {
    const c = await crearClase();
    const otra = await crearClase();
    await unirse(c.code, "Ana");
    expect(await rpc("teacher_remove_player", [c.code, "clave-erronea", "Ana"])).toEqual([
      { teacher_remove_player: false },
    ]);
    expect(await rpc("teacher_remove_player", [c.code, otra.teacher_secret, "Ana"])).toEqual([
      { teacher_remove_player: false },
    ]);
    expect(await rpc("teacher_remove_player", [c.code, c.teacher_secret, "ana"])).toEqual([
      { teacher_remove_player: true },
    ]);
    expect(await rpc("class_ranking", [c.code])).toEqual([]);
  });
  it("quien creó la clase la borra entera, con alumnos y partidas, solo con su clave", async () => {
    const j = await jugador();
    await enviar(j, 0, "easy", 10, 0);
    expect(await rpc("teacher_delete_class", [j.code, "clave-erronea"])).toEqual([{ teacher_delete_class: false }]);
    expect(await rpc("teacher_delete_class", [j.code, j.teacher_secret])).toEqual([{ teacher_delete_class: true }]);
    await expect(rpc("class_ranking", [j.code])).rejects.toThrow("clase_no_existe");
    expect((await sql("select count(*)::int as n from public.runs where player_id = $1", [j.player_id]))[0].n).toBe(0);
  });
  it("la limpieza borra las clases sin actividad en 12 meses y respeta las demás", async () => {
    const vieja = await jugador("Vieja");
    const conPartidaReciente = await jugador("Activa");
    const reciente = await crearClase();
    await enviar(vieja, 0, "easy", 10, 0);
    await enviar(conPartidaReciente, 0, "easy", 10, 0);
    // Hace 13 meses: la clase «vieja» entera; de «conPartidaReciente» solo la clase (su partida es de ahora).
    await sql("update public.classes set created_at = now() - interval '13 months' where code in ($1, $2)", [
      vieja.code,
      conPartidaReciente.code,
    ]);
    await sql("update public.runs set created_at = now() - interval '13 months' where player_id = $1", [
      vieja.player_id,
    ]);
    const [{ purgar_clases_inactivas: n }] = await sql("select private.purgar_clases_inactivas()");
    expect(n).toBeGreaterThanOrEqual(1);
    const quedan = (await sql("select code from public.classes")).map((x) => x.code);
    expect(quedan).not.toContain(vieja.code);
    expect(quedan).toContain(conPartidaReciente.code);
    expect(quedan).toContain(reciente.code);
  });
});
