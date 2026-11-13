// Persistencia en localStorage (prefijo pipo2.) con copia en memoria por si el navegador la bloquea.
//
// Lo guardado en el navegador no es de fiar: puede venir de una versión anterior del juego, haberse
// corrompido o haberlo tocado alguien desde las herramientas del navegador. Por eso cada clave tiene un
// «limpiador» en SCHEMA: devuelve el valor ya saneado, o undefined si no tiene arreglo. Al leer, un valor
// que no pasa se descarta y se devuelve el valor por defecto en vez de romper el juego.
//
// Versionado: la clave «v» guarda la versión del formato (VERSION). Si algún día cambia el formato de un
// dato, se sube VERSION y se añade en MIGRATIONS la función que pasa de la versión n a la n+1.
import { validAlias } from "./utils.js";

export const VERSION = 1;
const PREFIX = "pipo2.";
const DIFFS = ["easy", "normal", "hard"];

const esBool = (v) => (typeof v === "boolean" ? v : undefined);

/** Estrellas de un nivel (0 a 3), siempre 5 niveles: se corrigen los fuera de rango y se rellenan los que falten. */
function limpiarEstrellas(v) {
  if (!Array.isArray(v)) return undefined;
  return Array.from({ length: 5 }, (_, i) => (Number.isInteger(v[i]) ? Math.min(3, Math.max(0, v[i])) : 0));
}

/** Verbos fallados: { infinitivo: nº de fallos }. Se descartan las entradas que no tengan sentido. */
function limpiarFallos(v) {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return undefined;
  const out = {};
  for (const [inf, n] of Object.entries(v)) {
    if (inf.length > 0 && inf.length <= 30 && Number.isInteger(n) && n >= 1 && n <= 9999) out[inf] = n;
  }
  return out;
}

/** Verbos elegidos: lista de infinitivos (texto). Se descarta lo que no sea texto. */
function limpiarSeleccion(v) {
  if (!Array.isArray(v)) return undefined;
  return v.filter((x) => typeof x === "string" && x.length > 0 && x.length <= 30).slice(0, 500);
}

export const SCHEMA = {
  seen: esBool,
  sound: esBool,
  name: (v) => (typeof v === "string" && validAlias(v) ? v : undefined),
  diff: (v) => (DIFFS.includes(v) ? v : undefined),
  sel: limpiarSeleccion,
  miss: limpiarFallos,
  v: (v) => (Number.isInteger(v) && v >= 1 ? v : undefined),
};

function limpiador(k) {
  if (k.startsWith("stars.")) return DIFFS.includes(k.slice(6)) ? limpiarEstrellas : () => undefined;
  return SCHEMA[k];
}

/**
 * Migraciones: MIGRATIONS[n] pasa los datos de la versión n a la n+1 usando store.get/store.set.
 * La versión 1 es el formato actual (también el de los datos guardados antes de que existiera «v»).
 */
export const MIGRATIONS = {};

const mem = {};

function clean(k, v) {
  const fn = limpiador(k);
  return fn ? fn(v) : v;
}

export const store = {
  get: function (k, d) {
    let raw = null,
      v;
    try {
      raw = localStorage.getItem(PREFIX + k);
    } catch {
      /* localStorage bloqueado: se usa la copia en memoria, si la hay */
    }
    if (raw === null) v = k in mem ? mem[k] : undefined;
    else {
      try {
        v = JSON.parse(raw);
      } catch {
        store.remove(k); // JSON roto: se borra para no volver a tropezar con él
        return d;
      }
    }
    if (v === undefined) return d;
    const ok = clean(k, v);
    if (ok === undefined) {
      store.remove(k); // dato inservible: se borra para no volver a tropezar con él
      return d;
    }
    return ok;
  },
  set: function (k, v) {
    mem[k] = v;
    try {
      localStorage.setItem(PREFIX + k, JSON.stringify(v));
    } catch {
      /* localStorage bloqueado: queda solo la copia en memoria */
    }
  },
  remove: function (k) {
    delete mem[k];
    try {
      localStorage.removeItem(PREFIX + k);
    } catch {
      /* localStorage bloqueado: no hay nada que borrar */
    }
  },
  /** Lleva los datos guardados a la versión actual. Se llama una vez al arrancar, antes de pintar nada. */
  init: function () {
    let v = store.get("v", 1); // sin «v»: datos anteriores al versionado, que son la versión 1
    while (v < VERSION) {
      if (MIGRATIONS[v]) MIGRATIONS[v]();
      v++;
    }
    // Una «v» mayor que VERSION viene de una versión más nueva del juego: se respeta y no se rebaja.
    store.set("v", v);
  },
};
