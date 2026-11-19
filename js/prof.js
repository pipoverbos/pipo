// Panel del profesor: sus clases, el seguimiento de cada alumno, los ajustes de la clase y el informe imprimible.
// Las pantallas están en views/prof.js. Todo lo que habla con el servidor pasa por online.js.
import { $, esc } from "./utils.js";
import { S } from "./state.js";
import { online } from "./online.js";
import { go, render } from "./router.js";
import { modal, closeModal } from "./ui/modal.js";
import { sesionCaducada } from "./account.js";

const setErr = (id, msg, field) => {
  const e = $("#" + id);
  if (e) e.textContent = msg;
  if (field) {
    if (msg) field.setAttribute("aria-invalid", "true");
    else field.removeAttribute("aria-invalid");
  }
};

// ---- mis clases ----
let pedidoLista = 0;
/** Pide la lista de clases del profesor. Si llegan dos respuestas, solo cuenta la última pedida. */
export async function loadClasses() {
  const mio = ++pedidoLista;
  S.prof = { status: "loading", classes: S.prof ? S.prof.classes : [], msg: "" };
  if (S.screen === "prof") render();
  try {
    S.prof.classes = await online.profClasses();
    S.prof.status = "ok";
  } catch (e) {
    if (sesionCaducada(e)) return;
    S.prof.status = "error";
    S.prof.msg = e.message;
  }
  if (mio === pedidoLista && S.screen === "prof") render();
}

export async function profCreate() {
  const f = $("#pn"),
    btn = $('[data-act="profnewsubmit"]');
  setErr("pn-err", "", f);
  btn.disabled = true;
  try {
    const c = await online.profCreateClass(f.value);
    await loadClasses(); // la nueva clase ya está en el servidor: se pide la lista para tener sus datos
    openProfClass(c.code);
  } catch (e) {
    if (sesionCaducada(e)) return;
    if (S.screen !== "profnew") return;
    btn.disabled = false;
    if (e.code === "nombre_invalido") {
      setErr("pn-err", e.message, f);
      f.focus();
    } else setErr("pn-err", e.message);
  }
}

// ---- una clase ----
const nuevaCarga = () => ({ status: "idle", rows: [], misses: [], msg: "" });

export function openProfClass(code) {
  const c = ((S.prof || {}).classes || []).find((x) => x.code === code);
  if (!c) return go("prof");
  S.pc = {
    code: c.code,
    name: c.name,
    players: c.players,
    tab: "alumnos",
    rank: nuevaCarga(),
    prog: nuevaCarga(),
    cfg: { lists: [...c.lists], diffs: [...c.diffs] },
    msg: "",
  };
  S.ps = null;
  go("profclass");
  cargarPestana();
}

export function profTab(tab) {
  if (!S.pc) return;
  S.pc.tab = tab;
  render();
  cargarPestana();
}

let pedidoPestana = 0;
async function cargarPestana() {
  const pc = S.pc;
  if (!pc || pc.tab === "ajustes") return;
  const mio = ++pedidoPestana;
  const carga = pc.tab === "ranking" ? pc.rank : pc.prog;
  carga.status = "loading";
  carga.msg = "";
  render();
  try {
    if (pc.tab === "ranking") carga.rows = await online.ranking(pc.code);
    else {
      const [rows, misses] = await Promise.all([online.profProgress(pc.code), online.profMisses(pc.code)]);
      carga.rows = rows;
      carga.misses = misses;
      pc.players = new Set(rows.map((f) => f.alias)).size;
    }
    carga.status = "ok";
  } catch (e) {
    if (sesionCaducada(e)) return;
    carga.status = "error";
    carga.msg = e.message;
  }
  if (mio === pedidoPestana && S.pc === pc && (S.screen === "profclass" || S.screen === "profstudent")) render();
}

export function profReload() {
  cargarPestana();
}

export async function profCopyCode() {
  if (!S.pc) return;
  const e = $("#pc-msg");
  try {
    await navigator.clipboard.writeText(S.pc.code);
    if (e) e.textContent = "Código copiado.";
  } catch {
    if (e) e.textContent = "No he podido copiarlo. Escríbelo a mano: " + S.pc.code;
  }
}

