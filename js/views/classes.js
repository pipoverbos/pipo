// Pantallas de las clases: unirse, ranking y gestión de quien creó la clase.
import { esc } from "../utils.js";
import { store } from "../store.js";
import { S } from "../state.js";
import { online } from "../online.js";
import { pipo } from "../ui/pipo.js";
import { ICON } from "../ui/icons.js";

const cabecera = (titulo, atras) =>
  '<div class="top"><button class="iconbtn" data-act="' +
  atras +
  '" aria-label="Volver">' +
  ICON.back +
  "</button><h1>" +
  titulo +
  "</h1></div>";

export function joinView(v) {
  v.innerHTML =
    '<section class="cls">' +
    cabecera("Mi clase", "home") +
    '<div class="talk stage">' +
    pipo("think") +
    '<div class="bubble">Pídele a tu profe el código de la clase. ¡Son 6 letras o números!</div></div>' +
    '<div class="card mt">' +
    '<label class="lbl" for="cc">Código de la clase</label>' +
    '<input class="field code" id="cc" maxlength="9" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-describedby="cc-help cc-err">' +
    '<p class="muted small" id="cc-help">Da igual si lo escribes en mayúsculas o minúsculas.</p>' +
    '<p class="err" id="cc-err" role="alert"></p>' +
    '<label class="lbl" for="cn">Tu apodo en la clase</label>' +
    '<input class="field" id="cn" maxlength="20" autocomplete="off" aria-describedby="cn-help cn-err" value="' +
    esc(store.get("name", "")) +
    '">' +
    '<p class="muted small" id="cn-help">Lo verán tus compañeros en el ranking. Usa un apodo, no tu nombre real.</p>' +
    '<p class="err" id="cn-err" role="alert"></p></div>' +
    '<div class="row center mt"><button class="btn go big" data-act="joinclass">Unirme a la clase</button></div>' +
    '<p class="err center" id="join-err" role="alert"></p>' +
    '<p class="muted small center">Solo guardamos tu apodo, el código de la clase y tus puntos. Nada más.</p>' +
    '<div class="teachbox"><p class="muted small">¿Eres profe?</p><button class="btn small" data-act="teacher">Crear una clase</button></div>' +
    "</section>";
}

export function rankView(v) {
  const r = S.rank;
  if (!r) return;
  const yo = (online.session() || {}).alias;
  const filas = r.rows
    .map(function (f, i) {
      const soy = r.mine && yo && f.alias.toLowerCase() === yo.toLowerCase();
      return (
        '<li class="' +
        (soy ? "me" : "") +
        '"><span class="pos" aria-hidden="true">' +
        (i + 1) +
        '</span><span class="nm"><span class="sr-only">Puesto ' +
        (i + 1) +
        ": </span>" +
        esc(f.alias) +
        (soy ? " (tú)" : "") +
        "<small>" +
        f.levels +
        (f.levels === 1 ? " nivel" : " niveles") +
        '</small></span><span class="pts">' +
        f.points +
        '<span class="sr-only"> puntos</span></span></li>'
      );
    })
    .join("");
  v.innerHTML =
    '<section class="cls">' +
    cabecera("Ranking", r.mine ? "home" : "teacher") +
    '<div class="card rankhead"><div><b>' +
    esc(r.name) +
    '</b><p class="muted small" style="margin:0">Código ' +
    esc(r.code) +
    (r.status === "ok" ? " · " + r.rows.length + (r.rows.length === 1 ? " jugador" : " jugadores") : "") +
    '</p></div><button class="btn small" data-act="rankreload">Actualizar</button></div>' +
    (r.status === "loading" ? '<p class="muted mt" role="status">Cargando el ranking…</p>' : "") +
    (r.status === "error" ? '<p class="err mt" role="alert">' + esc(r.msg) + "</p>" : "") +
    (r.status === "ok" && !r.rows.length
      ? '<p class="mt">Todavía no hay partidas en esta clase. ¡Sé la primera persona!</p>'
      : "") +
    (filas ? '<ol class="rank" aria-label="Clasificación de la clase">' + filas + "</ol>" : "") +
    '<p class="muted small center">Cuenta la mejor partida de cada nivel y dificultad. Repetir un nivel solo sube tu marca si lo haces mejor.</p>' +
    (r.mine
      ? '<div class="teachbox"><button class="linkbtn" data-act="leaveask">Salir de la clase y borrar mis datos</button></div>'
      : "") +
    "</section>";
}

export function teacherView(v) {
  const t = online.teacherSession();
  let cuerpo;
  if (!t) {
    cuerpo =
      '<div class="card mt"><label class="lbl" for="tn">Nombre de la clase</label>' +
      '<input class="field" id="tn" maxlength="40" autocomplete="off" aria-describedby="tn-help tn-err">' +
      '<p class="muted small" id="tn-help">Por ejemplo, «1º A de ESO». No pongas nombres de alumnos.</p>' +
      '<p class="err" id="tn-err" role="alert"></p></div>' +
      '<div class="row center mt"><button class="btn go big" data-act="teachercreate">Crear la clase</button></div>';
  } else {
    cuerpo =
      '<div class="card mt center"><p class="muted">El código de tu clase es</p>' +
      '<p class="codebig" aria-label="' +
      esc(t.code.split("").join(" ")) +
      '">' +
      esc(t.code) +
      '</p><p class="muted small">Pásaselo al alumnado: lo escribirán en «Mi clase».</p></div>' +
      '<div class="row center mt"><button class="btn main" data-act="teacherrank">Ver el ranking</button></div>' +
      '<div class="card mt"><label class="lbl" for="tr">Quitar a un alumno de la clase</label>' +
      '<input class="field" id="tr" maxlength="20" autocomplete="off" aria-describedby="tr-msg">' +
      '<div class="row mt"><button class="btn small" data-act="teacherremove">Quitar</button></div>' +
      '<p class="muted small" id="tr-msg" role="status"></p></div>' +
      '<div class="teachbox"><button class="linkbtn" data-act="teacherdelask">Borrar la clase entera</button>' +
      '<p class="muted small">La clase solo se gestiona desde este navegador. Si no se juega en ella durante 12 meses, se borra sola.</p></div>';
  }
  v.innerHTML = '<section class="cls">' + cabecera("Crear una clase", "class") + cuerpo + "</section>";
}
