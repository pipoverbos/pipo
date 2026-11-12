// Ventana modal sobre la pantalla actual.
import { $ } from "../utils.js";

export function modal(h) {
  $("#modal").innerHTML = '<div class="ov" role="dialog" aria-modal="true"><div class="modal">' + h + "</div></div>";
}
export function closeModal() {
  $("#modal").innerHTML = "";
}
