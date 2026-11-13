import { beforeAll, describe, expect, it } from "vitest";
import { $, act, boot, stored, type } from "../helpers/app.js";

describe("primera visita", () => {
  beforeAll(() => boot({ seen: false }));

  it("termina la carga y presenta a Pipo", () => {
    expect($(".meet")).not.toBeNull();
    expect($(".meet h1").textContent).toContain("Soy Pipo");
  });

  it("el apodo es obligatorio: no se puede seguir sin él", () => {
    expect($(".meet label").textContent).not.toContain("opcional");
    act("meetnext");
    expect($(".meet h1").textContent).toContain("Soy Pipo");
    expect($("#nm-err").textContent).toContain("apodo");
    expect($("#nm").getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe($("#nm"));
    expect(stored("name")).toBeNull();
  });

  it("rechaza un apodo de una letra o con símbolos raros", () => {
    for (const malo of ["A", "   ", "<b>", "@@"]) {
      type("#nm", malo);
      act("meetnext");
      expect($(".meet h1").textContent).toContain("Soy Pipo");
    }
    expect(stored("name")).toBeNull();
  });

  it("recorre los 3 pasos y guarda el apodo", () => {
    type("#nm", "  Ana   María ");
    act("meetnext");
    expect($(".meet h1").textContent).toBe("Así se juega");
    act("meetnext");
    expect($(".meet h1").textContent).toContain("Ana María");
    act("meetnext");
    expect($(".home")).not.toBeNull();
    expect(stored("name")).toBe("Ana María");
    expect(stored("seen")).toBe(true);
  });

  it("saluda por el apodo en el inicio", () => {
    expect($(".bubble").textContent).toContain("Ana María");
  });
});
