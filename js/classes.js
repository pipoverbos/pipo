// Lógica de las clases: unirse, ranking, salir, funciones de quien creó la clase y envío de partidas.
// Las pantallas están en views/classes.js. Todo lo que habla con el servidor pasa por online.js, y un fallo
// nunca rompe el juego: se enseña el mensaje y se puede seguir jugando.
import { $, esc } from "./utils.js";
import { store } from "./store.js";
import { S } from "./state.js";
import { online } from "./online.js";
import { go, render } from "./router.js";
import { modal, closeModal } from "./ui/modal.js";

const setErr = (id, msg, field) => {
  const e = $("#" + id);
  if (e) e.textContent = msg;
  if (field) {
    if (msg) field.setAttribute("aria-invalid", "true");
    else field.removeAttribute("aria-invalid");
  }
};

/** «Mi clase» en el inicio: con clase va al ranking; sin ella, a la pantalla para unirse. */
export function openClass() {
  const s = online.session();
  if (!s) return go("join");
  S.rank = { code: s.code, name: s.name, mine: true, status: "loading", rows: [], msg: "" };
  go("rank");
  loadRank();
}

/** Pide el ranking que se está viendo. Si llegan dos respuestas, solo cuenta la última pedida. */
let pedido = 0;
export async function loadRank() {
  const r = S.rank;
  if (!r) return;
  const mio = ++pedido;
  r.status = "loading";
  r.msg = "";
  if (S.screen === "rank") render();
  try {
    r.rows = await online.ranking(r.code);
    r.status = "ok";
  } catch (e) {
    r.status = "error";
    r.msg = e.message;
  }
  if (mio === pedido && S.rank === r && S.screen === "rank") render();
}

// ---- unirse ----
const ERRORES_DE_APODO = ["apodo_invalido", "apodo_en_uso"];
const ERRORES_DE_CODIGO = ["codigo_invalido", "clase_no_existe", "clase_llena"];

export async function joinSubmit() {
  const code = $("#cc"),
    nick = $("#cn"),
    btn = $('[data-act="joinclass"]');
  setErr("cc-err", "", code);
  setErr("cn-err", "", nick);
  setErr("join-err", "");
  btn.disabled = true;
  try {
    const c = await online.joinClass(code.value, nick.value);
    S.rank = { code: c.code, name: c.name, mine: true, status: "loading", rows: [], msg: "" };
    go("rank");
    loadRank();
  } catch (e) {
    if (S.screen !== "join") return;
    btn.disabled = false;
    if (ERRORES_DE_APODO.includes(e.code)) {
      setErr("cn-err", e.message, nick);
      nick.focus();
    } else if (ERRORES_DE_CODIGO.includes(e.code)) {
      setErr("cc-err", e.message, code);
      code.focus();
    } else setErr("join-err", e.message);
  }
}

// ---- salir de la clase ----
export function leaveAsk() {
  const s = online.session();
  if (!s) return;
  modal(
    "<h2>¿Salir de la clase?</h2>" +
      "<p>Se borrarán de nuestro servidor tu apodo <b>" +
      esc(s.alias) +
      "</b> y todas tus partidas de <b>" +
      esc(s.name) +
      "</b>. No se puede deshacer.</p>" +
      '<p class="muted" style="font-size:16px">Tus estrellas y tus verbos de este dispositivo no cambian. Si quieres volver, tendrás que unirte otra vez.</p>' +
      '<p class="err" id="leave-err" role="alert"></p>' +
      '<div class="row"><button class="btn go" data-act="modalclose">Mejor me quedo</button>' +
      '<button class="btn" data-act="leavedo">Sí, salir y borrar mis datos</button></div>'
  );
}
export async function leaveDo() {
  try {
    await online.leaveClass();
  } catch (e) {
    setErr("leave-err", e.message);
    return;
  }
  closeModal();
  S.rank = null;
  go("home");
}

