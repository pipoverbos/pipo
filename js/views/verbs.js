// Mis verbos: elegir verbos uno a uno o por listas, y buscar.
import { $, esc } from "../utils.js";
import { S } from "../state.js";
import { selSet, selV } from "../verbs.js";
import { BASE } from "../data/base-verbs.js";
import { MIN, LISTS } from "../data/config.js";
import { ICON } from "../ui/icons.js";
import { focusSignature, restoreFocus } from "../ui/focus.js";

export function verbsView(v) {
  const pill = (p, text) => `<button class="pill" data-act="pre" data-p="${p}">${text}</button>`;
  const pills =
    pill("all", "Todos") +
    pill("none", "Ninguno") +
    LISTS.map((l) => pill(l.id, `${l.name} (${l.from}–${l.to})`)).join("");
  v.innerHTML =
    '<section><div class="top"><button class="iconbtn" data-act="home" aria-label="Volver">' +
    ICON.back +
    "</button><h1>Mis verbos</h1></div>" +
    '<p><b id="vcount"></b></p>' +
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
  const list = BASE.filter((v) => !q || v[0].indexOf(q) > -1 || v[3].toLowerCase().indexOf(q) > -1);
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
