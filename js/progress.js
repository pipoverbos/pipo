// Progreso del alumno en su cuenta: estrellas, verbos elegidos, fallos y dificultad.
//
// El juego sigue guardando todo en el navegador (store) y de ahí lee. Este módulo lo copia a la cuenta del alumno
// (un poco después de cada cambio) y lo trae al entrar desde otro dispositivo:
//   * Entrar con una cuenta REEMPLAZA lo del navegador por lo de la cuenta.
//   * Crear una cuenta ADOPTA lo que ya hubiera en el navegador (el progreso de antes de que existieran las cuentas).
//   * Al cerrar sesión se guarda lo pendiente y se borra el progreso del navegador, para que en un ordenador
//     compartido nadie herede el progreso de otra persona.
// Si no hay conexión, el juego sigue: lo pendiente queda marcado («dirty») y se envía en cuanto se pueda.
import { store } from "./store.js";
import { online } from "./online.js";

const DIFFS = ["easy", "normal", "hard"];
const CLAVES = ["sel", "miss", "diff", "stars.easy", "stars.normal", "stars.hard"];
const ESPERA = 2000;

let aplicando = false;
let timer = null;

/** El progreso de este navegador, con la forma que acepta el servidor. */
export function snapshot() {
  const p = {};
  const stars = {};
  for (const d of DIFFS) {
    const v = store.get("stars." + d, null);
    if (v) stars[d] = v;
  }
  if (Object.keys(stars).length) p.stars = stars;
  const sel = store.get("sel", null);
  if (sel) p.sel = sel;
  const miss = store.get("miss", null);
  if (miss) p.miss = miss;
  const diff = store.get("diff", null);
  if (diff) p.diff = diff;
  return p;
}

/** Quita del navegador todo lo que es de la cuenta (progreso y clase). Lo propio del dispositivo se queda. */
export function clearLocal() {
  aplicando = true;
  for (const k of CLAVES) store.remove(k);
  store.remove("cls");
  store.remove("dirty");
  aplicando = false;
}

/** Sustituye el progreso del navegador por el de la cuenta. */
export function apply(progress) {
  clearLocal();
  aplicando = true;
  const p = progress || {};
  for (const d of DIFFS) if (p.stars && p.stars[d]) store.set("stars." + d, p.stars[d]);
  if (p.sel) store.set("sel", p.sel);
  if (p.miss) store.set("miss", p.miss);
  if (p.diff) store.set("diff", p.diff);
  aplicando = false;
}

/** Envía lo pendiente a la cuenta. Devuelve si quedó guardado; si no, sigue pendiente para la próxima vez. */
export async function guardar() {
  clearTimeout(timer);
  if (!store.get("dirty", false)) return true;
  try {
    await online.saveProgress(snapshot());
    store.set("dirty", false);
    return true;
  } catch {
    return false;
  }
}

/** Trae el progreso de la cuenta, salvo que haya cambios sin enviar: esos son más nuevos y se envían. */
export async function traer() {
  if (store.get("dirty", false)) {
    await guardar();
    return;
  }
  const me = await online.me();
  apply(me.progress);
}

/** Al crear la cuenta: lo que ya hubiera en el navegador pasa a ser su progreso. */
export async function adoptar() {
  if (!Object.keys(snapshot()).length) return;
  try {
    await online.saveProgress(snapshot());
    store.set("dirty", false);
  } catch {
    store.set("dirty", true); // se enviará cuando haya conexión
  }
}

/** Activa la copia automática: cada cambio del progreso se envía un par de segundos después. */
export function iniciarSincronizacion() {
  store.onChange((k) => {
    if (aplicando || !CLAVES.includes(k)) return;
    const a = online.account();
    if (!a || a.role !== "alumno") return;
    store.set("dirty", true);
    clearTimeout(timer);
    timer = setTimeout(guardar, ESPERA);
  });
}
