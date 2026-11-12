// Estado compartido de la app.
// S: pantalla actual y datos de interfaz. R: partida en curso (null si no hay ninguna).

export const S = { screen: "load", meet: 0, vq: "", del: null, msg: "" };
export let R = null;
export function setR(v) {
  R = v;
}
