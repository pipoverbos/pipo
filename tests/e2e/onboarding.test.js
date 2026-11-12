import { beforeAll, describe, expect, it } from "vitest";
import { $, act, boot, stored, type } from "../helpers/app.js";

describe("primera visita", () => {
  beforeAll(() => boot({ seen: false }));

  it("termina la carga y presenta a Pipo", () => {
    expect($(".meet")).not.toBeNull();
    expect($(".meet h2").textContent).toContain("Soy Pipo");
  });

  it("recorre los 3 pasos y guarda el nombre", () => {
    type("#nm", "Ana");
    act("meetnext");
    expect($(".meet h2").textContent).toBe("Así se juega");
    act("meetnext");
    expect($(".meet h2").textContent).toContain("Ana");
    act("meetnext");
    expect($(".home")).not.toBeNull();
    expect(stored("name")).toBe("Ana");
    expect(stored("seen")).toBe(true);
  });

  it("saluda por el nombre en el inicio", () => {
    expect($(".bubble").textContent).toContain("Ana");
  });
});
