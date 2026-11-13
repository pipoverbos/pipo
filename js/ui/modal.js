// Ventana modal sobre la pantalla actual.
// Accesible: tiene nombre (su <h2>), el foco entra en ella y el resto de la página queda inerte mientras está abierta.
import { $ } from "../utils.js";

export function modal(h) {
  $("#modal").innerHTML =
    '<div class="ov" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal">' +
    h.replace("<h2>", '<h2 id="modal-title">') +
    "</div></div>";
  $("#sheet").setAttribute("inert", "");
  const first = $("#modal button");
  if (first) first.focus();
}
export function closeModal() {
  $("#modal").innerHTML = "";
  $("#sheet").removeAttribute("inert");
}
