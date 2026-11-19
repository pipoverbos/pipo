// El resumen del seguimiento: lo que contesta el servidor, junto en una ficha por alumno.
import { describe, expect, it } from "vitest";
import { resumirAlumnos } from "../../js/prof.js";

const fila = (alias, level, difficulty, plays, stars, points, last) => ({
  alias,
  level,
  difficulty,
  plays,
  stars,
  points,
  last,
});
const SIN = (alias) => fila(alias, null, null, 0, null, null, null);

describe("resumirAlumnos", () => {
  it("junta niveles, puntos, partidas y la última vez de cada alumno", () => {
    const r = resumirAlumnos(
      [
        fila("Ana", 0, "normal", 2, 3, 438, "2026-11-18T10:00:00+00:00"),
        fila("Ana", 1, "normal", 1, 2, 300, "2026-11-19T09:00:00+00:00"),
        fila("Ana", 0, "easy", 4, 3, 390, "2026-11-10T09:00:00+00:00"),
      ],
      []
    );
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      alias: "Ana",
      jugado: true,
      partidas: 7,
      puntos: 438 + 300 + 390,
      ultima: "2026-11-19T09:00:00+00:00",
    });
  });
  it("ordena los niveles por dificultad (fácil, normal, difícil) y luego por nivel", () => {
    const [a] = resumirAlumnos(
      [
        fila("Ana", 2, "hard", 1, 1, 1, null),
        fila("Ana", 1, "easy", 1, 1, 1, null),
        fila("Ana", 0, "normal", 1, 1, 1, null),
        fila("Ana", 0, "easy", 1, 1, 1, null),
      ],
      []
    );
    expect(a.niveles.map((n) => `${n.difficulty}${n.level}`)).toEqual(["easy0", "easy1", "normal0", "hard2"]);
  });
  it("un alumno sin partidas aparece, marcado como no jugado", () => {
    const [a] = resumirAlumnos([SIN("Zoe")], []);
    expect(a).toMatchObject({
      alias: "Zoe",
      jugado: false,
      partidas: 0,
      puntos: 0,
      ultima: null,
      niveles: [],
      fallos: [],
    });
  });
  it("ordena los alumnos por apodo sin distinguir mayúsculas ni tildes", () => {
    const r = resumirAlumnos([SIN("zoe"), SIN("Álvaro"), SIN("Bea"), SIN("ana")], []);
    expect(r.map((a) => a.alias)).toEqual(["Álvaro", "ana", "Bea", "zoe"]);
  });
  it("une los verbos fallados al alumno (aunque no tenga partidas en la lista) y los ordena por veces", () => {
    const r = resumirAlumnos(
      [fila("Ana", 0, "normal", 1, 3, 400, null)],
      [
        { alias: "Ana", verb: "be", times: 1 },
        { alias: "ana", verb: "go", times: 5 },
        { alias: "Ana", verb: "bring", times: 5 },
        { alias: "Pepe", verb: "do", times: 2 },
      ]
    );
    expect(r.map((a) => a.alias)).toEqual(["Ana", "Pepe"]);
    expect(r[0].fallos).toEqual([
      { verb: "bring", times: 5 },
      { verb: "go", times: 5 },
      { verb: "be", times: 1 },
    ]);
    expect(r[1].fallos).toEqual([{ verb: "do", times: 2 }]);
  });
  it("sin datos devuelve una lista vacía", () => expect(resumirAlumnos([], [])).toEqual([]));
});
