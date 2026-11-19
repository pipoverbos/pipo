// Panel del profesor de punta a punta: sus clases, crear una, alumnos y seguimiento, ajustes, informe en PDF,
// contraseña temporal, quitar alumnos y borrar la clase. El juego real sobre jsdom con un servidor falso.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { $, $$, act, boot, click, stored, type } from "../helpers/app.js";
import { S } from "../../js/state.js";

const TOKEN = "0123456789abcdef0123456789abcdef";

// ---- servidor falso ----
const llamadas = [];
const respuestas = {};
const ok = (body) => ({ status: 200, body });
const fallo = (message) => ({ status: 400, body: { code: "P0001", message } });
const llamadasA = (fn) => llamadas.filter((l) => l.fn === fn);

const CLASE = {
  code: "ABC234",
  name: "1º A de ESO",
  players: 2,
  last_run: "2026-11-18T10:00:00+00:00",
  allowed_lists: [1, 2, 3, 4, 5, 6],
  allowed_difficulties: ["easy", "normal", "hard"],
  created_at: "2026-11-01T10:00:00+00:00",
};
const MALO = "<img src=x onerror=alert(1)>";
const PROGRESO = [
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
    alias: "Ana",
    level: 1,
    difficulty: "normal",
    plays: 1,
    best_stars: 2,
    best_points: 300,
    last_played: "2026-11-18T10:00:00+00:00",
  },
  { alias: MALO, level: 0, difficulty: "normal", plays: 1, best_stars: 1, best_points: 100, last_played: null },
  { alias: "Zoe", level: null, difficulty: null, plays: 0, best_stars: null, best_points: null, last_played: null },
];
const FALLOS = [
  { alias: "Ana", verb: "go", times: 5 },
  { alias: "Ana", verb: "be", times: 2 },
];

beforeAll(async () => {
  window.print = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, init) => {
      const fn = url.split("/rpc/")[1];
      llamadas.push({ fn, body: JSON.parse(init.body) });
      const r = respuestas[fn]?.();
      if (r instanceof Error) throw r;
      if (!r) return { status: 404, text: async () => "{}" };
      return { status: r.status, text: async () => JSON.stringify(r.body) };
    })
  );
  await boot({ role: false, storage: { acc: { token: TOKEN, role: "profe", username: "marta.lopez" } } });
});

const flush = async () => {
  for (let i = 0; i < 8; i++) await vi.advanceTimersByTimeAsync(0);
};
const titulo = () => $("#view h1")?.textContent;
const texto = (sel) => $(sel)?.textContent.replace(/\s+/g, " ").trim() ?? null;
const escape = () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
const entrarProfe = async () => {
  act("profe");
  await flush();
};

describe("mis clases", () => {
  it("sin clases, lo explica y deja crear la primera", async () => {
    respuestas.prof_classes = () => ok([]);
    await entrarProfe();
    expect(titulo()).toBe("Mis clases");
    expect($("#view").textContent).toContain("marta.lopez");
    expect(texto(".note")).toMatch(/Todavía no tienes clases/);
    expect(llamadasA("prof_classes").at(-1).body).toEqual({ p_token: TOKEN });
    expect($('[data-act="profnew"]')).not.toBeNull();
  });

  it("si falla al pedirlas, avisa y se puede reintentar", async () => {
    respuestas.prof_classes = () => new TypeError("Failed to fetch");
    act("logout");
    await flush();
    localStorage.setItem("pipo2.acc", JSON.stringify({ token: TOKEN, role: "profe", username: "marta.lopez" }));
    await entrarProfe();
    expect($(".err[role=alert]").textContent).toMatch(/No hay conexión/);
    respuestas.prof_classes = () => ok([CLASE]);
    act("proflist");
    await flush();
    expect($(".err[role=alert]")).toBeNull();
    expect($$('[data-act="profopen"]')).toHaveLength(1);
  });

  it("enseña cada clase con su código, sus alumnos y su última partida, escapando el texto", async () => {
    respuestas.prof_classes = () => ok([CLASE, { ...CLASE, code: "DEF567", name: MALO, players: 0, last_run: null }]);
    act("profnew"); // ir a crear una clase y volver pide la lista otra vez
    act("profback");
    await flush();
    const filas = $$('[data-act="profopen"]');
    expect(filas).toHaveLength(2);
    expect(filas[0].textContent).toContain("1º A de ESO");
    expect(filas[0].textContent).toContain("ABC234");
    expect(filas[0].textContent).toMatch(/2 alumnos · última partida el 18 nov/);
    expect(filas[1].textContent).toContain("Sin alumnos todavía");
    expect($("#view img")).toBeNull();
  });
});

