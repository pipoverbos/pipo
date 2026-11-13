// Utilidades generales sin dependencias.

export const $ = function (s) {
  return document.querySelector(s);
};
export function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
/** Apodo del jugador: sin espacios de más ni al principio y al final. */
export function cleanAlias(s) {
  return String(s).replace(/\s+/g, " ").trim();
}
/** Un apodo válido tiene de 2 a 20 caracteres, empieza por letra o número y solo usa letras, números, espacios, «_», «-» y «.». */
export function validAlias(s) {
  return /^[\p{L}\p{N}][\p{L}\p{N} _.-]{1,19}$/u.test(s);
}
export function shuffle(a) {
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}
export function pick(a) {
  return a[Math.floor(Math.random() * a.length)];
}
