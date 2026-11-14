// Clases y ranking de punta a punta: el juego real sobre jsdom, con un servidor falso en lugar de Supabase.
// Es un recorrido seguido (unirse, jugar, ranking, salir, crear clase), así que los tests dependen del orden.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { $, $$, act, boot, click, solve, stored, type } from "../helpers/app.js";

const ID = "123e4567-e89b-42d3-a456-426614174000";
const SECRETO = "0123456789abcdef0123456789abcdef";
const PROFE = "fedcba9876543210fedcba9876543210";

// ---- servidor falso ----
const llamadas = [];
const respuestas = {}; // función -> () => {status, body} | Error
const ok = (body) => ({ status: 200, body });
const fallo = (message) => ({ status: 400, body: { code: "P0001", message } });
const llamadasA = (fn) => llamadas.filter((l) => l.fn === fn);

beforeAll(async () => {
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
  await boot();
});

/** Deja que terminen las peticiones pendientes (los temporizadores están falsos). */
const flush = async () => {
  for (let i = 0; i < 6; i++) await vi.advanceTimersByTimeAsync(0);
};
const escape = () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
const titulo = () => $("#view h1")?.textContent;

const FILAS = [
  { alias: "Lobo gris", points: 1240, levels: 5 },
  { alias: "Pipa", points: 540, levels: 2 },
  { alias: "<img src=x onerror=alert(1)>", points: 100, levels: 1 },
];

