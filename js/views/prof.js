// Pantallas del panel del profesor: sus clases, una clase (alumnos, ranking y ajustes) y el informe de un alumno.
import { esc } from "../utils.js";
import { S } from "../state.js";
import { online } from "../online.js";
import { BASE } from "../data/base-verbs.js";
import { DIFFS, LISTS, LV } from "../data/config.js";
import { ICON } from "../ui/icons.js";
import { resumirAlumnos } from "../prof.js";
import { rankList } from "./classes.js";

const cabecera = (titulo, atras) =>
  '<div class="top"><button class="iconbtn" data-act="' +
  atras +
  '" aria-label="Volver">' +
  ICON.back +
  "</button><h1>" +
  titulo +
  "</h1></div>";

const formato = (opciones) => (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("es-ES", opciones);
};
const fechaCorta = formato({ day: "numeric", month: "short" });
const fechaLarga = formato({ day: "numeric", month: "long", year: "numeric" });

const plural = (n, uno, varios) => n + " " + (n === 1 ? uno : varios);

/** Estrellas como texto (★★☆) con su versión para lectores de pantalla. */
const estrellas = (n) =>
  '<span aria-hidden="true">' +
  "★".repeat(n) +
  "☆".repeat(3 - n) +
  '</span><span class="sr-only">' +
  plural(n, "estrella", "estrellas") +
  " de 3</span>";

// ---- mis clases ----
export function profView(v) {
  const a = online.account();
  const p = S.prof || { status: "loading", classes: [], msg: "" };
  const filas = p.classes
    .map(
      (c) =>
        '<button class="opt" data-act="profopen" data-code="' +
        esc(c.code) +
        '"><span><b>' +
        esc(c.name) +
        '<span class="code">' +
        esc(c.code) +
        "</span></b><small>" +
        (c.players ? plural(c.players, "alumno", "alumnos") : "Sin alumnos todavía") +
        (c.lastRun ? " · última partida el " + fechaCorta(c.lastRun) : "") +
        '</small></span><span aria-hidden="true">›</span></button>'
    )
    .join("");
  v.innerHTML =
    '<section class="cls">' +
    '<div class="top"><h1>Mis clases</h1></div>' +
    '<p class="muted">Sesión de <b>' +
    esc(a ? a.username : "") +
    "</b>.</p>" +
    (p.status === "loading" && !p.classes.length ? '<p class="muted mt" role="status">Cargando tus clases…</p>' : "") +
    (p.status === "error"
      ? '<p class="err mt" role="alert">' +
        esc(p.msg) +
        ' <button class="btn small" data-act="proflist">Reintentar</button></p>'
      : "") +
    (p.status === "ok" && !p.classes.length
      ? '<div class="card mt note">Todavía no tienes clases. Crea la primera: tus alumnos se unen con su código.</div>'
      : "") +
    filas +
    '<div class="row center mt"><button class="btn go big" data-act="profnew">+ Crear una clase</button></div>' +
    '<p class="muted small center">Puedes tener hasta 20 clases.</p>' +
    '<div class="row center mt"><button class="btn" data-act="myaccount">Mi cuenta</button></div>' +
    '<div class="teachbox"><button class="btn" data-act="logout">Cerrar sesión</button></div>' +
    "</section>";
}

export function profNewView(v) {
  v.innerHTML =
    '<section class="cls">' +
    cabecera("Crear una clase", "profback") +
    '<p class="mt">Tus alumnos se unirán con un código de 6 letras o números que te daremos.</p>' +
    '<div class="card mt"><label class="lbl" for="pn">Nombre de la clase</label>' +
    '<input class="field" id="pn" maxlength="40" autocomplete="off" aria-describedby="pn-help pn-err">' +
    '<p class="muted small" id="pn-help">Por ejemplo, «1º A de ESO». No pongas nombres de alumnos.</p>' +
    '<p class="err" id="pn-err" role="alert"></p></div>' +
    '<div class="row center mt"><button class="btn go big" data-act="profnewsubmit">Crear la clase</button></div>' +
    "</section>";
}

// ---- una clase ----
const cargando = (c, texto) =>
  (c.status === "loading" ? '<p class="muted mt" role="status">' + texto + "</p>" : "") +
  (c.status === "error"
    ? '<p class="err mt" role="alert">' +
      esc(c.msg) +
      ' <button class="btn small" data-act="profreload">Reintentar</button></p>'
    : "");