// ---- ajustes de la clase ----
export function cfgToggle(kind, value, checked) {
  if (!S.pc) return;
  const lista = S.pc.cfg[kind];
  const v = kind === "lists" ? Number(value) : value;
  const sin = lista.filter((x) => x !== v);
  S.pc.cfg[kind] = checked ? [...sin, v] : sin;
}

export async function cfgSave() {
  const pc = S.pc;
  if (!pc) return;
  const msg = (m, error) => {
    const e = $("#cfg-msg");
    if (!e) return;
    e.textContent = m;
    e.className = error ? "err" : "muted small";
  };
  const lists = [...pc.cfg.lists].sort((a, b) => a - b);
  const diffs = ["easy", "normal", "hard"].filter((d) => pc.cfg.diffs.includes(d));
  const btn = $('[data-act="cfgsave"]');
  if (btn) btn.disabled = true;
  try {
    await online.profSetConfig(pc.code, lists, diffs);
  } catch (e) {
    if (sesionCaducada(e)) return;
    if (btn) btn.disabled = false;
    return msg(e.message, true);
  }
  if (btn) btn.disabled = false;
  pc.cfg = { lists, diffs };
  const c = ((S.prof || {}).classes || []).find((x) => x.code === pc.code);
  if (c) {
    c.lists = lists;
    c.diffs = diffs;
  }
  msg("Guardado. Tus alumnos lo verán la próxima vez que abran el juego.", false);
}

export function profDelAsk() {
  if (!S.pc) return;
  modal(
    "<h2>¿Borrar la clase?</h2>" +
      "<p>Se borrarán la clase <b>" +
      esc(S.pc.name) +
      "</b>, el apodo y todas las partidas de sus alumnos. Sus cuentas no se borran. No se puede deshacer.</p>" +
      '<p class="err" id="del-err" role="alert"></p>' +
      '<div class="row"><button class="btn go" data-act="modalclose">Mejor no</button>' +
      '<button class="btn" data-act="profdel">Sí, borrar la clase</button></div>'
  );
}
export async function profDel() {
  if (!S.pc) return;
  try {
    await online.profDeleteClass(S.pc.code);
  } catch (e) {
    if (sesionCaducada(e)) return closeModal();
    setErr("del-err", e.message);
    return;
  }
  closeModal();
  S.pc = null;
  S.ps = null;
  go("prof");
  loadClasses();
}

export function profBack() {
  S.pc = null;
  S.ps = null;
  go("prof");
  loadClasses();
}

// ---- seguimiento: resumen por alumno ----
const claveAlias = (a) => a.toLowerCase();

/**
 * Junta lo que contesta el servidor en una ficha por alumno:
 * { alias, jugado, partidas, puntos, ultima, niveles: [{level, difficulty, plays, stars, points, last}], fallos: [{verb, times}] }
 * Los puntos son los de la mejor partida de cada nivel y dificultad (como en el ranking).
 */
export function resumirAlumnos(progreso, fallos) {
  const por = new Map();
  const ficha = (alias) => {
    const k = claveAlias(alias);
    if (!por.has(k))
      por.set(k, { alias, jugado: false, partidas: 0, puntos: 0, ultima: null, niveles: [], fallos: [] });
    return por.get(k);
  };
  for (const f of progreso) {
    const a = ficha(f.alias);
    if (f.level === null) continue;
    a.jugado = true;
    a.partidas += f.plays;
    a.puntos += f.points;
    a.niveles.push({
      level: f.level,
      difficulty: f.difficulty,
      plays: f.plays,
      stars: f.stars,
      points: f.points,
      last: f.last,
    });
    if (f.last && (!a.ultima || f.last > a.ultima)) a.ultima = f.last;
  }
  for (const f of fallos) ficha(f.alias).fallos.push({ verb: f.verb, times: f.times });
  const orden = { easy: 0, normal: 1, hard: 2 };
  for (const a of por.values()) {
    a.niveles.sort((x, y) => orden[x.difficulty] - orden[y.difficulty] || x.level - y.level);
    a.fallos.sort((x, y) => y.times - x.times || x.verb.localeCompare(y.verb));
  }
  return [...por.values()].sort((x, y) => x.alias.localeCompare(y.alias, "es", { sensitivity: "base" }));
}

