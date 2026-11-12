// Pantalla de juego: marcador, globo de Pipo, fichas y tabla.
import { $, esc } from "../utils.js";
import { R } from "../state.js";
import { COLN } from "../data/config.js";
import { pipo } from "../ui/pipo.js";
import { ICON, heartSVG } from "../ui/icons.js";
import { focusSignature, restoreFocus } from "../ui/focus.js";

export function gameView(v) {
  v.innerHTML =
    '<section><div class="top"><button class="iconbtn" data-act="map" aria-label="Salir al mapa">' +
    ICON.back +
    '</button><h1 class="gtitle" id="gt"></h1></div>' +
    '<div class="gwrap"><aside class="gside"><div class="hud" id="hud"></div>' +
    // Región de anuncios fija: los lectores de pantalla no avisan de regiones que se crean ya con texto.
    '<p class="sr-only" id="live" aria-live="polite" aria-atomic="true"></p>' +
    '<div class="talk" id="talk"></div><div id="tray"></div></aside><div class="gmain" id="tbl"></div></div></section>';
  $("#gt").textContent = (R.idx >= 0 ? "Nivel " + (R.idx + 1) + " · " : "") + R.cfg.n;
  renderHud();
  renderPlay();
}
export function renderHud() {
  var h = '<div class="hearts" role="img" aria-label="' + R.lives + (R.lives === 1 ? " vida" : " vidas") + '">',
    slots = Math.max(5, R.lives);
  for (var i = 0; i < slots; i++) h += heartSVG(i >= R.lives);
  h +=
    '</div><div class="streak" role="img" aria-label="Racha: ' +
    R.streak +
    ' de 10 aciertos seguidos. A los 10 ganas una vida.">';
  for (var j = 0; j < 10; j++) h += '<span class="pip' + (j < R.streak ? " on" : "") + '"></span>';
  h += "<span>+1 vida</span></div>";
  $("#hud").innerHTML = h;
}
var liveToggle = false;
export function say(t, m) {
  var el = $("#talk");
  if (!el) return;
  el.innerHTML = pipo(m || "normal") + '<div class="bubble pop"></div>';
  el.querySelector(".bubble").textContent = t;
  var live = $("#live");
  if (live) {
    // El espacio final alterna para que un mensaje repetido se vuelva a anunciar.
    liveToggle = !liveToggle;
    live.textContent = t + (liveToggle ? " " : "");
  }
}
export function renderPlay() {
  var sig = focusSignature($("#view")),
    c = R.cfg,
    h = "";
  if (!R.done && !R.dead) {
    if (c.type) {
      h += '<div class="typebar">';
      if (R.selSlot === null) h += '<p class="muted">Toca una casilla de la tabla para escribir en ella.</p>';
      else {
        var p = R.selSlot.split("-");
        h +=
          "<p>Escribe el <b>" +
          COLN[+p[1]] +
          "</b> de «" +
          esc(R.rows[+p[0]][3]) +
          '»:</p><div class="row"><input class="field" id="ti" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Tu respuesta" aria-label="Tu respuesta"><button class="btn main" data-act="check">Comprobar</button></div>';
      }
      h += "</div>";
    } else {
      h += '<div class="tray" role="group" aria-label="Fichas">';
      R.chips.forEach(function (ch, k) {
        if (!ch.used)
          h +=
            '<button class="chip' +
            (R.sel === k ? " sel" : "") +
            '" data-chip="' +
            k +
            '" aria-pressed="' +
            (R.sel === k) +
            '" draggable="true">' +
            esc(ch.t) +
            "</button>";
      });
      h += "</div>";
    }
  }
  h += "<!--SPLIT-->";
  h +=
    '<table class="vt"><colgroup><col style="width:22%"><col style="width:26%"><col style="width:26%"><col style="width:26%"></colgroup><tr><th class="h0">Infinitive</th><th class="h1">Past simple</th><th class="h2">Past participle</th><th class="h3">Significado</th></tr>';
  R.rows.forEach(function (v, i) {
    h += "<tr>";
    for (var f = 0; f < 4; f++) {
      var k = i + "-" + f;
      if (!R.hid[i].has(f)) h += '<td><span class="hl h' + f + '">' + esc(v[f]) + "</span></td>";
      else if (R.placed[k])
        h += '<td><span class="hl h' + f + (R.last === k ? " draw" : "") + '">' + esc(R.placed[k]) + "</span></td>";
      else
        h +=
          '<td data-slot="' +
          k +
          '" class="slot d' +
          f +
          (R.selSlot === k ? " cur" : "") +
          '" tabindex="0" role="button" aria-label="Hueco de ' +
          COLN[f] +
          ", fila " +
          (i + 1) +
          '">?</td>';
    }
    h += "</tr>";
  });
  h += "</table>";
  var parts = h.split("<!--SPLIT-->");
  $("#tray").innerHTML = parts[0];
  $("#tbl").innerHTML = parts[1] || "";
  if (R.selSlot !== null) {
    var ti = $("#ti");
    if (ti) ti.focus();
  } else restoreFocus(sig, $("#view"), [".chip", "td[data-slot]", '[data-act="map"]']);
}
export function shakeSlot(k) {
  var el = document.querySelector('[data-slot="' + k + '"]');
  if (el) el.classList.add("shake");
}
