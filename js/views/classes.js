// Pantallas de las clases: unirse, ranking y retos entre amigos.
import { esc } from "../utils.js";
import { store } from "../store.js";
import { S } from "../state.js";
import { online } from "../online.js";
import { pipo } from "../ui/pipo.js";
import { ICON } from "../ui/icons.js";

const cabecera = (titulo, atras) =>
  '<div class="top"><button class="iconbtn" data-act="' +
  atras +
  '" aria-label="Volver">' +
  ICON.back +
  "</button><h1>" +
  titulo +
  "</h1></div>";

export function joinView(v) {
  v.innerHTML =
    '<section class="cls">' +
    cabecera("Unirme a una clase", "home") +
    '<div class="talk stage">' +
    pipo("think") +
    '<div class="bubble">Pídele a tu profe el código de la clase. ¡Son 6 letras o números!</div></div>' +
    '<div class="card mt">' +
    '<label class="lbl" for="cc">Código de la clase</label>' +
    '<input class="field code" id="cc" maxlength="9" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-describedby="cc-help cc-err">' +
    '<p class="muted small" id="cc-help">Da igual si lo escribes en mayúsculas o minúsculas.</p>' +
    '<p class="err" id="cc-err" role="alert"></p>' +
    '<label class="lbl" for="cn">Tu apodo en la clase</label>' +
    '<input class="field" id="cn" maxlength="20" autocomplete="off" aria-describedby="cn-help cn-err" value="' +
    esc(store.get("name", "")) +
    '">' +
    '<p class="muted small" id="cn-help">Lo verán tus compañeros en el ranking. Usa un apodo, no tu nombre real.</p>' +
    '<p class="err" id="cn-err" role="alert"></p></div>' +
    '<div class="row center mt"><button class="btn go big" data-act="joinclass">Unirme a la clase</button></div>' +
    '<p class="err center" id="join-err" role="alert"></p>' +
    '<p class="muted small center">Solo guardamos tu apodo, el código de la clase y tus puntos. Nada más.</p>' +
    "</section>";
}

export function rankView(v) {
  const r = S.rank;
  if (!r) return;
  const yo = (online.session() || {}).alias,
    dueno = online.challengeOwner();
  const filas = r.rows
    .map(function (f, i) {
      const soy = r.mine && yo && f.alias.toLowerCase() === yo.toLowerCase();
      return (
        '<li class="' +
        (soy ? "me" : "") +
        '"><span class="pos" aria-hidden="true">' +
        (i + 1) +
        '</span><span class="nm"><span class="sr-only">Puesto ' +
        (i + 1) +
        ": </span>" +
        esc(f.alias) +
        (soy ? " (tú)" : "") +
        "<small>" +
        f.levels +
        (f.levels === 1 ? " nivel" : " niveles") +
        '</small></span><span class="pts">' +
        f.points +
        '<span class="sr-only"> puntos</span></span></li>'
      );
    })
    .join("");
  v.innerHTML =
    '<section class="cls">' +
    cabecera("Ranking", "home") +
    '<div class="card rankhead"><div><b>' +
    esc(r.name) +
    '</b><p class="muted small" style="margin:0">Código ' +
    esc(r.code) +
    (r.status === "ok" ? " · " + r.rows.length + (r.rows.length === 1 ? " jugador" : " jugadores") : "") +
    '</p></div><button class="btn small" data-act="rankreload">Actualizar</button></div>' +
    (r.status === "loading" ? '<p class="muted mt" role="status">Cargando el ranking…</p>' : "") +
    (r.status === "error" ? '<p class="err mt" role="alert">' + esc(r.msg) + "</p>" : "") +
    (r.status === "ok" && !r.rows.length
      ? '<p class="mt">Todavía no hay partidas en esta clase. ¡Sé la primera persona!</p>'
      : "") +
    (filas ? '<ol class="rank" aria-label="Clasificación de la clase">' + filas + "</ol>" : "") +
    '<p class="muted small center">Cuenta la mejor partida de cada nivel y dificultad. Repetir un nivel solo sube tu marca si lo haces mejor.</p>' +
    (r.mine
      ? '<div class="teachbox"><button class="linkbtn" data-act="leaveask">Salir de la clase y borrar mis datos</button>' +
        (dueno && dueno.code === r.code
          ? '<button class="linkbtn" data-act="challengedelask">Borrar este reto para todos</button>'
          : "") +
        "</div>"
      : "") +
    "</section>";
}

export function challengeView(v) {
  v.innerHTML =
    '<section class="cls">' +
    cabecera("Reta a tus amigos", "home") +
    '<p class="mt">Crea un ranking solo para vosotros. Te damos un código y se lo pasas a quien quieras (hasta 30 personas).</p>' +
    '<div class="card mt">' +
    '<label class="lbl" for="rn">Nombre del reto</label>' +
    '<input class="field" id="rn" maxlength="40" autocomplete="off" aria-describedby="rn-help rn-err">' +
    '<p class="muted small" id="rn-help">Por ejemplo, «Los cracks del recreo». No pongas nombres reales.</p>' +
    '<p class="err" id="rn-err" role="alert"></p>' +
    '<label class="lbl" for="ra">Tu apodo</label>' +
    '<input class="field" id="ra" maxlength="20" autocomplete="off" aria-describedby="ra-help ra-err" value="' +
    esc(store.get("name", "")) +
    '">' +
    '<p class="muted small" id="ra-help">Así te verán tus amigos. Usa un apodo, no tu nombre real.</p>' +
    '<p class="err" id="ra-err" role="alert"></p></div>' +
    '<div class="row center mt"><button class="btn go big" data-act="challengemake">Crear el reto</button></div>' +
    '<p class="err center" id="ch-err" role="alert"></p>' +
    '<div class="card note"><b>Qué guardamos:</b> tu apodo y tus puntos. Nada más; en un reto no se guardan tus fallos. ' +
    "El reto se borra solo si pasan 3 meses sin que nadie juegue, y quien lo crea puede borrarlo cuando quiera.</div>" +
    "</section>";
}

export function challengeDoneView(v) {
  const s = online.session(),
    t = online.challengeOwner();
  if (!s || !t) {
    v.innerHTML = '<section class="cls">' + cabecera("Reta a tus amigos", "home") + "</section>";
    return;
  }
  v.innerHTML =
    '<section class="cls">' +
    cabecera("¡Reto creado!", "home") +
    "<p>«<b>" +
    esc(s.name) +
    "</b>» está listo y ya estás dentro como <b>" +
    esc(s.alias) +
    '</b>.</p><div class="card mt center"><p class="muted">Pasa este código a tus amigos</p>' +
    '<p class="codebig" aria-label="' +
    esc(t.code.split("").join(" ")) +
    '">' +
    esc(t.code) +
    '</p><div class="row center"><button class="btn small" data-act="challengecopy">Copiar código</button>' +
    (navigator.share ? '<button class="btn small" data-act="challengeshare">Compartir</button>' : "") +
    '</div><p class="muted small" id="ch-msg" role="status"></p>' +
    '<p class="muted small">Ellos abren el juego, eligen «Soy alumno», luego «Unirme a una clase» y escriben el código.</p></div>' +
    '<div class="row center mt"><button class="btn go big" data-act="class">Ver el ranking</button></div>' +
    '<div class="row center mt"><button class="btn" data-act="play">Jugar ahora</button></div>' +
    '<div class="teachbox"><button class="linkbtn" data-act="challengedelask">Borrar este reto</button></div>' +
    "</section>";
}