describe("crear una clase", () => {
  it("el nombre es obligatorio y se avisa en el campo", async () => {
    act("profnew");
    expect(titulo()).toBe("Crear una clase");
    respuestas.prof_create_class = () => fallo("nombre_invalido");
    act("profnewsubmit");
    await flush();
    expect(texto("#pn-err")).toMatch(/nombre de la clase/);
    expect(document.activeElement).toBe($("#pn"));
    expect($('[data-act="profnewsubmit"]').disabled).toBe(false);
  });

  it("el límite de 20 clases se explica", async () => {
    respuestas.prof_create_class = () => fallo("demasiadas_clases");
    act("profnewsubmit");
    await flush();
    expect(texto("#pn-err")).toMatch(/20 clases/);
  });

  it("al crearla abre su pantalla, con el código para los alumnos", async () => {
    respuestas.prof_create_class = () => ok([{ code: "ABC234", name: "1º A de ESO" }]);
    respuestas.prof_classes = () => ok([CLASE]);
    respuestas.prof_progress = () => ok(PROGRESO);
    respuestas.prof_misses = () => ok(FALLOS);
    type("#pn", "1º A de ESO");
    $("#pn").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); // Intro en el campo
    await flush();
    expect(llamadasA("prof_create_class").at(-1).body).toEqual({ p_token: TOKEN, p_name: "1º A de ESO" });
    expect(titulo()).toBe("1º A de ESO");
    expect($(".codebig").textContent).toBe("ABC234");
  });

  it("copia el código de la clase", async () => {
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    act("profcopy");
    await flush();
    expect(writeText).toHaveBeenCalledWith("ABC234");
    expect(texto("#pc-msg")).toBe("Código copiado.");
    delete navigator.clipboard;
  });
});

describe("alumnos y seguimiento", () => {
  it("la pestaña «Alumnos» es la primera y enseña una ficha por alumno con sus puntos y sus verbos fallados", () => {
    expect($('[data-act="proftab"][data-t="alumnos"]').getAttribute("aria-pressed")).toBe("true");
    const fichas = $$(".student");
    expect(fichas).toHaveLength(3);
    const ana = fichas.find((f) => f.textContent.includes("Ana"));
    expect(ana.textContent).toContain("690 puntos"); // 390 + 300: la mejor partida de cada nivel y dificultad
    expect(ana.textContent).toMatch(/4 partidas · 2 niveles jugados · última el 18 nov/);
    expect(ana.textContent).toContain("go");
    expect(ana.textContent).toContain("5");
    expect(fichas.find((f) => f.textContent.includes("Zoe")).textContent).toContain("Sin partidas");
  });

  it("el apodo malicioso de un alumno se enseña como texto, nunca como etiqueta", () => {
    expect($("#view img")).toBeNull();
    expect($("#view").textContent).toContain(MALO);
  });

  it("pide el seguimiento con la sesión del profesor y el código de la clase", () => {
    expect(llamadasA("prof_progress").at(-1).body).toEqual({ p_token: TOKEN, p_code: "ABC234" });
    expect(llamadasA("prof_misses").at(-1).body).toEqual({ p_token: TOKEN, p_code: "ABC234" });
  });

  it("la pestaña «Ranking» enseña la clasificación pública de la clase", async () => {
    respuestas.class_ranking = () => ok([{ alias: "Ana", points: 690, levels: 2 }]);
    act("proftab", '[data-t="ranking"]');
    await flush();
    expect($$(".rank li")).toHaveLength(1);
    expect($(".rank li").textContent).toContain("Ana");
    expect($(".rank li").classList.contains("me")).toBe(false); // el profesor no es un jugador
  });

  it("un fallo al cargar se avisa y se puede reintentar", async () => {
    respuestas.class_ranking = () => new TypeError("Failed to fetch");
    act("proftab", '[data-t="alumnos"]');
    respuestas.prof_progress = () => new TypeError("Failed to fetch");
    act("proftab", '[data-t="ranking"]');
    await flush();
    expect($(".err[role=alert]").textContent).toMatch(/No hay conexión/);
    respuestas.class_ranking = () => ok([]);
    act("profreload");
    await flush();
    expect($(".err[role=alert]")).toBeNull();
    respuestas.prof_progress = () => ok(PROGRESO);
    act("proftab", '[data-t="alumnos"]');
    await flush();
    expect($$(".student")).toHaveLength(3);
  });
});

