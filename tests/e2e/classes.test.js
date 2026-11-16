// Clases, retos y ranking de punta a punta con la cuenta: el juego real sobre jsdom, con un servidor falso.
// Es un recorrido seguido (unirse, jugar, ranking, salir, retos), así que los tests dependen del orden.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { $, $$, act, boot, click, makeMistake, SESION, solve, stored, type } from "../helpers/app.js";

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
const AULA = {
  class_name: "1º A de ESO",
  alias: "Pipa",
  kind: "aula",
  allowed_lists: [1, 2, 3, 4, 5, 6],
  allowed_difficulties: ["easy", "normal", "hard"],
};
const CLASE = { code: "ABC234", name: "1º A de ESO", alias: "Pipa", kind: "aula", owner: false };

describe("unirse a una clase", () => {
  it("«Unirme a una clase» en el inicio lleva a la pantalla de unirse, con el apodo ya puesto", () => {
    expect($('[data-act="class"]').textContent).toContain("Unirme a una clase");
    act("class");
    expect(titulo()).toBe("Unirme a una clase");
    expect($("#cn").value).toBe("Pipa");
  });

  it("sin código no llama al servidor: avisa en el campo y le da el foco", async () => {
    act("joinclass");
    await flush();
    expect($("#cc-err").textContent).toMatch(/6 letras o números/);
    expect($("#cc").getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe($("#cc"));
    expect(llamadasA("alu_join_class")).toHaveLength(0);
  });

  it("un apodo repetido se avisa en el campo del apodo", async () => {
    respuestas.alu_join_class = () => fallo("apodo_en_uso");
    type("#cc", "abc 234");
    act("joinclass");
    await flush();
    expect(llamadasA("alu_join_class")[0].body).toEqual({ p_token: SESION.token, p_code: "ABC234", p_alias: "Pipa" });
    expect($("#cn-err").textContent).toMatch(/ya lo usa otra persona/);
    expect(document.activeElement).toBe($("#cn"));
    expect($('[data-act="joinclass"]').disabled).toBe(false);
  });

  it("un fallo de conexión se avisa debajo del botón y se puede reintentar", async () => {
    respuestas.alu_join_class = () => new TypeError("Failed to fetch");
    act("joinclass");
    await flush();
    expect($("#join-err").textContent).toMatch(/No hay conexión/);
    expect($('[data-act="joinclass"]').disabled).toBe(false);
    expect(stored("cls")).toBeNull();
  });

  it("si ya está en una clase (desde otro dispositivo), lo dice debajo del botón", async () => {
    respuestas.alu_join_class = () => fallo("ya_en_clase");
    act("joinclass");
    await flush();
    expect($("#join-err").textContent).toMatch(/Ya estás en una clase/);
  });

  it("al unirse pasa al ranking y recuerda la clase con sus ajustes, sin guardar ningún secreto", async () => {
    respuestas.alu_join_class = () => ok([AULA]);
    respuestas.class_ranking = () => ok(FILAS);
    act("joinclass");
    await flush();
    expect(titulo()).toBe("Ranking");
    expect(stored("cls")).toEqual({
      ...CLASE,
      lists: [1, 2, 3, 4, 5, 6],
      diffs: ["easy", "normal", "hard"],
    });
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

  it("el inicio ya enseña el ranking de la clase y «Mi clase» lleva directo a él (sin ofrecer otro reto)", async () => {
    act("home");
    expect($('[data-act="class"]').textContent).toContain("Ranking de 1º A de ESO");
    expect($('[data-act="challenge"]')).toBeNull(); // en una clase no se crea otro reto
    act("class");
    await flush();
    expect(titulo()).toBe("Ranking");
    act("home");
  });
});

describe("enviar partidas", () => {
  it("al superar un nivel se envía con la sesión y se enseñan los puntos y el puesto", async () => {
    respuestas.alu_submit_run = () => ok([{ points: 340, stars: 3 }]);
    respuestas.class_ranking = () => ok(FILAS);
    act("play");
    act("level", '[data-i="0"]');
    const huecos = $$("td[data-slot]").length;
    solve();
    await flush();
    expect(llamadasA("alu_submit_run")).toHaveLength(1);
    expect(llamadasA("alu_submit_run")[0].body).toEqual({
      p_token: SESION.token,
      p_level: 0,
      p_difficulty: "normal",
      p_correct: huecos,
      p_mistakes: 0,
      p_misses: [], // en las clases de aula se mandan los verbos fallados (aquí, ninguno)
    });
    expect($("#rank-msg").textContent).toContain("+340 puntos");
    expect($("#rank-msg").textContent).toContain("nº 2");
  });

  it("en una clase de aula manda los verbos que se han fallado", async () => {
    act("next");
    makeMistake();
    makeMistake();
    solve();
    await flush();
    const run = llamadasA("alu_submit_run").at(-1).body;
    expect(run.p_mistakes).toBe(2);
    expect(run.p_misses).toHaveLength(2);
    expect(run.p_misses.every((v) => /^[a-z][a-z '-]{0,29}$/.test(v))).toBe(true);
  });

  it("si falla el envío, avisa sin bloquear el juego y permite reintentar", async () => {
    respuestas.alu_submit_run = () => new TypeError("Failed to fetch");
    act("next");
    solve();
    await flush();
    expect($("#rank-msg").textContent).toMatch(/No he podido enviar tu partida/);
    expect($('[data-act="next"]')).not.toBeNull(); // se puede seguir jugando
    respuestas.alu_submit_run = () => ok([{ points: 200, stars: 3 }]);
    act("resendrun");
    await flush();
    expect($("#rank-msg").textContent).toContain("+200 puntos");
    expect(llamadasA("alu_submit_run")).toHaveLength(4);
    expect(llamadasA("alu_submit_run")[3].body.p_level).toBe(2);
  });

  it("si el servidor ya no nos tiene en ninguna clase, se olvida y no ofrece reintentar", async () => {
    respuestas.alu_submit_run = () => fallo("sin_clase");
    act("next");
    solve();
    await flush();
    expect($("#rank-msg").textContent).toMatch(/No estás en ninguna clase/);
    expect($('[data-act="resendrun"]')).toBeNull();
    expect(stored("cls")).toBeNull();
    act("map");
    act("home");
  });

  it("si la sesión ha caducado, lo dice sin ofrecer reintentar y olvida la cuenta", async () => {
    // se vuelve a entrar en una clase para poder enviar
    respuestas.alu_join_class = () => ok([AULA]);
    act("class");
    type("#cc", "ABC234");
    act("joinclass");
    await flush();
    act("home");
    respuestas.alu_submit_run = () => fallo("sesion_no_valida");
    act("play");
    act("level", '[data-i="0"]');
    solve();
    await flush();
    expect($("#rank-msg").textContent).toMatch(/Tu sesión ha caducado/);
    expect($('[data-act="resendrun"]')).toBeNull();
    expect(stored("acc")).toBeNull();
    expect(stored("cls")).toBeNull();
    // se recupera la sesión para los siguientes tests
    localStorage.setItem("pipo2.acc", JSON.stringify(SESION));
    act("map");
    act("home");
  });
});

describe("salir de la clase", () => {
  beforeAll(async () => {
    respuestas.alu_join_class = () => ok([AULA]);
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
    expect(llamadasA("alu_leave_class")).toHaveLength(0);
  });

  it("sin conexión no borra nada y lo dice dentro de la ventana", async () => {
    respuestas.alu_leave_class = () => new TypeError("Failed to fetch");
    act("leaveask");
    act("leavedo");
    await flush();
    expect($("#leave-err").textContent).toMatch(/No hay conexión/);
    expect(stored("cls")).not.toBeNull();
  });

  it("al confirmar, sale en el servidor, olvida la clase y vuelve al inicio", async () => {
    respuestas.alu_leave_class = () => ok(true);
    act("leavedo");
    await flush();
    expect(llamadasA("alu_leave_class").at(-1).body).toEqual({ p_token: SESION.token });
    expect(stored("cls")).toBeNull();
    expect($("#modal .modal")).toBeNull();
    expect(titulo()).toBe("Pipo y los verbos irregulares");
    expect($('[data-act="class"]').textContent).toContain("Unirme a una clase");
  });
});

describe("Reta a tus amigos", () => {
  it("el inicio ofrece el reto a quien no está en una clase", () => {
    expect($('[data-act="challenge"]').textContent).toContain("Reta a tus amigos");
    act("challenge");
    expect(titulo()).toBe("Reta a tus amigos");
    expect($("#ra").value).toBe("Pipa");
  });

  it("el nombre y el apodo son obligatorios y se avisa en cada campo", async () => {
    respuestas.alu_create_challenge = () => fallo("nombre_invalido");
    act("challengemake");
    await flush();
    expect($("#rn-err").textContent).toMatch(/nombre de la clase/);
    expect(document.activeElement).toBe($("#rn"));
    type("#ra", "");
    act("challengemake");
    await flush();
    expect($("#ra-err").textContent).toMatch(/2 a 20 letras/);
    expect(document.activeElement).toBe($("#ra"));
    expect($('[data-act="challengemake"]').disabled).toBe(false);
    expect(stored("cls")).toBeNull();
  });

  it("un fallo de conexión se avisa debajo del botón y no se crea nada", async () => {
    respuestas.alu_create_challenge = () => new TypeError("Failed to fetch");
    type("#rn", "Los de 1º B");
    type("#ra", "Pipa");
    act("challengemake");
    await flush();
    expect($("#ch-err").textContent).toMatch(/No hay conexión/);
    expect(stored("cls")).toBeNull();
  });

  it("el límite de retos por cuenta se explica", async () => {
    respuestas.alu_create_challenge = () => fallo("demasiados_retos");
    act("challengemake");
    await flush();
    expect($("#ch-err").textContent).toMatch(/Borra alguno/);
  });

  it("al crearlo enseña el código, entra en él como dueño y no guarda ninguna clave", async () => {
    respuestas.alu_create_challenge = () => ok([{ code: "DEF567", class_name: "Los de 1º B" }]);
    act("challengemake");
    await flush();
    expect(llamadasA("alu_create_challenge").at(-1).body).toEqual({
      p_token: SESION.token,
      p_name: "Los de 1º B",
      p_alias: "Pipa",
    });
    expect(titulo()).toBe("¡Reto creado!");
    expect($(".codebig").textContent).toBe("DEF567");
    expect(stored("cls")).toEqual({
      code: "DEF567",
      name: "Los de 1º B",
      alias: "Pipa",
      kind: "reto",
      owner: true,
      lists: [1, 2, 3, 4, 5, 6],
      diffs: ["easy", "normal", "hard"],
    });
    expect(localStorage.getItem("pipo2.teach")).toBeNull();
  });

  it("copia el código y, si el navegador no deja, lo dice para escribirlo a mano", async () => {
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    act("challengecopy");
    await flush();
    expect(writeText).toHaveBeenCalledWith("DEF567");
    expect($("#ch-msg").textContent).toBe("Código copiado.");
    writeText.mockRejectedValue(new Error("denegado"));
    act("challengecopy");
    await flush();
    expect($("#ch-msg").textContent).toContain("DEF567");
    delete navigator.clipboard;
  });

  it("en un reto NO se mandan los verbos fallados", async () => {
    respuestas.alu_submit_run = () => ok([{ points: 100, stars: 2 }]);
    respuestas.class_ranking = () => ok(FILAS);
    act("play");
    act("level", '[data-i="0"]');
    makeMistake();
    solve();
    await flush();
    const run = llamadasA("alu_submit_run").at(-1).body;
    expect(run.p_mistakes).toBe(1);
    expect(run.p_misses).toBeNull();
    act("map");
    act("home");
  });

  it("desde el ranking se ve la opción de borrarlo para todos", async () => {
    respuestas.class_ranking = () => ok([{ alias: "Pipa", points: 0, levels: 0 }]);
    act("class");
    await flush();
    expect(titulo()).toBe("Ranking");
    expect($('[data-act="challengedelask"]')).not.toBeNull();
  });

  it("borrar el reto pide confirmación, avisa sin conexión y, al confirmar, borra todo y vuelve al inicio", async () => {
    act("challengedelask");
    expect($("#modal h2").textContent).toBe("¿Borrar el reto?");
    click($('#modal [data-act="modalclose"]'));
    expect(stored("cls")).not.toBeNull();
    respuestas.alu_delete_challenge = () => new TypeError("Failed to fetch");
    act("challengedelask");
    act("challengedel");
    await flush();
    expect($("#del-err").textContent).toMatch(/No hay conexión/);
    expect(stored("cls")).not.toBeNull();
    respuestas.alu_delete_challenge = () => ok(true);
    act("challengedel");
    await flush();
    expect(llamadasA("alu_delete_challenge").at(-1).body).toEqual({ p_token: SESION.token, p_code: "DEF567" });
    expect($("#modal .modal")).toBeNull();
    expect(stored("cls")).toBeNull();
    expect(titulo()).toBe("Pipo y los verbos irregulares");
  });
});

describe("la clase de la cuenta manda sobre la copia del navegador", () => {
  it("quien entra en la clase de otro y no es dueño no ve el botón de borrar el reto", async () => {
    respuestas.alu_join_class = () => ok([{ ...AULA, kind: "reto" }]);
    respuestas.class_ranking = () => ok(FILAS);
    act("class");
    type("#cc", "ABC234");
    act("joinclass");
    await flush();
    expect(titulo()).toBe("Ranking");
    expect($('[data-act="leaveask"]')).not.toBeNull();
    expect($('[data-act="challengedelask"]')).toBeNull();
  });
});