function pestanaAlumnos(pc) {
  const alumnos = resumirAlumnos(pc.prog.rows, pc.prog.misses);
  const tarjetas = alumnos
    .map((a) => {
      const top = a.fallos
        .slice(0, 3)
        .map((f) => '<span class="fail"><b>' + esc(f.verb) + "</b> · " + f.times + "</span>")
        .join("");
      return (
        '<div class="card student"><div class="between"><b>' +
        esc(a.alias) +
        '</b><span class="muted small">' +
        (a.jugado ? plural(a.puntos, "punto", "puntos") : "Sin partidas") +
        "</span></div>" +
        (a.jugado
          ? '<p class="muted small">' +
            plural(a.partidas, "partida", "partidas") +
            " · " +
            plural(a.niveles.length, "nivel jugado", "niveles jugados") +
            (a.ultima ? " · última el " + fechaCorta(a.ultima) : "") +
            "</p>"
          : "") +
        (top ? '<p class="small">Falla:</p><div>' + top + "</div>" : "") +
        '<div class="row mt"><button class="btn small" data-act="profstudent" data-alias="' +
        esc(a.alias) +
        '">Ver informe</button></div></div>'
      );
    })
    .join("");
  return (
    cargando(pc.prog, "Cargando a tus alumnos…") +
    (pc.prog.status === "ok" && !alumnos.length
      ? '<div class="card mt note">Todavía no se ha unido nadie. Pásales el código <b>' +
        esc(pc.code) +
        "</b>: lo escriben en «Unirme a una clase».</div>"
      : "") +
    tarjetas +
    '<p class="muted small center">Los verbos fallados solo se guardan en las partidas de esta clase.</p>'
  );
}

function pestanaRanking(pc) {
  return (
    cargando(pc.rank, "Cargando el ranking…") +
    (pc.rank.status === "ok" && !pc.rank.rows.length
      ? '<p class="mt">Todavía no hay partidas en esta clase.</p>'
      : "") +
    rankList(pc.rank.rows, null) +
    '<p class="muted small center">Cuenta la mejor partida de cada nivel y dificultad.</p>'
  );
}

const casilla = (clave, valor, texto, marcada) =>
  '<label class="pwchk"><input type="checkbox" data-act="cfgtoggle" data-k="' +
  clave +
  '" data-v="' +
  valor +
  '"' +
  (marcada ? " checked" : "") +
  "> " +
  texto +
  "</label>";

function pestanaAjustes(pc) {
  const listas = LISTS.map((l, i) =>
    casilla("lists", i + 1, esc(l.name) + " (" + esc(l.from) + "–" + esc(l.to) + ")", pc.cfg.lists.includes(i + 1))
  ).join("");
  const dificultades = ["easy", "normal", "hard"]
    .map((d) => casilla("diffs", d, esc(DIFFS[d]), pc.cfg.diffs.includes(d)))
    .join("");
  return (
    '<div class="card mt"><fieldset class="cfg"><legend class="lbl">Listas de verbos que pueden jugar</legend>' +
    listas +
    '</fieldset><fieldset class="cfg"><legend class="lbl">Dificultades que pueden jugar</legend>' +
    dificultades +
    "</fieldset>" +
    '<p class="muted small">Tus alumnos solo verán estas listas y dificultades. Se aplica la próxima vez que abran el juego.</p></div>' +
    '<div class="row center mt"><button class="btn go big" data-act="cfgsave">Guardar cambios</button></div>' +
    '<p class="muted small center" id="cfg-msg" role="status"></p>' +
    '<div class="teachbox"><button class="linkbtn" data-act="profdelask">Borrar la clase entera</button></div>'
  );
}

export function profClassView(v) {
  const pc = S.pc;
  if (!pc) return;
  const tabs = [
    ["alumnos", "Alumnos"],
    ["ranking", "Ranking"],
    ["ajustes", "Ajustes"],
  ]
    .map(
      ([t, nombre]) =>
        '<button data-act="proftab" data-t="' +
        t +
        '" class="' +
        (pc.tab === t ? "on" : "") +
        '" aria-pressed="' +
        (pc.tab === t) +
        '">' +
        nombre +
        "</button>"
    )
    .join("");
  v.innerHTML =
    '<section class="cls">' +
    cabecera(esc(pc.name), "profback") +
    '<div class="card center"><p class="muted small">Código para tus alumnos</p>' +
    '<p class="codebig" aria-label="' +
    esc(pc.code.split("").join(" ")) +
    '">' +
    esc(pc.code) +
    '</p><div class="row center"><button class="btn small" data-act="profcopy">Copiar código</button></div>' +
    '<p class="muted small" id="pc-msg" role="status"></p></div>' +
    '<div class="seg mt" role="group" aria-label="Secciones de la clase">' +
    tabs +
    "</div>" +
    (pc.tab === "alumnos" ? pestanaAlumnos(pc) : pc.tab === "ranking" ? pestanaRanking(pc) : pestanaAjustes(pc)) +
    "</section>";
}

