// Clases y ranking: habla con el servidor (Supabase) usando solo fetch, sin librerías.
//
// Reglas de este módulo:
//   * El juego tiene que seguir funcionando sin conexión: nada de aquí se llama al arrancar y todo fallo
//     llega como un OnlineError con un mensaje en español listo para enseñar.
//   * Nunca se fía de lo que contesta el servidor: cada respuesta se comprueba antes de usarla.
//   * La ficha de acceso de la cuenta solo vive en localStorage (store) y nunca sale en mensajes de error ni en el
//     registro.
import { store } from "./store.js";
import { ONLINE } from "./data/config.js";
import { cleanAlias, validAlias } from "./utils.js";

const CODIGO = /^[A-HJ-NP-Z2-9]{6}$/;
const SECRETO = /^[0-9a-f]{32}$/;

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
  ya_en_clase: "Ya estás en una clase. Sal de ella antes de unirte a otra.",
  demasiados_retos: "Ya has creado muchos retos. Borra alguno para crear otro.",
  progreso_invalido: "No he podido guardar tu progreso.",
  dificultad_no_permitida: "Tu profe no permite esa dificultad en esta clase.",
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
const TODAS_LAS_LISTAS = [1, 2, 3, 4, 5, 6];
const TODAS_LAS_DIFICULTADES = ["easy", "normal", "hard"];

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

  /** Ejecuta una llamada con la sesión de la cuenta; si el servidor dice que ya no vale, se olvida en este navegador. */
  async function conSesion(cuenta, llamada) {
    try {
      return await llamada();
    } catch (e) {
      if (e.code === "sesion_no_valida") {
        store.remove("acc");
        store.remove("cls");
      }
      throw e;
    }
  }
  const nombreValido = (n) => typeof n === "string" && n.length >= 1 && n.length <= 40;
  /** Guarda la copia local de la clase a partir de lo que contesta el servidor (que es quien manda). */
  function guardarClase(r, alias, nombre, dueno, codigo = r.code) {
    const lists = Array.isArray(r.allowed_lists) ? r.allowed_lists : TODAS_LAS_LISTAS;
    const diffs = Array.isArray(r.allowed_difficulties) ? r.allowed_difficulties : TODAS_LAS_DIFICULTADES;
    if (!nombreValido(nombre) || (r.kind !== "aula" && r.kind !== "reto")) throw malaRespuesta();
    store.set("cls", { code: codigo, name: nombre, alias, kind: r.kind, owner: dueno === true, lists, diffs });
  }

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

    /** Borra la cuenta (pide la contraseña) y con ella el progreso, el sitio en la clase y los retos propios. */
    async deleteAccount(clave) {
      const a = store.get("acc", null);
      if (!a) throw new OnlineError("sesion_no_valida");
      const ok = await conSesion(a, () => rpc("account_delete", { p_token: a.token, p_password: String(clave ?? "") }));
      if (ok !== true) throw malaRespuesta();
      store.remove("acc");
      store.remove("cls");
      return true;
    },

    /** La cuenta tal como la ve el servidor: rol, usuario y progreso guardado. */
    async me() {
      const a = store.get("acc", null);
      if (!a) throw new OnlineError("sesion_no_valida");
      const r = primera(await conSesion(a, () => rpc("account_me", { p_token: a.token })));
      if (
        !r ||
        !ROLES.includes(r.role) ||
        typeof r.username !== "string" ||
        r.progress === null ||
        typeof r.progress !== "object" ||
        Array.isArray(r.progress)
      )
        throw malaRespuesta();
      return { role: r.role, username: r.username, progress: r.progress, mustChange: r.must_change_password === true };
    },

    /** Guarda el progreso del alumno (estrellas, verbos elegidos, fallos y dificultad) en su cuenta. */
    async saveProgress(progress) {
      const a = store.get("acc", null);
      if (!a) throw new OnlineError("sesion_no_valida");
      const ok = await conSesion(a, () => rpc("alu_save_progress", { p_token: a.token, p_progress: progress }));
      if (ok !== true) throw malaRespuesta();
      return true;
    },

    /** Datos públicos de la clase en la que está este navegador, o null (copia de lo que dice el servidor). */
    session() {
      const s = store.get("cls", null);
      return s
        ? { code: s.code, name: s.name, alias: s.alias, kind: s.kind, isOwner: s.owner, lists: s.lists, diffs: s.diffs }
        : null;
    },

    /** Pregunta al servidor en qué clase está la cuenta y actualiza la copia de este navegador. */
    async refreshClass() {
      const a = store.get("acc", null);
      if (!a || a.role !== "alumno") return null;
      const r = await conSesion(a, () => rpc("alu_my_class", { p_token: a.token }));
      if (!Array.isArray(r) || r.length > 1) throw malaRespuesta();
      if (r.length === 0) {
        store.remove("cls");
        return null;
      }
      guardarClase(r[0], r[0].alias, r[0].name, r[0].is_owner);
      return this.session();
    },

    /** «Reta a tus amigos»: crea un reto cuyo dueño es esta cuenta y entra en él con el apodo dado. */
    async createChallenge(name, alias) {
      const a = store.get("acc", null);
      if (!a) throw new OnlineError("sesion_no_valida");
      const ap = cleanAlias(alias ?? "");
      if (!validAlias(ap)) throw new OnlineError("apodo_invalido");
      const r = primera(
        await conSesion(a, () =>
          rpc("alu_create_challenge", { p_token: a.token, p_name: String(name ?? ""), p_alias: ap })
        )
      );
      if (!r || !CODIGO.test(r.code) || !nombreValido(r.class_name)) throw malaRespuesta();
      store.set("cls", {
        code: r.code,
        name: r.class_name,
        alias: ap,
        kind: "reto",
        owner: true,
        lists: TODAS_LAS_LISTAS,
        diffs: TODAS_LAS_DIFICULTADES,
      });
      return { code: r.code, name: r.class_name, alias: ap };
    },

    /** Entra en una clase con un apodo y la recuerda en este navegador. */
    async joinClass(code, alias) {
      const a = store.get("acc", null);
      if (!a) throw new OnlineError("sesion_no_valida");
      const c = cleanCode(code);
      if (!c) throw new OnlineError("codigo_invalido");
      const ap = cleanAlias(alias ?? "");
      if (!validAlias(ap)) throw new OnlineError("apodo_invalido");
      const r = primera(await conSesion(a, () => rpc("alu_join_class", { p_token: a.token, p_code: c, p_alias: ap })));
      if (!r || !nombreValido(r.class_name)) throw malaRespuesta();
      guardarClase(r, ap, r.class_name, false, c);
      return { code: c, name: r.class_name, alias: ap };
    },

    /** Envía una partida terminada. Devuelve los puntos y las estrellas que calcula el servidor. */
    async submitRun({ level, difficulty, correct, mistakes, misses }) {
      const a = store.get("acc", null);
      if (!a) throw new OnlineError("sesion_no_valida");
      if (!store.get("cls", null)) throw new OnlineError("sin_clase");
      let r;
      try {
        r = primera(
          await conSesion(a, () =>
            rpc("alu_submit_run", {
              p_token: a.token,
              p_level: level,
              p_difficulty: difficulty,
              p_correct: correct,
              p_mistakes: mistakes,
              p_misses: Array.isArray(misses) ? misses : null,
            })
          )
        );
      } catch (e) {
        if (e.code === "sin_clase") store.remove("cls"); // el servidor ya no nos tiene en ninguna clase
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

    /** El alumno sale de la clase y el servidor borra su apodo y sus partidas en ella. */
    async leaveClass() {
      const a = store.get("acc", null);
      if (!a) throw new OnlineError("sesion_no_valida");
      if (!store.get("cls", null)) throw new OnlineError("sin_clase");
      const ok = await conSesion(a, () => rpc("alu_leave_class", { p_token: a.token }));
      if (typeof ok !== "boolean") throw malaRespuesta();
      // Si el servidor dice que no hay nada que borrar, ya estaba fuera: se olvida igualmente.
      store.remove("cls");
      return ok;
    },

    /** Quien creó el reto lo borra entero, con todos sus participantes y partidas. */
    async deleteChallenge() {
      const a = store.get("acc", null);
      const s = store.get("cls", null);
      if (!a) throw new OnlineError("sesion_no_valida");
      if (!s || !s.owner) throw new OnlineError("sin_clase");
      const ok = await conSesion(a, () => rpc("alu_delete_challenge", { p_token: a.token, p_code: s.code }));
      if (typeof ok !== "boolean") throw malaRespuesta();
      store.remove("cls");
      return ok;
    },
  };
}

export const online = createClient();
