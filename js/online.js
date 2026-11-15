// Clases y ranking: habla con el servidor (Supabase) usando solo fetch, sin librerías.
//
// Reglas de este módulo:
//   * El juego tiene que seguir funcionando sin conexión: nada de aquí se llama al arrancar y todo fallo
//     llega como un OnlineError con un mensaje en español listo para enseñar.
//   * Nunca se fía de lo que contesta el servidor: cada respuesta se comprueba antes de usarla.
//   * Los secretos (del jugador y de quien crea el reto) solo viven en localStorage (store) y nunca salen en
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
  usuario_invalido: "El usuario debe tener de 3 a 30 letras, números, puntos o guiones, sin espacios.",
  contrasena_invalida: "La contraseña debe tener entre 8 y 72 caracteres.",
  usuario_en_uso: "Ese usuario ya existe. Prueba con otro.",
  credenciales_invalidas: "El usuario o la contraseña no son correctos.",
  cuenta_bloqueada: "Demasiados intentos. Espera 15 minutos y vuelve a probar.",
  sesion_no_valida: "Tu sesión ha caducado. Vuelve a entrar.",
  rol_no_permitido: "Esa cuenta no puede hacer esto.",
  rol_invalido: "No he podido crear la cuenta. Inténtalo otra vez.",
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

