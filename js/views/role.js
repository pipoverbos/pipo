// Primera pantalla de cada visita: ¿se entra como alumno o como profesor?
import { pipo } from "../ui/pipo.js";

export function roleView(v) {
  v.innerHTML =
    '<section class="role"><h1>Pipo y los verbos irregulares</h1>' +
    '<div class="talk stage">' +
    pipo("happy") +
    '<div class="bubble">¡Hola! Soy Pipo. ¿Cómo quieres entrar hoy?</div></div>' +
    '<h2 class="sec">Elige una opción</h2>' +
    '<button class="opt" data-act="student"><span><b>Soy alumno</b><small>Practica solo o juega con tu clase</small></span><span aria-hidden="true">›</span></button>' +
    '<button class="opt" data-act="profe"><span><b>Soy profesor</b><small>Crea clases y mira cómo van</small></span><span aria-hidden="true">›</span></button>' +
    '<p class="muted small center">Se pregunta cada vez que abres el juego. Con tu cuenta guardas tu progreso y juegas desde cualquier dispositivo.</p>' +
    "</section>";
}
