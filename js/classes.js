// Lógica de las clases: unirse, ranking, salir, retos entre amigos y envío de partidas.
// Las pantallas están en views/classes.js. Todo lo que habla con el servidor pasa por online.js, y un fallo
// nunca rompe el juego: se enseña el mensaje y se puede seguir jugando.
import { $, esc } from "./utils.js";
import { S } from "./state.js";
import { online } from "./online.js";
import { go, render } from "./router.js";
import { sesionCaducada } from "./account.js";
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
    if (sesionCaducada(e)) return;
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
    if (sesionCaducada(e)) return closeModal();
    setErr("leave-err", e.message);
    return;
  }
  closeModal();
  S.rank = null;
  go("home");
}

// ---- «Reta a tus amigos» ----
export async function challengeCreate() {
  const name = $("#rn"),
    nick = $("#ra"),
    btn = $('[data-act="challengemake"]');
  setErr("rn-err", "", name);
  setErr("ra-err", "", nick);
  setErr("ch-err", "");
  btn.disabled = true;
  try {
    await online.createChallenge(name.value, nick.value);
  } catch (e) {
    if (sesionCaducada(e)) return;
    if (S.screen !== "challenge") return;
    btn.disabled = false;
    if (e.code === "nombre_invalido") {
      setErr("rn-err", e.message, name);
      name.focus();
    } else if (e.code === "apodo_invalido") {
      setErr("ra-err", e.message, nick);
      nick.focus();
    } else setErr("ch-err", e.message);
    return;
  }
  go("challengedone");
}

const avisar = (m) => {
  const e = $("#ch-msg");
  if (e) e.textContent = m;
};
export async function challengeCopy() {
  const t = online.session();
  if (!t) return;
  try {
    await navigator.clipboard.writeText(t.code);
    avisar("Código copiado.");
  } catch {
    avisar("No he podido copiarlo. Escríbelo a mano: " + t.code);
  }
}
export async function challengeShare() {
  const t = online.session();
  if (!t || !navigator.share) return;
  try {
    await navigator.share({
      title: "Reto de Pipo",
      text: "Únete a mi reto de verbos irregulares con el código " + t.code,
      url: location.origin + location.pathname,
    });
  } catch {
    /* quien comparte puede cancelar: no es un error */
  }
}
export function challengeDelAsk() {
  modal(
    "<h2>¿Borrar el reto?</h2>" +
      "<p>Se borrarán el reto, los apodos y las partidas de <b>todas</b> las personas que están en él. No se puede deshacer.</p>" +
      '<p class="err" id="del-err" role="alert"></p>' +
      '<div class="row"><button class="btn go" data-act="modalclose">Mejor no</button>' +
      '<button class="btn" data-act="challengedel">Sí, borrar el reto</button></div>'
  );
}
export async function challengeDel() {
  try {
    await online.deleteChallenge();
  } catch (e) {
    if (sesionCaducada(e)) return closeModal();
    setErr("del-err", e.message);
    return;
  }
  closeModal();
  S.rank = null;
  go("home");
}

// ---- enviar la partida al terminar un nivel ----
let ultima = null;
let envio = 0;

/** Tipo de la clase en la que está esta cuenta ("aula" o "reto"), o undefined. */
export const tipoDeClase = () => (online.session() || {}).kind;

/** ¿Hay que enviar las partidas de este navegador a una clase? */
export function enClase() {
  return online.session() !== null;
}

/** Los datos de una partida acabada. Los puntos y las estrellas los calcula el servidor. */
export function datosDePartida(R, difficulty, kind) {
  const correct = Math.min(Math.max(R.total, 1), 200);
  // El servidor no admite más de 4 + aciertos/10 errores en una partida. Con las vidas que se acumulan entre
  // niveles se podría superar, y a partir de 3 errores la nota ya es 1 estrella, así que recortar no cambia nada.
  const mistakes = Math.min(R.mis, 4 + Math.floor(correct / 10));
  const run = { level: R.idx, difficulty, correct, mistakes };
  // Los verbos fallados solo se mandan en las clases de aula (para el seguimiento del profesor), nunca en los retos.
  if (kind === "aula") run.misses = (R.missed || []).slice(0, mistakes);
  return run;
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
    if (e.code === "sesion_no_valida") {
      return dentro(id, "<b>No he podido enviar tu partida al ranking.</b> " + esc(e.message));
    }
    const sigue = online.session() !== null;
    dentro(
      id,
      "<b>No he podido enviar tu partida al ranking.</b> " +
        esc(e.message) +
        (sigue ? ' <button class="btn small" data-act="resendrun">Reintentar</button>' : "")
    );
  }
}
