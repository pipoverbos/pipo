// Clases y ranking: habla con el servidor (Supabase) usando solo fetch, sin librerías.
//
// Reglas de este módulo:
//   * El juego tiene que seguir funcionando sin conexión: nada de aquí se llama al arrancar y todo fallo
//     llega como un OnlineError con un mensaje en español listo para enseñar.
//   * Nunca se fía de lo que contesta el servidor: cada respuesta se comprueba antes de usarla.
//   * Los secretos (del jugador y de quien crea la clase) solo viven en localStorage (store) y nunca salen en
//     mensajes de error ni en el registro.
import { store } from "./store.js";
import { ONLINE } from "./data/config.js";
import { cleanAlias, validAlias } from "./utils.js";

const CODIGO = /^[A-HJ-NP-Z2-9]{6}$/;
const SECRETO = /^[0-9a-f]{32}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Mensajes para el alumnado. Las claves son los códigos de error de la base de datos más los propios de este módulo. */
export const MENSAJES = {
  nombre_invalido: "El nombre de la clase debe tener de 1 a 40 caracteres y sin símbolos raros.",
  apodo_invalido: "Tu apodo debe tener de 2 a 20 letras o números.",
  codigo_invalido: "El código de la clase tiene 6 letras o números.",
  clase_no_existe: "No encuentro esa clase. Revisa el código.",
  clase_llena: "Esa clase ya está llena.",
  apodo_en_uso: "Ese apodo ya lo usa otra persona de la clase. Prueba con otro.",
  jugador_no_valido: "Ya no formas parte de esa clase. Puede que te hayan quitado.",
  partida_imposible: "No he podido guardar esa partida.",
  demasiado_rapido: "Vas muy rápido. Espera unos segundos y vuelve a intentarlo.",
  sin_codigo_libre: "No he podido crear la clase. Inténtalo otra vez.",
  sin_clase: "No estás en ninguna clase.",
  sin_conexion: "No hay conexión. Puedes seguir jugando e intentarlo más tarde.",
  tiempo_agotado: "El servidor tarda demasiado. Inténtalo más tarde.",
  error_servidor: "Algo ha fallado al hablar con el servidor. Inténtalo más tarde.",
};

export class OnlineError extends Error {
  constructor(code) {
    super(MENSAJES[code] || MENSAJES.error_servidor);
    this.name = "OnlineError";
    this.code = MENSAJES[code] ? code : "error_servidor";
  }
}

/** Deja el código de clase en mayúsculas y sin espacios. Devuelve null si no tiene el formato correcto. */
export function cleanCode(s) {
  const c = String(s ?? "")
    .replace(/\s+/g, "")
    .toUpperCase();
  return CODIGO.test(c) ? c : null;
}

const esEntero = (n) => Number.isInteger(n) && n >= 0;
const malaRespuesta = () => new OnlineError("error_servidor");

/**
 * Crea un cliente. Los parámetros existen para poder probarlo con un servidor falso; el juego usa `online`.
 */
