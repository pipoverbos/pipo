// Navegación: cada pantalla se registra con su nombre y render() dibuja la actual.
import { $ } from "./utils.js";
import { S } from "./state.js";
import { focusSignature, restoreFocus, focusHeading } from "./ui/focus.js";

const views = {};
let lastKey = null;

export function registerView(name, fn) {
  views[name] = fn;
}

/** Cambia de pantalla y lleva el foco a su título. */
export function go(s) {
  S.screen = s;
  draw(true);
}

/** Repinta la pantalla actual. Si no cambia de pantalla ni de paso de la presentación, conserva el foco. */
export function render() {
  draw(false);
}

function draw(newScreen) {
  const v = $("#view");
  const key = S.screen + ":" + S.meet;
  const changed = newScreen || key !== lastKey;
  const sig = changed ? null : focusSignature(v);
  lastKey = key;
  window.scrollTo(0, 0);
  if (views[S.screen]) views[S.screen](v);
  if (changed) focusHeading(v);
  else restoreFocus(sig, v);
}