describe("unirse a una clase", () => {
  it("«Mi clase» en el inicio lleva a la pantalla de unirse, con el apodo ya puesto", () => {
    expect($('[data-act="class"]').textContent).toContain("Juega con tu clase");
    act("class");
    expect(titulo()).toBe("Mi clase");
    expect($("#cn").value).toBe("Pipa");
  });

  it("sin código no llama al servidor: avisa en el campo y le da el foco", async () => {
    act("joinclass");
    await flush();
    expect($("#cc-err").textContent).toMatch(/6 letras o números/);
    expect($("#cc").getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe($("#cc"));
    expect(llamadas).toHaveLength(0);
  });

  it("un apodo repetido se avisa en el campo del apodo", async () => {
    respuestas.join_class = () => fallo("apodo_en_uso");
    type("#cc", "abc 234");
    act("joinclass");
    await flush();
    expect(llamadasA("join_class")[0].body).toEqual({ p_code: "ABC234", p_alias: "Pipa" });
    expect($("#cn-err").textContent).toMatch(/ya lo usa otra persona/);
    expect(document.activeElement).toBe($("#cn"));
    expect($('[data-act="joinclass"]').disabled).toBe(false);
  });

  it("un fallo de conexión se avisa debajo del botón y se puede reintentar", async () => {
    respuestas.join_class = () => new TypeError("Failed to fetch");
    act("joinclass");
    await flush();
    expect($("#join-err").textContent).toMatch(/No hay conexión/);
    expect($('[data-act="joinclass"]').disabled).toBe(false);
    expect(stored("cls")).toBeNull();
  });

  it("al unirse pasa al ranking y recuerda la clase", async () => {
    respuestas.join_class = () => ok([{ player_id: ID, player_secret: SECRETO, class_name: "1º A de ESO" }]);
    respuestas.class_ranking = () => ok(FILAS);
    act("joinclass");
    await flush();
    expect(titulo()).toBe("Ranking");
    expect(stored("cls")).toEqual({ code: "ABC234", name: "1º A de ESO", alias: "Pipa", id: ID, secret: SECRETO });
    expect($(".rankhead").textContent).toContain("1º A de ESO");
    expect($(".rankhead").textContent).toContain("3 jugadores");
  });
});

describe("ranking", () => {
  it("marca la fila propia y no se fía del texto que llega del servidor", () => {
    const filas = $$(".rank li");
    expect(filas).toHaveLength(3);
    expect(filas[1].classList.contains("me")).toBe(true);
    expect(filas[1].textContent).toContain("Pipa (tú)");
    expect($(".rank img")).toBeNull(); // el apodo malicioso se muestra como texto, no como etiqueta
    expect(filas[2].textContent).toContain("<img src=x onerror=alert(1)>");
  });

  it("si falla al actualizar, avisa y conserva la lista anterior; al reintentar, se recupera", async () => {
    respuestas.class_ranking = () => new TypeError("Failed to fetch");
    act("rankreload");
    await flush();
    expect($(".err[role=alert]").textContent).toMatch(/No hay conexión/);
    expect($$(".rank li")).toHaveLength(3);
    respuestas.class_ranking = () => ok(FILAS.slice(0, 2));
    act("rankreload");
    await flush();
    expect($(".err[role=alert]")).toBeNull();
    expect($$(".rank li")).toHaveLength(2);
  });

  it("el inicio ya enseña el ranking de la clase y «Mi clase» lleva directo a él", async () => {
    act("home");
    expect($('[data-act="class"]').textContent).toContain("Ranking de 1º A de ESO");
    act("class");
    await flush();
    expect(titulo()).toBe("Ranking");
    act("home");
  });
});

describe("enviar partidas", () => {
  it("al superar un nivel se envía al servidor y se enseñan los puntos y el puesto", async () => {
    respuestas.submit_run = () => ok([{ points: 340, stars: 3 }]);
    respuestas.class_ranking = () => ok(FILAS);
    act("play");
    act("level", '[data-i="0"]');
    const huecos = $$("td[data-slot]").length;
    solve();
    await flush();
    expect(llamadasA("submit_run")).toHaveLength(1);
    expect(llamadasA("submit_run")[0].body).toEqual({
      p_player: ID,
      p_secret: SECRETO,
      p_level: 0,
      p_difficulty: "normal",
      p_correct: huecos,
      p_mistakes: 0,
    });
    expect($("#rank-msg").textContent).toContain("+340 puntos");
    expect($("#rank-msg").textContent).toContain("nº 2");
  });

  it("si falla el envío, avisa sin bloquear el juego y permite reintentar", async () => {
    respuestas.submit_run = () => new TypeError("Failed to fetch");
    act("next");
    solve();
    await flush();
    expect($("#rank-msg").textContent).toMatch(/No he podido enviar tu partida/);
    expect($('[data-act="next"]')).not.toBeNull(); // se puede seguir jugando
    respuestas.submit_run = () => ok([{ points: 200, stars: 3 }]);
    act("resendrun");
    await flush();
    expect($("#rank-msg").textContent).toContain("+200 puntos");
    expect(llamadasA("submit_run")).toHaveLength(3);
    expect(llamadasA("submit_run")[2].body.p_level).toBe(1);
  });

  it("si el servidor ya no nos conoce, la clase se olvida y no ofrece reintentar", async () => {
    respuestas.submit_run = () => fallo("jugador_no_valido");
    act("next");
    solve();
    await flush();
    expect($("#rank-msg").textContent).toMatch(/Ya no formas parte de esa clase/);
    expect($('[data-act="resendrun"]')).toBeNull();
    expect(stored("cls")).toBeNull();
    act("map");
    act("home");
  });
});

describe("salir de la clase", () => {
  beforeAll(async () => {
    respuestas.join_class = () => ok([{ player_id: ID, player_secret: SECRETO, class_name: "1º A de ESO" }]);
    act("class");
    type("#cc", "ABC234");
    act("joinclass");
    await flush();
  });

  it("pide confirmación, dice qué se borra y Escape la cancela sin borrar nada", () => {
    act("leaveask");
    expect($("#modal h2").textContent).toBe("¿Salir de la clase?");
    expect($("#modal").textContent).toContain("Pipa");
    expect(document.activeElement.dataset.act).toBe("modalclose"); // el botón seguro es el primero
    escape();
    expect($("#modal .modal")).toBeNull();
    expect(stored("cls")).not.toBeNull();
    expect(llamadasA("leave_class")).toHaveLength(0);
  });

  it("sin conexión no borra nada y lo dice dentro de la ventana", async () => {
    respuestas.leave_class = () => new TypeError("Failed to fetch");
    act("leaveask");
    act("leavedo");
    await flush();
    expect($("#leave-err").textContent).toMatch(/No hay conexión/);
    expect(stored("cls")).not.toBeNull();
  });

  it("al confirmar, borra en el servidor, olvida la clase y vuelve al inicio", async () => {
    respuestas.leave_class = () => ok(true);
    act("leavedo");
    await flush();
    expect(llamadasA("leave_class").at(-1).body).toEqual({ p_player: ID, p_secret: SECRETO });
    expect(stored("cls")).toBeNull();
    expect($("#modal .modal")).toBeNull();
    expect(titulo()).toBe("Pipo y los verbos irregulares");
    expect($('[data-act="class"]').textContent).toContain("Juega con tu clase");
  });
});

describe("crear una clase (profe)", () => {
  it("el nombre es obligatorio", async () => {
    respuestas.create_class = () => fallo("nombre_invalido");
    act("class");
    act("teacher");
    expect(titulo()).toBe("Crear una clase");
    act("teachercreate");
    await flush();
    expect($("#tn-err").textContent).toMatch(/nombre de la clase/);
    expect(stored("teach")).toBeNull();
  });

  it("al crearla enseña el código y recuerda la clave de quien la crea", async () => {
    respuestas.create_class = () => ok([{ code: "DEF567", teacher_secret: PROFE }]);
    type("#tn", "1º B de ESO");
    act("teachercreate");
    await flush();
    expect($(".codebig").textContent).toBe("DEF567");
    expect(stored("teach")).toEqual({ code: "DEF567", secret: PROFE });
  });

  it("puede ver el ranking de su clase, sin opción de «salir»", async () => {
    respuestas.class_ranking = () => ok([]);
    act("teacherrank");
    await flush();
    expect(titulo()).toBe("Ranking");
    expect($(".rankhead").textContent).toContain("DEF567");
    expect($("main").textContent).toContain("Todavía no hay partidas");
    expect($('[data-act="leaveask"]')).toBeNull();
    act("teacher");
    expect(titulo()).toBe("Crear una clase");
  });

  it("quita a un alumno y avisa si no existe", async () => {
    respuestas.teacher_remove_player = () => ok(false);
    type("#tr", "Nadie");
    act("teacherremove");
    await flush();
    expect($("#tr-msg").textContent).toMatch(/No hay nadie con ese apodo/);
    respuestas.teacher_remove_player = () => ok(true);
    act("teacherremove");
    await flush();
    expect($("#tr-msg").textContent).toContain("he quitado a Nadie");
    expect(llamadasA("teacher_remove_player").at(-1).body).toEqual({
      p_code: "DEF567",
      p_teacher_secret: PROFE,
      p_alias: "Nadie",
    });
  });

  it("borrar la clase pide confirmación y, al confirmar, vuelve a pedir un nombre", async () => {
    respuestas.teacher_delete_class = () => ok(true);
    act("teacherdelask");
    expect($("#modal h2").textContent).toBe("¿Borrar la clase?");
    click($('#modal [data-act="modalclose"]'));
    expect(stored("teach")).not.toBeNull();
    act("teacherdelask");
    act("teacherdel");
    await flush();
    expect($("#modal .modal")).toBeNull();
    expect(stored("teach")).toBeNull();
    expect($("#tn")).not.toBeNull();
  });
});
