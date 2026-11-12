// Pantalla de inicio: jugar, dificultad, mis verbos y repaso.
import { esc, pick } from "../utils.js";
import { store } from "../store.js";
import { selV, selSet, getStars, missMap } from "../verbs.js";
import { MIN, DIFFS, DIFFD } from "../data/config.js";
import { pipo } from "../ui/pipo.js";
import { ICON, starSVG } from "../ui/icons.js";

export function homeView(v) {
  var d = store.get("diff", "normal"),
    name = store.get("name", ""),
    n = selV().length,
    sel = selSet();
  var st = getStars(d).reduce(function (a, b) {
      return a + b;
    }, 0),
    mm = missMap();
  var missN = Object.keys(mm).filter(function (k) {
    return mm[k] > 0 && sel.has(k);
  }).length;
  var hi = [
    "¿Practicamos un rato?",
    "¡Hoy vamos a aprender verbos nuevos!",
    "¡Me alegro de verte!",
    "Con un poco de práctica, ¡serás una crack!",
  ];
  var greet = (name ? "¡Hola, " + esc(name) + "! " : "¡Hola! ") + pick(hi);
  var h =
    '<section class="home"><h1>Pipo y los verbos irregulares</h1><div class="hgrid"><div class="hleft">' +
    '<div class="talk stage">' +
    pipo("happy") +
    '<div class="bubble" aria-live="polite">' +
    greet +
    "</div></div>" +
    '<div class="row center mt"><button class="btn go big" data-act="play"' +
    (n < MIN ? " disabled" : "") +
    ">Jugar</button></div>" +
    (n < MIN
      ? '<p class="center err" style="min-height:0;margin-top:8px">Elige al menos ' + MIN + " verbos para jugar.</p>"
      : "") +
    '</div><div class="hright">' +
    '<h2 class="sec">Dificultad</h2><div class="seg" role="group" aria-label="Dificultad">' +
    ["easy", "normal", "hard"]
      .map(function (k) {
        return (
          '<button data-act="diff" data-d="' +
          k +
          '" class="' +
          (k === d ? "on" : "") +
          '" aria-pressed="' +
          (k === d) +
          '">' +
          DIFFS[k] +
          "</button>"
        );
      })
      .join("") +
    "</div>" +
    '<p class="muted" style="margin-top:8px">' +
    DIFFD[d] +
    "</p>" +
    '<h2 class="sec">Tus cosas</h2>' +
    '<button class="opt" data-act="verbs"><span><b>Mis verbos</b><small>' +
    n +
    (n === 1 ? " elegido" : " elegidos") +
    ' · elige por listas</small></span><span aria-hidden="true">›</span></button>' +
    (missN >= 3
      ? '<button class="opt" data-act="practice"><span><b>Repaso de errores</b><small>Practica los ' +
        Math.min(missN, 8) +
        ' verbos que más se te resisten</small></span><span aria-hidden="true">›</span></button>'
      : "") +
    '<div class="row mt2" style="justify-content:space-between"><div class="row"><span class="stars" aria-hidden="true">' +
    starSVG(true) +
    "</span><span>" +
    st +
    " de 15 estrellas (" +
    DIFFS[d] +
    ")</span></div>" +
    '<div class="row"><button class="iconbtn" data-act="sound" aria-label="' +
    (store.get("sound", true) ? "Silenciar sonidos" : "Activar sonidos") +
    '">' +
    (store.get("sound", true) ? ICON.sound : ICON.mute) +
    "</button>" +
    '<button class="btn small" data-act="meetpipo">Conoce a Pipo</button></div></div></div></div></section>';
  v.innerHTML = h;
}