// ---- informe de un alumno (se imprime o se guarda como PDF) ----
const verboInfo = (inf) => BASE.find((b) => b[0] === inf);

export function profStudentView(v) {
  const pc = S.pc;
  const a =
    pc &&
    resumirAlumnos(pc.prog.rows, pc.prog.misses).find((x) => x.alias.toLowerCase() === (S.ps || "").toLowerCase());
  if (!pc || !a) {
    v.innerHTML =
      '<section class="cls">' +
      cabecera("Informe de alumno", "profstudentback") +
      '<p class="mt">No encuentro a ese alumno en la clase. Puede que ya no esté.</p></section>';
    return;
  }
  const niveles = a.niveles
    .map(
      (n) =>
        "<tr><td>" +
        (n.level + 1) +
        ". " +
        esc(LV[n.level].n) +
        "</td><td>" +
        esc(DIFFS[n.difficulty]) +
        "</td><td>" +
        n.plays +
        "</td><td>" +
        estrellas(n.stars) +
        "</td><td>" +
        n.points +
        "</td><td>" +
        (n.last ? fechaCorta(n.last) : "") +
        "</td></tr>"
    )
    .join("");
  const fallos = a.fallos
    .slice(0, 15)
    .map((f) => {
      const b = verboInfo(f.verb);
      return (
        "<tr><td><b>" +
        esc(f.verb) +
        "</b>" +
        (b ? " · " + esc(b[1]) + " · " + esc(b[2]) : "") +
        "</td><td>" +
        (b ? esc(b[3]) : "") +
        "</td><td>" +
        f.times +
        "</td></tr>"
      );
    })
    .join("");
  const superados = ["easy", "normal", "hard"]
    .map((d) => {
      const n = a.niveles.filter((x) => x.difficulty === d).length;
      return n ? esc(DIFFS[d]) + ": " + n + " de 5" : "";
    })
    .filter(Boolean)
    .join(" · ");
  v.innerHTML =
    '<section class="cls report">' +
    '<div class="noprint">' +
    cabecera("Informe de alumno", "profstudentback") +
    "</div>" +
    '<h1 class="onlyprint">Informe de alumno</h1>' +
    '<div class="card"><h2 class="repname">' +
    esc(a.alias) +
    '</h2><p class="muted small">Clase ' +
    esc(pc.name) +
    " (" +
    esc(pc.code) +
    ") · Informe del " +
    fechaLarga(new Date().toISOString()) +
    "</p>" +
    '<ul class="repsum"><li><b>' +
    plural(a.partidas, "partida jugada", "partidas jugadas") +
    "</b></li><li><b>" +
    plural(a.puntos, "punto", "puntos") +
    "</b> (mejor partida de cada nivel y dificultad)</li>" +
    (superados ? "<li>Niveles jugados — " + superados + "</li>" : "") +
    (a.ultima ? "<li>Última partida: " + fechaLarga(a.ultima) + "</li>" : "") +
    "</ul></div>" +
    '<h2 class="sec">Niveles y dificultades jugados</h2>' +
    (niveles
      ? '<table class="tbl"><caption class="sr-only">Niveles y dificultades jugados por ' +
        esc(a.alias) +
        '</caption><thead><tr><th scope="col">Nivel</th><th scope="col">Dificultad</th><th scope="col">Intentos</th><th scope="col">Mejor nota</th><th scope="col">Puntos</th><th scope="col">Última vez</th></tr></thead><tbody>' +
        niveles +
        "</tbody></table>"
      : "<p>Todavía no ha jugado ningún nivel.</p>") +
    '<h2 class="sec">Verbos que más falla</h2>' +
    (fallos
      ? '<table class="tbl"><caption class="sr-only">Verbos que más falla ' +
        esc(a.alias) +
        '</caption><thead><tr><th scope="col">Verbo</th><th scope="col">Significado</th><th scope="col">Veces</th></tr></thead><tbody>' +
        fallos +
        "</tbody></table>"
      : "<p>No hay verbos fallados registrados.</p>") +
    '<p class="muted small">Datos de las partidas de esta clase. Los puntos y las notas son los del servidor.</p>' +
    '<div class="noprint"><div class="row center mt"><button class="btn go big" data-act="studentpdf">Descargar PDF</button></div>' +
    '<p class="muted small center">Se abre el diálogo de impresión: elige «Guardar como PDF» como destino.</p>' +
    '<div class="teachbox"><div class="row center"><button class="btn small" data-act="studentresetask">Restablecer contraseña</button>' +
    '<button class="linkbtn" data-act="studentremoveask">Quitar de la clase</button></div></div></div>' +
    "</section>";
}