// ---- un alumno: informe, restablecer contraseña y quitar ----
export function profStudent(alias) {
  if (!S.pc) return;
  S.ps = alias;
  go("profstudent");
}
export function profStudentBack() {
  S.ps = null;
  go("profclass");
}

/** Descargar el informe en PDF: se abre el diálogo de impresión, donde basta elegir «Guardar como PDF». */
export function studentPdf() {
  if (!S.pc || !S.ps) return;
  const antes = document.title;
  // El navegador propone el título de la página como nombre del archivo.
  document.title = "Informe de " + S.ps + " - " + S.pc.name;
  try {
    window.print();
  } finally {
    document.title = antes;
  }
}

export function studentRemoveAsk() {
  if (!S.pc || !S.ps) return;
  modal(
    "<h2>¿Quitar a este alumno?</h2>" +
      "<p>Se borrarán de la clase el apodo <b>" +
      esc(S.ps) +
      "</b> y todas sus partidas en ella. Su cuenta no se borra y podrá volver a unirse con el código. No se puede deshacer.</p>" +
      '<p class="err" id="sr-err" role="alert"></p>' +
      '<div class="row"><button class="btn go" data-act="modalclose">Mejor no</button>' +
      '<button class="btn" data-act="studentremove">Sí, quitar de la clase</button></div>'
  );
}
export async function studentRemove() {
  if (!S.pc || !S.ps) return;
  try {
    await online.profRemoveStudent(S.pc.code, S.ps);
  } catch (e) {
    if (sesionCaducada(e)) return closeModal();
    setErr("sr-err", e.message);
    return;
  }
  closeModal();
  S.ps = null;
  go("profclass");
  cargarPestana();
}

export function studentResetAsk() {
  if (!S.pc || !S.ps) return;
  modal(
    "<h2>¿Restablecer la contraseña?</h2>" +
      "<p>Le pondremos una contraseña <b>temporal</b> a <b>" +
      esc(S.ps) +
      "</b> y se cerrarán sus sesiones abiertas. Al entrar con ella, el juego le pedirá elegir una nueva. La verás <b>una sola vez</b>.</p>" +
      '<p class="err" id="rs-err" role="alert"></p>' +
      '<div class="row"><button class="btn go" data-act="modalclose">Mejor no</button>' +
      '<button class="btn" data-act="studentreset">Sí, restablecer</button></div>'
  );
}
export async function studentReset() {
  if (!S.pc || !S.ps) return;
  let clave;
  try {
    clave = await online.profResetStudent(S.pc.code, S.ps);
  } catch (e) {
    if (sesionCaducada(e)) return closeModal();
    setErr("rs-err", e.message);
    return;
  }
  S.temp = clave;
  modal(
    "<h2>Contraseña temporal</h2>" +
      "<p>La contraseña temporal de <b>" +
      esc(S.ps) +
      '</b> es:</p><p class="reccode" id="temp-pw">' +
      esc(clave) +
      "</p>" +
      "<p>Díselo en persona: <b>no se puede volver a ver</b>. Al entrar con ella, el juego le pedirá elegir una nueva.</p>" +
      '<p class="muted small" id="temp-msg" role="status"></p>' +
      '<div class="row"><button class="btn" data-act="tempcopy">Copiar</button>' +
      '<button class="btn go" data-act="tempclose">Hecho</button></div>'
  );
}
export async function tempCopy() {
  const e = $("#temp-msg");
  try {
    await navigator.clipboard.writeText(S.temp || "");
    if (e) e.textContent = "Copiada.";
  } catch {
    if (e) e.textContent = "No he podido copiarla. Apúntala a mano.";
  }
}
export function tempClose() {
  S.temp = null; // la contraseña temporal no se guarda en ningún sitio al cerrar
  closeModal();
}
