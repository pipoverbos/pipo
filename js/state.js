// Estado compartido de la app.
// S: pantalla actual y datos de interfaz. R: partida en curso (null si no hay ninguna).

// rank: ranking que se está viendo ({ code, name, mine, status, rows, msg }); null si no hay ninguno.
// role: cómo ha entrado quien juega en esta visita ("alumno", "profe" o null mientras no ha elegido).
// authRole y authMode: la pantalla de entrar o crear cuenta (rol que se pide y pestaña). rec: código de recuperación
// que se enseña una sola vez ({ code, next }). aviso: texto para la pantalla de entrar (p. ej. sesión caducada).
// vpend: verbos elegidos pendientes de confirmar (cambiarlos reinicia el mapa de niveles).
// cpVolver: la pantalla de cambiar contraseña se abrió desde «Mi cuenta» y vuelve allí.
export const S = {
  screen: "load",
  meet: 0,
  vq: "",
  msg: "",
  rank: null,
  role: null,
  authRole: null,
  authMode: "login",
  rec: null,
};
export let R = null;
export function setR(v) {
  R = v;
}