export function createClient({ url, key, timeoutMs = 8000, fetchFn = (...a) => globalThis.fetch(...a) } = ONLINE) {
  /** Llama a una función del servidor y devuelve su respuesta ya convertida de JSON. */
  async function rpc(fn, args) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    let status, texto;
    try {
      const res = await fetchFn(`${url}/rest/v1/rpc/${fn}`, {
        method: "POST",
        headers: { apikey: key, "Content-Type": "application/json" },
        body: JSON.stringify(args),
        signal: ctl.signal,
      });
      status = res.status;
      texto = await res.text();
    } catch (e) {
      throw new OnlineError(e && e.name === "AbortError" ? "tiempo_agotado" : "sin_conexion");
    } finally {
      clearTimeout(timer);
    }
    let cuerpo;
    try {
      cuerpo = JSON.parse(texto);
    } catch {
      cuerpo = undefined;
    }
    if (status >= 200 && status < 300) {
      if (cuerpo === undefined) throw malaRespuesta();
      return cuerpo;
    }
    if (status === 429) throw new OnlineError("demasiado_rapido");
    // Los errores propios de la base de datos llegan como {code:"P0001", message:"apodo_en_uso"}.
    const mensaje = cuerpo && typeof cuerpo.message === "string" ? cuerpo.message : "";
    throw new OnlineError(mensaje in MENSAJES ? mensaje : "error_servidor");
  }

  const primera = (r) => (Array.isArray(r) && r.length === 1 && r[0] && typeof r[0] === "object" ? r[0] : null);

  return {
    /** Datos públicos de la clase en la que está este navegador, o null. Nunca incluye el secreto. */
    session() {
      const s = store.get("cls", null);
      return s ? { code: s.code, name: s.name } : null;
    },
    /** Datos de la clase creada desde este navegador (código y clave de quien la creó), o null. */
    teacherSession() {
      return store.get("teach", null);
    },

    /** Crea una clase. Guarda la clave de quien la crea para poder borrarla luego. Devuelve el código. */
    async createClass(name) {
      const r = primera(await rpc("create_class", { p_name: String(name ?? "") }));
      if (!r || !CODIGO.test(r.code) || !SECRETO.test(r.teacher_secret)) throw malaRespuesta();
      store.set("teach", { code: r.code, secret: r.teacher_secret });
      return { code: r.code };
    },

    /** Entra en una clase con un apodo y la recuerda en este navegador. */
    async joinClass(code, alias) {
      const c = cleanCode(code);
      if (!c) throw new OnlineError("codigo_invalido");
      const a = cleanAlias(alias ?? "");
      if (!validAlias(a)) throw new OnlineError("apodo_invalido");
      const r = primera(await rpc("join_class", { p_code: c, p_alias: a }));
      if (!r || !UUID.test(r.player_id) || !SECRETO.test(r.player_secret)) throw malaRespuesta();
      if (typeof r.class_name !== "string" || r.class_name.length < 1 || r.class_name.length > 40)
        throw malaRespuesta();
      store.set("cls", { code: c, name: r.class_name, id: r.player_id, secret: r.player_secret });
      return { code: c, name: r.class_name };
    },

    /** Envía una partida terminada. Devuelve los puntos y las estrellas que calcula el servidor. */
    async submitRun({ level, difficulty, correct, mistakes }) {
      const s = store.get("cls", null);
      if (!s) throw new OnlineError("sin_clase");
      let r;
      try {
        r = primera(
          await rpc("submit_run", {
            p_player: s.id,
            p_secret: s.secret,
            p_level: level,
            p_difficulty: difficulty,
            p_correct: correct,
            p_mistakes: mistakes,
          })
        );
      } catch (e) {
        if (e.code === "jugador_no_valido") store.remove("cls"); // ya no estamos en la clase: se deja de enviar
        throw e;
      }
      if (!r || !esEntero(r.points) || !esEntero(r.stars)) throw malaRespuesta();
      return { points: r.points, stars: r.stars };
    },

    /** Ranking de una clase (por defecto, la de este navegador): lista de {alias, points, levels}. */
    async ranking(code) {
      const c = cleanCode(code ?? (store.get("cls", null) || {}).code);
      if (!c) throw new OnlineError(code === undefined && !store.get("cls", null) ? "sin_clase" : "codigo_invalido");
      const r = await rpc("class_ranking", { p_code: c });
      if (!Array.isArray(r)) throw malaRespuesta();
      return r.slice(0, 100).map((f) => {
        if (!f || typeof f.alias !== "string" || !esEntero(f.points) || !esEntero(f.levels)) throw malaRespuesta();
        return { alias: f.alias, points: f.points, levels: f.levels };
      });
    },

    /** El alumno sale de la clase y el servidor borra su apodo y sus partidas. */
    async leaveClass() {
      const s = store.get("cls", null);
      if (!s) throw new OnlineError("sin_clase");
      let ok;
      try {
        ok = await rpc("leave_class", { p_player: s.id, p_secret: s.secret });
      } catch (e) {
        if (e.code !== "jugador_no_valido") throw e; // sin conexión: se conserva para poder reintentarlo
        ok = true;
      }
      if (typeof ok !== "boolean") throw malaRespuesta();
      // Si el servidor dice que no hay nada que borrar, ya estaba borrado: se olvida igualmente.
      store.remove("cls");
      return ok;
    },

    /** Quien creó la clase borra a un alumno. Devuelve si había alguien con ese apodo. */
    async teacherRemovePlayer(alias) {
      const t = store.get("teach", null);
      if (!t) throw new OnlineError("sin_clase");
      const ok = await rpc("teacher_remove_player", {
        p_code: t.code,
        p_teacher_secret: t.secret,
        p_alias: String(alias ?? ""),
      });
      if (typeof ok !== "boolean") throw malaRespuesta();
      return ok;
    },

    /** Quien creó la clase la borra entera, con todos sus alumnos y partidas. */
    async teacherDeleteClass() {
      const t = store.get("teach", null);
      if (!t) throw new OnlineError("sin_clase");
      const ok = await rpc("teacher_delete_class", { p_code: t.code, p_teacher_secret: t.secret });
      if (typeof ok !== "boolean") throw malaRespuesta();
      if (ok) store.remove("teach");
      return ok;
    },
  };
}

export const online = createClient();
