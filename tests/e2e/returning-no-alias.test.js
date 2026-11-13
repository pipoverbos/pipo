import { beforeAll, describe, expect, it } from "vitest";
import { $, act, boot, stored, type } from "../helpers/app.js";

describe("quien ya vio la presentación pero no tiene apodo", () => {
  beforeAll(() => boot({ seen: true, storage: { name: "" } }));

  it("vuelve a la presentación en vez de entrar al juego", () => {
    expect($(".home")).toBeNull();
    expect($(".meet h1").textContent).toContain("Soy Pipo");
  });

  it("al poner un apodo ya puede jugar", () => {
    type("#nm", "Leo");
    act("meetnext");
    act("meetnext");
    act("meetnext");
    expect($(".home")).not.toBeNull();
    expect(stored("name")).toBe("Leo");
  });
});
