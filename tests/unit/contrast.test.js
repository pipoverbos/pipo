// Contraste de los colores de css/tokens.css (WCAG AA: 4,5 para texto normal). axe no puede medirlo en jsdom,
// así que se calcula aquí: un cambio de color que no llegue al mínimo hace fallar la CI.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const css = fs.readFileSync(path.resolve(import.meta.dirname, "../../css/tokens.css"), "utf8");
const block = (selector) => css.match(new RegExp(selector + "\\s*\\{([^}]*)\\}"))?.[1] ?? "";
const vars = (text) =>
  Object.fromEntries([...text.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));

const themes = {
  claro: vars(block(":root")),
  oscuro: vars(block(String.raw`:root\[data-theme="dark"\]`)),
};
const oscuroPorSistema = vars(block(String.raw`:root:not\(\[data-theme="light"\]\)`));

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// Texto sobre fondo, tal como se usa en el juego.
const pairs = [
  ["ink", "paper"],
  ["ink", "card"],
  ["ink", "h0"],
  ["ink", "h1"],
  ["ink", "h2"],
  ["ink", "h3"],
  ["ink2", "paper"],
  ["ink2", "card"],
  ["bad", "paper"],
  ["bad", "card"],
];

describe("contraste de los colores", () => {
  it("los dos bloques del modo oscuro (por sistema y manual) son idénticos", () => {
    expect(oscuroPorSistema).toEqual(themes.oscuro);
  });

  for (const [theme, colors] of Object.entries(themes)) {
    for (const [fg, bg] of pairs) {
      it(`${theme}: ${fg} sobre ${bg} llega a 4,5`, () => {
        expect(colors[fg], `falta --${fg}`).toBeDefined();
        expect(colors[bg], `falta --${bg}`).toBeDefined();
        expect(contrast(colors[fg], colors[bg])).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});
