// Auditoría automática de accesibilidad (axe-core) del panel del profesor.
// El contraste de color no se puede medir en jsdom: lo cubre tests/unit/contrast.test.js para los colores de tokens.css.
import { beforeAll, describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import { $, $$, act, boot, click } from "../helpers/app.js";

HTMLCanvasElement.prototype.getContext = () => null;

const TOKEN = "0123456789abcdef0123456789abcdef";

async function audit() {
  const result = await axe.run(document, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] },
    rules: { "color-contrast": { enabled: false } },
  });
  return result.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
}
const esperar = () => new Promise((r) => setTimeout(r, 20));

describe("accesibilidad del panel del profesor (axe-core)", () => {
  beforeAll(async () => {
    const CLASE = {
      code: "ABC234",
      name: "1º A de ESO",
      players: 2,
      last_run: "2026-11-18T10:00:00+00:00",
      allowed_lists: [1, 2, 3, 4, 5, 6],
      allowed_difficulties: ["easy", "normal", "hard"],
      created_at: "2026-11-01T10:00:00+00:00",
    };
    const respuestas = {
      prof_classes: [CLASE],
      prof_create_class: [{ code: "DEF567", name: "Nueva" }],
      prof_progress: [
        {
          alias: "Ana",
          level: 0,
          difficulty: "easy",
          plays: 3,
          best_stars: 3,
          best_points: 390,
          last_played: "2026-11-10T09:00:00+00:00",
        },
        {
          alias: "Zoe",
          level: null,
          difficulty: null,
          plays: 0,
          best_stars: null,
          best_points: null,
          last_played: null,
        },
      ],
      prof_misses: [{ alias: "Ana", verb: "go", times: 5 }],
      class_ranking: [{ alias: "Ana", points: 390, levels: 1 }],
      prof_reset_student: "k3m9x2ab",
      prof_remove_student: true,
      prof_delete_class: true,
      prof_set_config: true,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => ({ status: 200, text: async () => JSON.stringify(respuestas[url.split("/rpc/")[1]]) }))
    );
    await boot({ role: false, storage: { acc: { token: TOKEN, role: "profe", username: "marta.lopez" } } });
    vi.useRealTimers(); // axe usa setTimeout por dentro: con temporizadores falsos nunca termina
  });

  it("mis clases", async () => {
    act("profe");
    await esperar();
    expect($$('[data-act="profopen"]')).toHaveLength(1);
    expect(await audit()).toEqual([]);
  });

  it("crear una clase", async () => {
    act("profnew");
    expect(await audit()).toEqual([]);
    act("profback");
    await esperar();
  });

  it("una clase: alumnos", async () => {
    act("profopen");
    await esperar();
    expect($$(".student")).toHaveLength(2);
    expect(await audit()).toEqual([]);
  });

  it("una clase: ranking", async () => {
    act("proftab", '[data-t="ranking"]');
    await esperar();
    expect($(".rank")).not.toBeNull();
    expect(await audit()).toEqual([]);
  });

  it("una clase: ajustes", async () => {
    act("proftab", '[data-t="ajustes"]');
    expect(await audit()).toEqual([]);
  });

  it("confirmación de borrar la clase", async () => {
    act("profdelask");
    expect(await audit()).toEqual([]);
    act("modalclose");
  });

  it("informe de un alumno", async () => {
    act("proftab", '[data-t="alumnos"]');
    await esperar();
    click($$('[data-act="profstudent"]').find((b) => b.dataset.alias === "Ana"));
    expect($$("table.tbl")).toHaveLength(2);
    expect(await audit()).toEqual([]);
  });

  it("informe de un alumno que no ha jugado", async () => {
    act("profstudentback");
    click($$('[data-act="profstudent"]').find((b) => b.dataset.alias === "Zoe"));
    expect(await audit()).toEqual([]);
    act("profstudentback");
    click($$('[data-act="profstudent"]').find((b) => b.dataset.alias === "Ana"));
  });

  it("confirmación de restablecer la contraseña y contraseña temporal", async () => {
    act("studentresetask");
    expect(await audit()).toEqual([]);
    act("studentreset");
    await esperar();
    expect($("#temp-pw").textContent).toBe("k3m9x2ab");
    expect(await audit()).toEqual([]);
    act("tempclose");
  });

  it("confirmación de quitar a un alumno", async () => {
    act("studentremoveask");
    expect(await audit()).toEqual([]);
    act("modalclose");
  });
});