describe("ajustes de la clase", () => {
  it("enseña las listas y dificultades marcadas", () => {
    act("proftab", '[data-t="ajustes"]');
    expect($$('[data-act="cfgtoggle"][data-k="lists"]')).toHaveLength(6);
    expect($$('[data-act="cfgtoggle"][data-k="diffs"]')).toHaveLength(3);
    expect($$('[data-act="cfgtoggle"]').every((c) => c.checked)).toBe(true);
    expect(texto("#view")).toContain("Lista 1 (be–eat)");
  });

  it("no deja guardar sin ninguna lista ni sin ninguna dificultad, sin llamar al servidor", async () => {
    $$('[data-act="cfgtoggle"][data-k="lists"]').forEach((c) => click(c)); // el clic las desmarca
    act("cfgsave");
    await flush();
    expect(texto("#cfg-msg")).toMatch(/al menos una lista/);
    expect(llamadasA("prof_set_config")).toHaveLength(0);
  });

  it("guarda las listas y dificultades elegidas y lo confirma", async () => {
    respuestas.prof_set_config = () => ok(true);
    for (const n of [1, 2]) {
      click($(`[data-act="cfgtoggle"][data-k="lists"][data-v="${n}"]`));
    }
    for (const d of ["normal", "hard"]) {
      click($(`[data-act="cfgtoggle"][data-k="diffs"][data-v="${d}"]`));
    }
    act("cfgsave");
    await flush();
    expect(llamadasA("prof_set_config").at(-1).body).toEqual({
      p_token: TOKEN,
      p_code: "ABC234",
      p_lists: [1, 2],
      p_difficulties: ["easy"],
    });
    expect(texto("#cfg-msg")).toMatch(/Guardado/);
    expect($('[data-act="cfgsave"]').disabled).toBe(false);
  });

  it("si falla al guardar, lo dice sin perder lo elegido", async () => {
    respuestas.prof_set_config = () => new TypeError("Failed to fetch");
    act("cfgsave");
    await flush();
    expect($("#cfg-msg").className).toBe("err");
    expect(texto("#cfg-msg")).toMatch(/No hay conexión/);
    expect($('[data-act="cfgtoggle"][data-k="lists"][data-v="1"]').checked).toBe(true);
    expect($('[data-act="cfgtoggle"][data-k="diffs"][data-v="hard"]').checked).toBe(false);
  });
});

describe("informe de un alumno", () => {
  it("enseña el resumen, los niveles jugados con su mejor nota y los verbos que más falla", async () => {
    act("proftab", '[data-t="alumnos"]');
    await flush();
    click($$('[data-act="profstudent"]').find((b) => b.dataset.alias === "Ana"));
    expect(titulo()).toBe("Informe de alumno");
    expect(texto(".repname")).toBe("Ana");
    expect(texto(".report")).toContain("1º A de ESO (ABC234)");
    expect(texto(".repsum")).toContain("4 partidas jugadas");
    expect(texto(".repsum")).toContain("690 puntos");
    const [niveles, fallos] = $$("table.tbl");
    const filasN = [...niveles.querySelectorAll("tbody tr")];
    expect(filasN).toHaveLength(2);
    expect(filasN[0].textContent).toContain("1. Calentamiento");
    expect(filasN[0].textContent).toContain("Fácil");
    expect(filasN[0].textContent).toContain("3 estrellas de 3");
    expect(filasN[1].textContent).toContain("Normal");
    expect(filasN[1].textContent).toContain("2 estrellas de 3");
    const filasF = [...fallos.querySelectorAll("tbody tr")];
    expect(filasF).toHaveLength(2);
    expect(filasF[0].textContent).toContain("go · went · gone");
    expect(filasF[0].textContent).toContain("5");
  });

  it("las tablas tienen título y cabeceras para lectores de pantalla", () => {
    for (const t of $$("table.tbl")) {
      expect(t.querySelector("caption").textContent).toMatch(/Ana/);
      expect(t.querySelectorAll('th[scope="col"]').length).toBeGreaterThan(2);
    }
  });

  it("descargar el PDF abre la impresión con un título de archivo útil y lo restaura después", () => {
    const antes = document.title;
    let titulo_al_imprimir;
    window.print = vi.fn(() => {
      titulo_al_imprimir = document.title;
    });
    act("studentpdf");
    expect(window.print).toHaveBeenCalledTimes(1);
    expect(titulo_al_imprimir).toBe("Informe de Ana - 1º A de ESO");
    expect(document.title).toBe(antes);
  });

  it("un alumno que no ha jugado tiene informe, vacío", () => {
    act("profstudentback");
    click($$('[data-act="profstudent"]').find((b) => b.dataset.alias === "Zoe"));
    expect(texto(".report")).toContain("Todavía no ha jugado ningún nivel");
    expect(texto(".report")).toContain("No hay verbos fallados");
    act("profstudentback");
  });

  it("el informe de un alumno con un apodo malicioso lo enseña como texto", () => {
    click($$('[data-act="profstudent"]').find((b) => b.dataset.alias === MALO));
    expect($("#view img")).toBeNull();
    expect(texto(".repname")).toBe(MALO);
    act("profstudentback");
  });
});

