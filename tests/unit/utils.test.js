import { describe, expect, it } from "vitest";
import { esc, pick, shuffle } from "../../js/utils.js";

describe("esc", () => {
  it("escapa los caracteres peligrosos para HTML", () => {
    expect(esc(`<img src="x" onerror='a&b'>`)).toBe("&lt;img src=&quot;x&quot; onerror='a&amp;b'&gt;");
  });
  it("convierte cualquier valor a texto", () => expect(esc(42)).toBe("42"));
});

describe("shuffle", () => {
  it("mantiene los mismos elementos y devuelve el mismo array", () => {
    const a = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(shuffle(a)).toBe(a);
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe("pick", () => {
  it("devuelve un elemento del array", () => {
    for (let i = 0; i < 50; i++) expect(["a", "b", "c"]).toContain(pick(["a", "b", "c"]));
  });
});
