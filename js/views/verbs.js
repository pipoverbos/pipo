// Mis verbos: elegir verbos uno a uno o por listas, y buscar.
import { $, esc } from "../utils.js";
import { S } from "../state.js";
import { selSet, selV, saveSel, mapStars, totalStars, resetMap, ajustesDeClase, verbosPermitidos } from "../verbs.js";
import { modal, closeModal } from "../ui/modal.js";
import { BASE } from "../data/base-verbs.js";
import { MIN, LISTS } from "../data/config.js";
import { ICON } from "../ui/icons.js";
import { focusSignature, restoreFocus } from "../ui/focus.js";

export function verbsView(v) {
  const pill = (p, text) => `<button class="pill" data-act="pre" data-p="${p}">${text}</button>`;
  const ajustes = ajustesDeClase();
  const pills =
    pill("all", "Todos") +
    pill("none", "Ninguno") +
    LISTS.filter((l, i) => ajustes.lists.includes(i + 1))
      .map((l) => pill(l.id, `${l.name} (${l.from}–${l.to})`))
      .join("");
  v.innerHTML =
    '<section><div class="top"><button class="iconbtn" data-act="home" aria-label="Volver">' +
    ICON.back +
    "</button><h1>Mis verbos</h1></div>" +
    '<p><b id="vcount"></b></p>' +
    (ajustes.limitada ? '<p class="muted small">Tu profe ha elegido estas listas de verbos para tu clase.</p>' : "") +
    `<div class="chiprow">${pills}</div>` +
    '<input class="field mt" id="vq" type="search" placeholder="Buscar un verbo" autocomplete="off" value="' +
    esc(S.vq) +
    '" aria-label="Buscar un verbo">' +
    '<div id="vlist"></div></section>';
  refreshVerbs();
}

export function refreshVerbs() {
  const sig = focusSignature($("#view"));
  const q = S.vq.toLowerCase().trim();
  const sel = selSet();
  const perm = verbosPermitidos();
  const list = BASE.filter(
    (v) => (!perm || perm.has(v[0])) && (!q || v[0].indexOf(q) > -1 || v[3].toLowerCase().indexOf(q) > -1)
  );
  const html = list
    .map((v) => {
      const on = sel.has(v[0]);
      return (
        '<div class="vwrap"><button class="vrow' +
        (on ? " on" : "") +
        '" data-act="tv" data-inf="' +
        esc(v[0]) +
        '" role="checkbox" aria-checked="' +
        on +
        '"><span class="chk">' +
        ICON.check +
        "</span><span><b>" +
        esc(v[0]) +
        " · " +
        esc(v[1]) +
        " · " +
        esc(v[2]) +
        "</b><small>" +
        esc(v[3]) +
        "</small></span></button></div>"
      );
    })
    .join("");
  $("#vlist").innerHTML = html || '<p class="muted mt">No hay ningún verbo con ese nombre.</p>';
  restoreFocus(sig, $("#view"));
  const n = selV().length;
  $("#vcount").textContent =
    n +
    (n === 1 ? " verbo elegido" : " verbos elegidos") +
    (n < MIN ? " · necesitas al menos " + MIN + " para jugar" : "");
}

/**
 * Cambiar los verbos elegidos. Como los niveles se forman con ellos, el mapa de niveles empieza de nuevo; las estrellas
 * ya ganadas se quedan en el contador total. Si el mapa tiene estrellas, antes se pide confirmación.
 */
export function cambiarVerbos(nuevos) {
  const perm = verbosPermitidos();
  if (perm) nuevos = new Set([...nuevos].filter((v) => perm.has(v))); // una clase puede limitar las listas
  const ahora = selSet();
  if (nuevos.size === ahora.size && [...nuevos].every((v) => ahora.has(v))) return;
  if (mapStars() > 0) {
    S.vpend = Array.from(nuevos);
    modal(
      "<h2>¿Cambiar tus verbos?</h2>" +
        "<p>Los niveles se forman con tus verbos, así que el mapa <b>empezará de nuevo</b>. " +
        "Tus estrellas no se pierden: se quedan en tu contador (<b>" +
        totalStars() +
        "</b> en total) y seguirán sumando.</p>" +
        '<div class="row"><button class="btn go" data-act="modalclose">Mejor no</button>' +
        '<button class="btn" data-act="verbschange">Sí, cambiar</button></div>'
    );
    return;
  }
  aplicarVerbos(nuevos);
}
export function confirmarVerbos() {
  const nuevos = new Set(S.vpend || []);
  S.vpend = null;
  closeModal();
  aplicarVerbos(nuevos);
}
function aplicarVerbos(nuevos) {
  if (mapStars() > 0) resetMap();
  saveSel(nuevos);
  refreshVerbs();
}
