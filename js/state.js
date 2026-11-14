// Estado compartido de la app.
// S: pantalla actual y datos de interfaz. R: partida en curso (null si no hay ninguna).

// rank: ranking que se está viendo ({ code, name, mine, status, rows, msg }); null si no hay ninguno.
export const S = { screen: "load", meet: 0, vq: "", msg: "", rank: null };
export let R = null;
export function setR(v) {
  R = v;
}
