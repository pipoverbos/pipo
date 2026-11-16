// El progreso del alumno en su cuenta: qué se envía, cuándo y cómo se reemplaza o adopta lo del navegador.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { store } from "../../js/store.js";
import { online } from "../../js/online.js";
import { adoptar, apply, clearLocal, guardar, iniciarSincronizacion, snapshot, traer } from "../../js/progress.js";

const TOKEN = "0123456789abcdef0123456789abcdef";
const PROGRESO = {
  stars: { easy: [3, 2, 1, 0, 0], normal: [1, 0, 0, 0, 0] },
  sel: ["go", "be"],
  miss: { go: 3 },
  diff: "hard",
};

beforeEach(() => {
  vi.useFakeTimers();
  clearLocal();
  store.remove("acc");
  store.set("acc", { token: TOKEN, role: "alumno", username: "pipa.leo8" });
  iniciarSincronizacion();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("snapshot y apply", () => {
  it("sin nada guardado, el progreso está vacío", () => expect(snapshot()).toEqual({}));
  it("apply deja en el navegador exactamente el progreso de la cuenta, y snapshot lo devuelve igual", () => {
    apply(PROGRESO);
    expect(store.get("stars.easy", null)).toEqual([3, 2, 1, 0, 0]);
    expect(store.get("stars.hard", null)).toBeNull();
    expect(snapshot()).toEqual(PROGRESO);
  });
  it("apply REEMPLAZA: lo que había y no está en la cuenta desaparece", () => {
    store.set("stars.hard", [3, 3, 3, 3, 3]);
    store.set("miss", { put: 9 });
    apply({ diff: "easy" });
    expect(snapshot()).toEqual({ diff: "easy" });
  });
  it("apply no marca nada como pendiente", () => {
    apply(PROGRESO);
    vi.advanceTimersByTime(5000);
    expect(store.get("dirty", false)).toBe(false);
  });
  it("clearLocal quita el progreso y la clase, y deja lo propio del dispositivo", () => {
    apply(PROGRESO);
    store.set("cls", {
      code: "ABC234",
      name: "x",
      alias: "Pipa",
      kind: "reto",
      owner: false,
      lists: [1],
      diffs: ["easy"],
    });
    store.set("sound", false);
    store.set("name", "Pipa");
    clearLocal();
    expect(snapshot()).toEqual({});
    expect(store.get("cls", null)).toBeNull();
    expect(store.get("sound", true)).toBe(false);
    expect(store.get("name", "")).toBe("Pipa");
  });
});

describe("copia automática", () => {
  it("un cambio del progreso se marca como pendiente y se envía tras la espera, una sola vez aunque haya varios", async () => {
    const enviar = vi.spyOn(online, "saveProgress").mockResolvedValue(true);
    store.set("diff", "hard");
    store.set("sel", ["go"]);
    expect(store.get("dirty", false)).toBe(true);
    expect(enviar).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2100);
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(enviar).toHaveBeenCalledWith({ diff: "hard", sel: ["go"] });
    expect(store.get("dirty", false)).toBe(false);
  });
  it("lo que no es progreso (sonido, apodo) no dispara nada", async () => {
    const enviar = vi.spyOn(online, "saveProgress").mockResolvedValue(true);
    store.set("sound", false);
    store.set("name", "Pipa");
    await vi.advanceTimersByTimeAsync(5000);
    expect(enviar).not.toHaveBeenCalled();
    expect(store.get("dirty", false)).toBe(false);
  });
  it("sin sesión de alumno no se envía nada (ni se marca pendiente)", async () => {
    const enviar = vi.spyOn(online, "saveProgress").mockResolvedValue(true);
    store.set("acc", { token: TOKEN, role: "profe", username: "marta.lopez" });
    store.set("diff", "hard");
    store.remove("acc");
    store.set("diff", "easy");
    await vi.advanceTimersByTimeAsync(5000);
    expect(enviar).not.toHaveBeenCalled();
    expect(store.get("dirty", false)).toBe(false);
  });
  it("si falla el envío (sin conexión), sigue pendiente para la próxima vez", async () => {
    vi.spyOn(online, "saveProgress").mockRejectedValue(new Error("sin conexión"));
    store.set("diff", "hard");
    await vi.advanceTimersByTimeAsync(2100);
    expect(store.get("dirty", false)).toBe(true);
    expect(await guardar()).toBe(false);
  });
  it("guardar sin nada pendiente no llama al servidor", async () => {
    const enviar = vi.spyOn(online, "saveProgress").mockResolvedValue(true);
    expect(await guardar()).toBe(true);
    expect(enviar).not.toHaveBeenCalled();
  });
});

describe("traer", () => {
  it("sin cambios pendientes, el progreso de la cuenta sustituye al del navegador", async () => {
    vi.spyOn(online, "me").mockResolvedValue({
      role: "alumno",
      username: "pipa.leo8",
      progress: PROGRESO,
      mustChange: false,
    });
    store.set("stars.hard", [3, 3, 3, 3, 3]);
    store.set("dirty", false);
    await traer();
    expect(snapshot()).toEqual(PROGRESO);
  });
  it("con cambios pendientes NO se pisan: lo del navegador es más nuevo y se envía", async () => {
    const me = vi
      .spyOn(online, "me")
      .mockResolvedValue({ role: "alumno", username: "x", progress: {}, mustChange: false });
    const enviar = vi.spyOn(online, "saveProgress").mockResolvedValue(true);
    store.set("diff", "hard"); // queda pendiente
    await traer();
    expect(me).not.toHaveBeenCalled();
    expect(enviar).toHaveBeenCalledWith({ diff: "hard" });
    expect(store.get("diff", "normal")).toBe("hard");
  });
});

describe("adoptar", () => {
  it("al crear la cuenta, el progreso que ya había en el navegador pasa a ser de la cuenta", async () => {
    apply(PROGRESO);
    const enviar = vi.spyOn(online, "saveProgress").mockResolvedValue(true);
    await adoptar();
    expect(enviar).toHaveBeenCalledWith(PROGRESO);
    expect(store.get("dirty", false)).toBe(false);
  });
  it("sin progreso previo no envía nada", async () => {
    const enviar = vi.spyOn(online, "saveProgress").mockResolvedValue(true);
    await adoptar();
    expect(enviar).not.toHaveBeenCalled();
  });
  it("si no hay conexión, queda pendiente para enviarlo luego", async () => {
    apply(PROGRESO);
    vi.spyOn(online, "saveProgress").mockRejectedValue(new Error("sin conexión"));
    await adoptar();
    expect(store.get("dirty", false)).toBe(true);
  });
});
