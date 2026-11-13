// Ayudas para los tests de punta a punta: arrancan el juego real sobre jsdom y lo manejan como lo haría una persona.
import { vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { BASE } from "../../js/data/base-verbs.js";

/** Arranca el juego con el HTML real de index.html. Cada archivo de test se ejecuta aislado y llama a boot() una vez. */
export async function boot({ seen = true, storage = {} } = {}) {
  localStorage.clear();
  localStorage.setItem("pipo2.seen", JSON.stringify(seen));
  for (const [k, v] of Object.entries(storage)) localStorage.setItem("pipo2." + k, JSON.stringify(v));
  const html = fs.readFileSync(path.resolve(import.meta.dirname, "../../index.html"), "utf8");
  document.body.innerHTML = html.match(/<body>([\s\S]*)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/g, "");
  document.documentElement.lang = html.match(/<html[^>]*\blang="([^"]+)"/)?.[1] ?? "";
  document.title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "";
  window.scrollTo = () => {};
  vi.useFakeTimers();
  await import("../../js/main.js");
  vi.advanceTimersByTime(5000); // la pantalla de carga termina sola
}

export const $ = (sel) => document.querySelector(sel);
export const $$ = (sel) => [...document.querySelectorAll(sel)];
export const click = (el) => {
  if (!el) throw new Error("click: el elemento no existe");
  el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
};
export const act = (name, extra = "") => click($(`[data-act="${name}"]${extra}`));
export const type = (sel, value) => {
  const el = $(sel);
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
};
export const stored = (key) => JSON.parse(localStorage.getItem("pipo2." + key));
export const modalTitle = () => $("#modal h2")?.textContent ?? null;
export const livesLeft = () => $$(".hearts svg:not(.lost)").length;

// ---- partida ----
const rowOf = (tr) => {
  const visible = [...tr.children]
    .map((td, f) => [f, td.classList.contains("slot") ? null : td.textContent.trim()])
    .filter(([, text]) => text !== null);
  const matches = BASE.filter((v) => visible.every(([f, text]) => v[f] === text));
  if (matches.length !== 1) throw new Error(`rowOf: ${matches.length} verbos encajan con ${JSON.stringify(visible)}`);
  return matches[0];
};
const nextSlot = () => {
  const slot = $("td[data-slot]");
  if (!slot) return null;
  const [i, f] = slot.dataset.slot.split("-").map(Number);
  return { key: slot.dataset.slot, slot, f, row: rowOf($$("table.vt tr")[i + 1]) };
};

/** Pone una respuesta en la casilla: con fichas (niveles 1-4) o escribiendo (nivel 5). */
function answer({ key, slot }, text) {
  if ($(".tray")) {
    click($$(".chip").find((c) => c.textContent.trim() === text));
    click($(`[data-slot="${key}"]`)); // la tabla se vuelve a pintar al elegir ficha
  } else {
    click(slot);
    type("#ti", text);
    act("check");
  }
}

/** Resuelve la partida en curso sin cometer errores, hasta que aparezca la ventana final (o tras `max` respuestas). */
export function solve(max = Infinity) {
  for (let guard = 0; guard < 300; guard++) {
    const target = nextSlot();
    if ($("#modal .modal") || !target || guard >= max) return;
    answer(target, target.row[target.f]);
  }
  throw new Error("solve: la partida no terminó");
}

/** Comete un error en la primera casilla libre. */
export function makeMistake() {
  const target = nextSlot();
  if ($(".tray")) {
    click($$(".chip").find((c) => c.textContent.trim() !== target.row[target.f]));
    click($(`[data-slot="${target.key}"]`));
  } else {
    click(target.slot);
    type("#ti", "respuestaincorrecta");
    act("check");
  }
}
