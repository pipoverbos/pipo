// Verbos elegidos y listas, comparación de respuestas, estrellas y errores.
import { store } from "./store.js";
import { BASE } from "./data/base-verbs.js";

/** Infinitivos de una lista de LISTS (de `from` a `to`, según el orden de BASE). */
export function listInfs(list) {
  var a = BASE.findIndex(function (v) {
      return v[0] === list.from;
    }),
    b = BASE.findIndex(function (v) {
      return v[0] === list.to;
    });
  return BASE.slice(a, b + 1).map(function (v) {
    return v[0];
  });
}
function formas(txt) {
  return txt
    .split("/")
    .map(function (s) {
      return s.trim().toLowerCase();
    })
    .filter(Boolean);
}
/**
 * Truco de un verbo sin regalar lo que aún no se ha rellenado: las formas de las columnas que
 * todavía no se ven en esa fila (`conocidas` = índices 0-2 visibles o ya colocadas) se tapan con «___».
 * Una forma que coincide con otra ya visible (cut, cut, cut) no se tapa, porque ya está a la vista.
 */
export function maskTrick(row, conocidas) {
  var vistas = new Set(),
    tapadas = new Set(),
    texto = row[4];
  for (var c = 0; c < 3; c++)
    formas(row[c]).forEach(function (w) {
      (conocidas.indexOf(c) >= 0 ? vistas : tapadas).add(w);
    });
  tapadas.forEach(function (w) {
    if (!vistas.has(w)) texto = texto.replace(new RegExp("(?<![\\p{L}-])" + w + "(?![\\p{L}])", "giu"), "___");
  });
  return texto;
}
export function selSet() {
  var s = store.get("sel", null);
  if (!s)
    s = BASE.map(function (v) {
      return v[0];
    });
  return new Set(s);
}
export function selV() {
  var s = selSet();
  return BASE.filter(function (v) {
    return s.has(v[0]);
  });
}
export function lev(a, b) {
  var m = a.length,
    n = b.length,
    d = [],
    i,
    j;
  for (i = 0; i <= m; i++) {
    d[i] = [i];
  }
  for (j = 1; j <= n; j++) {
    d[0][j] = j;
  }
  for (i = 1; i <= m; i++)
    for (j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}
export function score(v) {
  var p = v[1].split("/")[0].trim(),
    q = v[2].split("/")[0].trim();
  return lev(v[0], p) + lev(v[0], q) + (v[1].indexOf("/") > -1 ? 3 : 0);
}
export function reg(w) {
  w = w.split("/")[0].trim();
  if (/e$/.test(w)) return w + "d";
  if (/[^aeiou]y$/.test(w)) return w.slice(0, -1) + "ied";
  return w + "ed";
}
export function norm(s) {
  return s
    .toLowerCase()
    .replace(/[’]/g, "'")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s*\/\s*/g, "/");
}
export function same(a, b) {
  var f = function (s) {
    return norm(s)
      .split("/")
      .map(function (x) {
        return x.trim();
      })
      .sort()
      .join("/");
  };
  return f(a) === f(b);
}
export function getStars(d) {
  var s = store.get("stars." + d, [0, 0, 0, 0, 0]);
  return s;
}
export function unlocked(i, d) {
  return i === 0 || getStars(d)[i - 1] > 0;
}
export function missMap() {
  return store.get("miss", {});
}
export function addMiss(inf) {
  var m = missMap();
  m[inf] = (m[inf] || 0) + 1;
  store.set("miss", m);
}
export function saveSel(set) {
  store.set("sel", Array.from(set));
}
