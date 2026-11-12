// Mapa de niveles.
import { store } from "../store.js";
import { getStars, selV, unlocked } from "../verbs.js";
import { DIFFS, LV } from "../data/config.js";
import { ICON, starsHTML } from "../ui/icons.js";

function levelDesc(i, d) {
  var L = LV[i],
    g = L.gaps[d],
    t;
  if (i === 4) t = "Sin fichas: escribes tú " + g + (g === 1 ? " forma" : " formas") + " por fila";
  else {
    t = g + (g === 1 ? " hueco" : " huecos") + " por fila";
    if (i === 2) t += ", y puede faltar el infinitivo";
    if (i === 3) t += ", con " + L.tr[d] + " fichas trampa";
  }
  return t + ".";
}
export function mapView(v) {
  var d = store.get("diff", "normal"),
    stars = getStars(d),
    n = selV().length;
  var h =
    '<section><div class="top"><button class="iconbtn" data-act="home" aria-label="Volver">' +
    ICON.back +
    "</button><h2>Elige un nivel</h2></div>" +
    '<p class="muted">Dificultad: <b>' +
    DIFFS[d] +
    '</b>. Supera un nivel para abrir el siguiente.</p><div class="lgrid">';
  for (var i = 0; i < 5; i++) {
    var ok = unlocked(i, d);
    h +=
      '<button class="lvl' +
      (ok ? "" : " lock") +
      '" data-act="level" data-i="' +
      i +
      '"' +
      (ok ? "" : ' aria-disabled="true"') +
      ">" +
      '<span class="badge h' +
      (i % 4) +
      '">' +
      (i + 1) +
      '</span><span class="body"><b>' +
      LV[i].n +
      "</b><small>" +
      levelDesc(i, d) +
      "</small></span>" +
      (ok ? starsHTML(stars[i]) : ICON.lock) +
      "</button>";
  }
  h +=
    '</div><p class="muted mt" style="font-size:16px">Cada nivel usa verbos distintos, de los más fáciles a los más difíciles de los ' +
    n +
    " que elegiste.</p></section>";
  v.innerHTML = h;
}
