// Presentación de Pipo (3 pasos). El primero pide un apodo obligatorio para poder jugar.
import { esc } from "../utils.js";
import { store } from "../store.js";
import { S } from "../state.js";
import { pipo } from "../ui/pipo.js";
import { heartSVG } from "../ui/icons.js";

export function meetView(v) {
  var n = S.meet,
    name = store.get("name", ""),
    h = '<section class="meet center">';
  if (n === 0) {
    h +=
      pipo("cheer") +
      "<h1>¡Hola! Soy Pipo</h1>" +
      '<p class="mt">Quiero ser el mejor estudiante de inglés del cole, pero los verbos irregulares me dan guerra. ¿Me ayudas a aprenderlos?</p>' +
      '<div class="card mt" style="text-align:left"><label for="nm" class="muted" style="font-size:16px">Elige tu apodo para jugar</label>' +
      '<input class="field" id="nm" maxlength="20" autocomplete="off" placeholder="Tu apodo" aria-describedby="nm-help nm-err" value="' +
      esc(name) +
      '">' +
      '<p class="err" id="nm-err" role="alert"></p>' +
      '<p class="muted" id="nm-help" style="font-size:15px;margin-top:6px">Usa un apodo, no tu nombre real ni tus apellidos. Solo se guarda en este dispositivo.</p></div>';
  } else if (n === 1) {
    h +=
      pipo("think") +
      "<h1>Así se juega</h1>" +
      '<div class="card mt" style="text-align:left"><p>La tabla tiene cuatro columnas, como en un cuaderno:</p>' +
      '<div class="legend"><span class="h0" style="background:var(--h0)">Infinitive</span><span style="background:var(--h1)">Past simple</span><span style="background:var(--h2)">Past participle</span><span style="background:var(--h3)">Significado</span></div>' +
      "<p>Toca una ficha y luego la casilla vacía donde encaja.</p></div>" +
      '<div class="card mt" style="text-align:left"><div class="row" style="flex-wrap:nowrap">' +
      '<div class="hearts">' +
      heartSVG(false) +
      heartSVG(false) +
      heartSVG(false) +
      "</div></div>" +
      '<p style="margin-top:6px">Tengo <b>5 vidas</b>. Cada error me quita una. Cada <b>10 aciertos seguidos</b> gano una extra. ¡No me dejes caer!</p></div>';
  } else {
    h +=
      pipo("happy") +
      "<h1>Tú decides" +
      (name ? ", " + esc(name) : "") +
      "</h1>" +
      '<div class="card mt" style="text-align:left"><p><b>Tus verbos:</b> elige cuáles quieres practicar, por listas o uno a uno.</p>' +
      '<p class="mt"><b>La dificultad:</b> más huecos en blanco cuanto más difícil.</p>' +
      '<p class="mt"><b>5 niveles</b> con verbos distintos. ¡Gana estrellas en cada uno!</p></div>';
  }
  h +=
    '<div class="dots" aria-hidden="true">' +
    [0, 1, 2]
      .map(function (i) {
        return '<i class="' + (i === n ? "on" : "") + '"></i>';
      })
      .join("") +
    "</div>" +
    '<div class="row center mt">' +
    (n > 0 ? '<button class="btn" data-act="meetback">Atrás</button>' : "") +
    '<button class="btn main big" data-act="meetnext">' +
    (n < 2 ? "Siguiente" : "¡Vamos!") +
    "</button></div></section>";
  v.innerHTML = h;
}