// ---- quien creó la clase ----
export async function teacherCreate() {
  const f = $("#tn");
  setErr("tn-err", "", f);
  try {
    await online.createClass(f.value);
  } catch (e) {
    setErr("tn-err", e.message, f);
    f.focus();
    return;
  }
  render();
}
export function teacherRank() {
  const t = online.teacherSession();
  if (!t) return;
  S.rank = { code: t.code, name: "Tu clase", mine: false, status: "loading", rows: [], msg: "" };
  go("rank");
  loadRank();
}
export async function teacherRemove() {
  const f = $("#tr"),
    alias = f.value.trim();
  const say = (m) => {
    const e = $("#tr-msg");
    if (e) e.textContent = m;
  };
  if (!alias) return say("Escribe el apodo de quien quieres quitar.");
  try {
    const hecho = await online.teacherRemovePlayer(alias);
    say(hecho ? "Listo: he quitado a " + alias + " de la clase." : "No hay nadie con ese apodo en tu clase.");
    if (hecho) f.value = "";
  } catch (e) {
    say(e.message);
  }
}
export function teacherDelAsk() {
  modal(
    "<h2>¿Borrar la clase?</h2>" +
      "<p>Se borrarán la clase, todos los apodos y todas las partidas. No se puede deshacer.</p>" +
      '<p class="err" id="del-err" role="alert"></p>' +
      '<div class="row"><button class="btn go" data-act="modalclose">Mejor no</button>' +
      '<button class="btn" data-act="teacherdel">Sí, borrar la clase</button></div>'
  );
}
export async function teacherDel() {
  try {
    const hecho = await online.teacherDeleteClass();
    if (!hecho) store.remove("teach"); // ya no existe en el servidor: se olvida aquí también
  } catch (e) {
    setErr("del-err", e.message);
    return;
  }
  closeModal();
  render();
}

// ---- enviar la partida al terminar un nivel ----
let ultima = null;
let envio = 0;

/** ¿Hay que enviar las partidas de este navegador a una clase? */
export function enClase() {
  return online.session() !== null;
}

/** Los datos de una partida acabada. Los puntos y las estrellas los calcula el servidor. */
export function datosDePartida(R, difficulty) {
  const correct = Math.min(Math.max(R.total, 1), 200);
  // El servidor no admite más de 4 + aciertos/10 errores en una partida. Con las vidas que se acumulan entre
  // niveles se podría superar, y a partir de 3 errores la nota ya es 1 estrella, así que recortar no cambia nada.
  const mistakes = Math.min(R.mis, 4 + Math.floor(correct / 10));
  return { level: R.idx, difficulty, correct, mistakes };
}

const dentro = (id, html) => {
  const b = $("#rank-msg");
  if (b && b.dataset.id === String(id)) {
    b.innerHTML = html;
    b.classList.toggle("ok", html.includes("<b>+"));
  }
};

/** Envía la partida y cuenta el resultado en el recuadro #rank-msg de la ventana final, si sigue abierto. */
export async function sendRun(run = ultima) {
  if (!run) return;
  ultima = run;
  const id = ++envio;
  const box = $("#rank-msg");
  if (box) box.dataset.id = String(id);
  const s = online.session();
  if (!s) return;
  dentro(id, "Enviando tu partida a " + esc(s.name) + "…");
  try {
    const r = await online.submitRun(run);
    let html = "<b>+" + r.points + " puntos</b> para " + esc(s.name) + ".";
    try {
      const rows = await online.ranking();
      const i = rows.findIndex((f) => f.alias.toLowerCase() === s.alias.toLowerCase());
      if (i >= 0) html += " Ahora eres la <b>nº " + (i + 1) + "</b> de la clase.";
    } catch {
      /* la posición es un extra: sin ella, los puntos ya están guardados */
    }
    ultima = null;
    dentro(id, html);
  } catch (e) {
    const sigue = online.session() !== null;
    dentro(
      id,
      "<b>No he podido enviar tu partida al ranking.</b> " +
        esc(e.message) +
        (sigue ? ' <button class="btn small" data-act="resendrun">Reintentar</button>' : "")
    );
  }
}
