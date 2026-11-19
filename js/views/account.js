// Pantallas de las cuentas: entrar o crear cuenta, contraseña olvidada, código de recuperación y cambio de contraseña.
import { esc } from "../utils.js";
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

const mostrar =
  '<label class="pwchk"><input type="checkbox" data-act="showpw" id="showpw"> Mostrar la contraseña</label>';

export function authView(v) {
  const profe = S.authRole === "profe",
    nueva = S.authMode === "register",
    aviso = S.aviso;
  S.aviso = "";
  v.innerHTML =
    '<section class="cls">' +
    cabecera(profe ? "Soy profesor" : "Soy alumno", "authback") +
    (aviso ? '<p class="err" role="alert">' + esc(aviso) + "</p>" : "") +
    '<div class="seg" role="group" aria-label="Entrar o crear cuenta">' +
    ["login", "register"]
      .map(
        (m) =>
          '<button data-act="authmode" data-m="' +
          m +
          '" class="' +
          (S.authMode === m ? "on" : "") +
          '" aria-pressed="' +
          (S.authMode === m) +
          '">' +
          (m === "login" ? "Entrar" : "Crear cuenta") +
          "</button>"
      )
      .join("") +
    "</div>" +
    '<div class="card mt">' +
    '<label class="lbl" for="au">Usuario</label>' +
    '<input class="field" id="au" maxlength="30" autocomplete="username" autocapitalize="none" spellcheck="false" aria-describedby="au-help au-err">' +
    '<p class="muted small" id="au-help">' +
    (nueva
      ? profe
        ? "De 3 a 30 letras, números, puntos o guiones. Mejor sin tu nombre completo."
        : "De 3 a 30 letras, números, puntos o guiones. No es lo que verán tus compañeros: en cada clase elegirás un apodo."
      : "El que elegiste al crear tu cuenta.") +
    "</p>" +
    '<p class="err" id="au-err" role="alert"></p>' +
    '<label class="lbl" for="ap">Contraseña</label>' +
    '<input class="field" id="ap" type="password" maxlength="72" autocomplete="' +
    (nueva ? "new-password" : "current-password") +
    '" aria-describedby="ap-help ap-err">' +
    '<p class="muted small" id="ap-help">' +
    (nueva ? "Mínimo 8 caracteres." : "") +
    "</p>" +
    '<p class="err" id="ap-err" role="alert"></p>' +
    mostrar +
    "</div>" +
    '<div class="row center mt"><button class="btn go big" data-act="authsubmit">' +
    (nueva ? "Crear cuenta" : "Entrar") +
    "</button></div>" +
    '<p class="err center" id="auth-err" role="alert"></p>' +
    (nueva
      ? '<div class="card note"><b>Sin correo.</b> No te pedimos el email. Al crear la cuenta te daremos un <b>código de recuperación</b>: guárdalo, es la única forma de recuperar la contraseña' +
        (profe ? "." : " (o pídele a tu profe que te ponga una nueva).") +
        "</div>"
      : '<div class="teachbox"><button class="linkbtn" data-act="forgot">He olvidado mi contraseña</button></div>') +
    "</section>";
}

export function forgotView(v) {
  v.innerHTML =
    '<section class="cls">' +
    cabecera("Contraseña olvidada", "authback") +
    '<div class="talk stage">' +
    pipo("think") +
    '<div class="bubble">Usa el código de recuperación que te dimos al crear la cuenta.</div></div>' +
    '<div class="card mt">' +
    '<label class="lbl" for="fu">Usuario</label>' +
    '<input class="field" id="fu" maxlength="30" autocomplete="username" autocapitalize="none" spellcheck="false" aria-describedby="fu-err">' +
    '<p class="err" id="fu-err" role="alert"></p>' +
    '<label class="lbl" for="fc">Código de recuperación</label>' +
    '<input class="field" id="fc" maxlength="60" autocomplete="off" autocapitalize="none" spellcheck="false" aria-describedby="fc-help fc-err">' +
    '<p class="muted small" id="fc-help">Vale con espacios o guiones, y en mayúsculas o minúsculas.</p>' +
    '<p class="err" id="fc-err" role="alert"></p>' +
    '<label class="lbl" for="fn">Contraseña nueva</label>' +
    '<input class="field" id="fn" type="password" maxlength="72" autocomplete="new-password" aria-describedby="fn-help fn-err">' +
    '<p class="muted small" id="fn-help">Mínimo 8 caracteres.</p>' +
    '<p class="err" id="fn-err" role="alert"></p>' +
    mostrar +
    "</div>" +
    '<div class="row center mt"><button class="btn go big" data-act="forgotsubmit">Cambiar contraseña</button></div>' +
    '<p class="err center" id="forgot-err" role="alert"></p>' +
    '<div class="card note">Al cambiarla te daremos un <b>código nuevo</b> (el anterior deja de valer) y se cerrarán las sesiones abiertas en otros dispositivos.</div>' +
    "</section>";
}

