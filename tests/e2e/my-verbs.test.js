import { beforeAll, describe, expect, it } from "vitest";
import { BASE } from "../../js/data/base-verbs.js";
import { LISTS } from "../../js/data/config.js";
import { $, $$, act, boot, stored, type } from "../helpers/app.js";

describe("mis verbos", () => {
  beforeAll(async () => {
    await boot();
    act("verbs");
  });

  it("muestra todos los verbos, todos elegidos", () => {
    expect($$(".vrow")).toHaveLength(BASE.length);
    expect($("#vcount").textContent).toContain(`${BASE.length} verbos elegidos`);
  });

  it("ya no se pueden añadir ni borrar verbos propios", () => {
    expect($("#addbox")).toBeNull();
    expect($('[data-act="addverb"]')).toBeNull();
    expect($('[data-act="del"]')).toBeNull();
  });

  it("ofrece Todos, Ninguno y una lista por cada grupo", () => {
    const labels = $$(".chiprow .pill").map((p) => p.textContent);
    expect(labels).toHaveLength(2 + LISTS.length);
    expect(labels[2]).toBe("Lista 1 (be–eat)");
    expect(labels[3]).toBe("Lista 2 (fall–leave)");
    expect(labels.at(-1)).toBe("Lista 6 (steal–write)");
  });

  it("el buscador filtra por verbo y por significado", () => {
    type("#vq", "bring");
    expect($$(".vrow")).toHaveLength(1);
    type("#vq", "comprar");
    expect($$(".vrow")[0].textContent).toContain("buy");
    type("#vq", "zzzz");
    expect($("#vlist").textContent).toContain("No hay ningún verbo");
    type("#vq", "");
  });

  it("'Ninguno' deja la lista vacía y avisa de que hacen falta 10", () => {
    act("pre", '[data-p="none"]');
    expect($("#vcount").textContent).toContain("necesitas al menos 10");
    expect($$(".vrow.on")).toHaveLength(0);
  });

  it("cada lista elige exactamente sus verbos", () => {
    for (const list of LISTS) {
      act("pre", `[data-p="${list.id}"]`);
      const chosen = $$(".vrow.on").map((r) => r.dataset.inf);
      expect(chosen[0], list.id).toBe(list.from);
      expect(chosen.at(-1), list.id).toBe(list.to);
      expect(stored("sel"), list.id).toEqual(chosen);
    }
  });

  it("elegir una lista reemplaza la selección anterior", () => {
    act("pre", '[data-p="l1"]');
    expect($$(".vrow.on")).toHaveLength(15);
    act("pre", '[data-p="l2"]');
    expect($$(".vrow.on")).toHaveLength(15);
    expect($('.vrow[data-inf="be"]').classList.contains("on")).toBe(false);
  });

  it("se puede marcar y desmarcar un verbo suelto", () => {
    act("tv", '[data-inf="be"]');
    expect($('.vrow[data-inf="be"]').classList.contains("on")).toBe(true);
    expect($("#vcount").textContent).toContain("16 verbos elegidos");
    act("tv", '[data-inf="be"]');
    expect($("#vcount").textContent).toContain("15 verbos elegidos");
  });

  it("'Todos' vuelve a elegirlos todos", () => {
    act("pre", '[data-p="all"]');
    expect($("#vcount").textContent).toContain(`${BASE.length} verbos elegidos`);
  });
});