const USUARIO = /^[A-Za-z0-9._-]{3,30}$/;
const CLAVE_RECUPERACION = /^[0-9a-f]{40}$/;
const ROLES = ["alumno", "profe"];

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

  /** Comprueba usuario y contraseña antes de molestar al servidor. */
  function credenciales(usuario, clave) {
    const u = String(usuario ?? "").trim();
    if (!USUARIO.test(u)) throw new OnlineError("usuario_invalido");
    const c = String(clave ?? "");
    if (c.length < 8 || c.length > 72) throw new OnlineError("contrasena_invalida");
    return u;
  }
  const guardarSesion = (token, role, username) => {
    store.set("acc", { token, role, username });
    store.set("hadacc", true);
  };

  return {
    /** La cuenta con la que se ha entrado en este navegador ({role, username}), o null. Nunca incluye la ficha de acceso. */
    account() {
      const a = store.get("acc", null);
      return a ? { role: a.role, username: a.username } : null;
    },

    /** Crea una cuenta y entra con ella. Devuelve el código de recuperación, que no se vuelve a mostrar. */
    async register(role, usuario, clave) {
      if (!ROLES.includes(role)) throw new OnlineError("rol_invalido");
      const u = credenciales(usuario, clave);
      const r = primera(await rpc("account_register", { p_role: role, p_username: u, p_password: String(clave) }));
      if (!r || !SECRETO.test(r.token) || !CLAVE_RECUPERACION.test(r.recovery_code)) throw malaRespuesta();
      guardarSesion(r.token, role, u);
      return { recoveryCode: r.recovery_code };
    },

    /** Entra con usuario y contraseña. Devuelve el rol y si hay que cambiar la contraseña (por ser una temporal). */
    async login(usuario, clave) {
      const u = String(usuario ?? "").trim();
      if (!USUARIO.test(u) || !String(clave ?? "")) throw new OnlineError("credenciales_invalidas");
      const r = primera(await rpc("account_login", { p_username: u, p_password: String(clave) }));
      if (!r) throw malaRespuesta();
      if (r.error) throw new OnlineError(r.error);
      if (!SECRETO.test(r.token) || !ROLES.includes(r.role) || typeof r.must_change_password !== "boolean")
        throw malaRespuesta();
      guardarSesion(r.token, r.role, u);
      return { role: r.role, mustChange: r.must_change_password };
    },

    /** Contraseña olvidada: con el código de recuperación se pone una nueva y se entra. Devuelve el código nuevo. */
    async resetPassword(usuario, codigo, nueva) {
      const u = credenciales(usuario, nueva);
      const c = String(codigo ?? "")
        .toLowerCase()
        .replace(/[^0-9a-f]/g, "");
      if (!CLAVE_RECUPERACION.test(c)) throw new OnlineError("credenciales_invalidas");
      const r = primera(
        await rpc("account_reset_password", { p_username: u, p_recovery_code: c, p_new_password: String(nueva) })
      );
      if (!r) throw malaRespuesta();
      if (r.error) throw new OnlineError(r.error);
      if (!SECRETO.test(r.token) || !CLAVE_RECUPERACION.test(r.recovery_code) || !ROLES.includes(r.role))
        throw malaRespuesta();
      guardarSesion(r.token, r.role, u);
      return { role: r.role, recoveryCode: r.recovery_code };
    },

    /** Cambia la contraseña conociendo la actual (obligatorio tras una contraseña temporal). */
    async changePassword(actual, nueva) {
      const a = store.get("acc", null);
      if (!a) throw new OnlineError("sesion_no_valida");
      const n = String(nueva ?? "");
      if (n.length < 8 || n.length > 72) throw new OnlineError("contrasena_invalida");
      try {
        const ok = await rpc("account_change_password", { p_token: a.token, p_old: String(actual ?? ""), p_new: n });
        if (ok !== true) throw malaRespuesta();
      } catch (e) {
        if (e.code === "sesion_no_valida") store.remove("acc");
        throw e;
      }
      return true;
    },

    /** Cierra la sesión. Aunque no haya conexión, en este navegador se cierra siempre. */
    async logout() {
      const a = store.get("acc", null);
      store.remove("acc");
      if (!a) return;
      try {
        await rpc("account_logout", { p_token: a.token });
      } catch {
        /* sin conexión: la sesión del servidor caducará sola */
      }
    },

    /** Datos públicos de la clase en la que está este navegador, o null. Nunca incluye el secreto. */
    session() {
      const s = store.get("cls", null);
      return s ? { code: s.code, name: s.name, alias: s.alias } : null;
    },
    /** Datos del reto creado desde este navegador (código y clave de quien lo creó), o null. */
    challengeOwner() {
      return store.get("teach", null);
    },

    /** «Reta a tus amigos»: crea un reto, entra en él con el apodo dado y recuerda la clave para poder borrarlo. */
    async createChallenge(name, alias) {
      const a = cleanAlias(alias ?? "");
      if (!validAlias(a)) throw new OnlineError("apodo_invalido");
      const r = primera(await rpc("create_challenge", { p_name: String(name ?? ""), p_alias: a }));
      if (
        !r ||
        !CODIGO.test(r.code) ||
        !SECRETO.test(r.teacher_secret) ||
        !UUID.test(r.player_id) ||
        !SECRETO.test(r.player_secret) ||
        typeof r.class_name !== "string" ||
        r.class_name.length < 1 ||
        r.class_name.length > 40
      )
        throw malaRespuesta();
      store.set("teach", { code: r.code, secret: r.teacher_secret });
      store.set("cls", { code: r.code, name: r.class_name, alias: a, id: r.player_id, secret: r.player_secret });
      return { code: r.code, name: r.class_name, alias: a };
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
      store.set("cls", { code: c, name: r.class_name, alias: a, id: r.player_id, secret: r.player_secret });
      return { code: c, name: r.class_name, alias: a };
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

    /** Quien creó el reto lo borra entero, con todos sus participantes y partidas. */
    async deleteChallenge() {
      const t = store.get("teach", null);
      if (!t) throw new OnlineError("sin_clase");
      const ok = await rpc("teacher_delete_class", { p_code: t.code, p_teacher_secret: t.secret });
      if (typeof ok !== "boolean") throw malaRespuesta();
      store.remove("teach");
      // Si este navegador estaba dentro del reto, su jugador se borró con él.
      if ((store.get("cls", null) || {}).code === t.code) store.remove("cls");
      return ok;
    },
  };
}

export const online = createClient();