/** El código en grupos de 4, en dos líneas de cinco grupos, para poder leerlo y copiarlo bien. */
const agrupar = (c) =>
  c
    .toUpperCase()
    .match(/.{1,4}/g)
    .join(" ")
    .replace(/^((?:\S+ ){4}\S+) /, "$1\n");

export function recoveryView(v) {
  const r = S.rec;
  if (!r) {
    v.innerHTML = '<section class="cls">' + cabecera("Código de recuperación", "authback") + "</section>";
    return;
  }
  const a = online.account();
  v.innerHTML =
    '<section class="cls">' +
    '<div class="top"><h1>Cuenta lista</h1></div>' +
    "<p>Bienvenido, <b>" +
    esc(a ? a.username : "") +
    "</b>. Antes de seguir, guarda esto:</p>" +
    '<div class="card mt center"><p class="muted">Tu código de recuperación</p>' +
    '<p class="reccode" aria-label="' +
    esc(agrupar(r.code).replace(/\s/g, "").split("").join(" ")) +
    '">' +
    esc(agrupar(r.code)) +
    '</p><div class="row center"><button class="btn small" data-act="reccopy">Copiar código</button></div>' +
    '<p class="muted small" id="rec-msg" role="status"></p></div>' +
    '<div class="card note warn"><b>Solo se muestra una vez.</b> No podemos mandártelo otra vez. Si olvidas la contraseña y no tienes este código, perderás el acceso a tu cuenta. Guárdalo en un gestor de contraseñas o apúntalo en papel.</div>' +
    '<label class="pwchk mt"><input type="checkbox" data-act="recok" id="recok"> Ya lo he guardado en un lugar seguro.</label>' +
    '<div class="row center mt"><button class="btn go big" data-act="reccontinue" disabled>Continuar</button></div>' +
    "</section>";
}

export function changePassView(v) {
  const desdeCuenta = S.cpVolver;
  v.innerHTML =
    '<section class="cls">' +
    (desdeCuenta
      ? cabecera("Cambiar contraseña", "myaccount")
      : '<div class="top"><h1>Elige tu contraseña</h1></div>') +
    (desdeCuenta
      ? "<p>Escribe tu contraseña de ahora y la nueva.</p>"
      : "<p>Entraste con una contraseña temporal. Escribe una nueva que solo sepas tú.</p>") +
    '<div class="card mt">' +
    '<label class="lbl" for="cp-old">' +
    (desdeCuenta ? "Contraseña de ahora" : "Contraseña temporal") +
    "</label>" +
    '<input class="field" id="cp-old" type="password" maxlength="72" autocomplete="current-password" aria-describedby="cp-old-err">' +
    '<p class="err" id="cp-old-err" role="alert"></p>' +
    '<label class="lbl" for="cp-new">Contraseña nueva</label>' +
    '<input class="field" id="cp-new" type="password" maxlength="72" autocomplete="new-password" aria-describedby="cp-new-help cp-new-err">' +
    '<p class="muted small" id="cp-new-help">Mínimo 8 caracteres.</p>' +
    '<p class="err" id="cp-new-err" role="alert"></p>' +
    mostrar +
    "</div>" +
    '<div class="row center mt"><button class="btn go big" data-act="changepasssubmit">Guardar contraseña</button></div>' +
    '<p class="err center" id="cp-err" role="alert"></p>' +
    "</section>";
}

/** Mi cuenta: usuario, cambiar la contraseña, cerrar sesión y borrar la cuenta (con todos sus datos). */
export function myAccountView(v) {
  const a = online.account();
  if (!a) return;
  v.innerHTML =
    '<section class="cls">' +
    cabecera("Mi cuenta", "accountback") +
    '<div class="card mt"><p class="muted">Usuario</p><p><b>' +
    esc(a.username) +
    '</b></p><p class="muted small">' +
    (a.role === "profe" ? "Cuenta de profesor" : "Cuenta de alumno") +
    ". Solo tú lo ves: en las clases se usa tu apodo.</p></div>" +
    '<div class="row center mt"><button class="btn" data-act="changepassopen">Cambiar contraseña</button></div>' +
    '<div class="row center mt"><button class="btn" data-act="logout">Cerrar sesión</button></div>' +
    '<div class="teachbox"><button class="linkbtn" data-act="accountdelask">Borrar mi cuenta y todos mis datos</button></div>' +
    "</section>";
}