describe("contraseña temporal de un alumno", () => {
  const abrirAna = () => click($$('[data-act="profstudent"]').find((b) => b.dataset.alias === "Ana"));

  it("pide confirmación antes de restablecer", () => {
    abrirAna();
    act("studentresetask");
    expect($("#modal h2").textContent).toBe("¿Restablecer la contraseña?");
    click($('#modal [data-act="modalclose"]'));
    expect(llamadasA("prof_reset_student")).toHaveLength(0);
  });

  it("si falla, lo dice dentro de la ventana", async () => {
    respuestas.prof_reset_student = () => fallo("alumno_sin_cuenta");
    act("studentresetask");
    act("studentreset");
    await flush();
    expect(texto("#rs-err")).toMatch(/versión antigua/);
    click($('#modal [data-act="modalclose"]'));
  });

  it("enseña la contraseña temporal una sola vez, se puede copiar y no queda guardada al cerrar", async () => {
    respuestas.prof_reset_student = () => ok("k3m9x2ab");
    act("studentresetask");
    act("studentreset");
    await flush();
    expect(llamadasA("prof_reset_student").at(-1).body).toEqual({ p_token: TOKEN, p_code: "ABC234", p_alias: "Ana" });
    expect($("#modal h2").textContent).toBe("Contraseña temporal");
    expect($("#temp-pw").textContent).toBe("k3m9x2ab");
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    act("tempcopy");
    await flush();
    expect(writeText).toHaveBeenCalledWith("k3m9x2ab");
    delete navigator.clipboard;
    escape(); // Escape cierra la ventana y se olvida la contraseña
    expect($("#modal .modal")).toBeNull();
    expect(S.temp).toBeNull();
    expect(document.body.textContent).not.toContain("k3m9x2ab");
    expect(localStorage.getItem("pipo2.temp")).toBeNull();
  });
});

describe("quitar a un alumno y borrar la clase", () => {
  it("quitar pide confirmación, avisa si falla y, al confirmar, vuelve a la clase y recarga", async () => {
    act("studentremoveask");
    expect($("#modal h2").textContent).toBe("¿Quitar a este alumno?");
    click($('#modal [data-act="modalclose"]'));
    expect(llamadasA("prof_remove_student")).toHaveLength(0);
    respuestas.prof_remove_student = () => new TypeError("Failed to fetch");
    act("studentremoveask");
    act("studentremove");
    await flush();
    expect(texto("#sr-err")).toMatch(/No hay conexión/);
    respuestas.prof_remove_student = () => ok(true);
    respuestas.prof_progress = () => ok(PROGRESO.filter((f) => f.alias !== "Ana"));
    respuestas.prof_misses = () => ok([]); // sus verbos fallados se borran con él
    act("studentremove");
    await flush();
    expect(llamadasA("prof_remove_student").at(-1).body).toEqual({ p_token: TOKEN, p_code: "ABC234", p_alias: "Ana" });
    expect($("#modal .modal")).toBeNull();
    expect(titulo()).toBe("1º A de ESO");
    expect($$(".student").some((f) => f.textContent.includes("Ana"))).toBe(false);
  });

  it("borrar la clase pide confirmación y, al confirmar, vuelve a la lista de clases", async () => {
    act("proftab", '[data-t="ajustes"]');
    act("profdelask");
    expect($("#modal h2").textContent).toBe("¿Borrar la clase?");
    expect($("#modal").textContent).toContain("1º A de ESO");
    click($('#modal [data-act="modalclose"]'));
    expect(llamadasA("prof_delete_class")).toHaveLength(0);
    respuestas.prof_delete_class = () => new TypeError("Failed to fetch");
    act("profdelask");
    act("profdel");
    await flush();
    expect(texto("#del-err")).toMatch(/No hay conexión/);
    respuestas.prof_delete_class = () => ok(true);
    respuestas.prof_classes = () => ok([]);
    act("profdel");
    await flush();
    expect(llamadasA("prof_delete_class").at(-1).body).toEqual({ p_token: TOKEN, p_code: "ABC234" });
    expect($("#modal .modal")).toBeNull();
    expect(titulo()).toBe("Mis clases");
    expect($$('[data-act="profopen"]')).toHaveLength(0);
  });
});

describe("sesión del profesor", () => {
  it("si la sesión ha caducado, se pide entrar de nuevo con un aviso", async () => {
    respuestas.prof_classes = () => fallo("sesion_no_valida");
    act("profnew");
    act("profback");
    await flush();
    expect(titulo()).toBe("Soy profesor");
    expect($(".err[role=alert]").textContent).toMatch(/Tu sesión ha caducado/);
    expect(stored("acc")).toBeNull();
  });
});
