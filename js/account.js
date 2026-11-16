// Lógica de las cuentas: entrar, crear cuenta, recuperar la contraseña y cerrar sesión.
// Las pantallas están en views/account.js. Todo lo que habla con el servidor pasa por online.js.
import { $, esc, validAlias } from "./utils.js";
import { store } from "./store.js";
import { S } from "./state.js";
import { online } from "./online.js";
import { go, render } from "./router.js";
import { modal, closeModal } from "./ui/modal.js";
import { apply, adoptar, traer, guardar, clearLocal } from "./progress.js";

const setErr = (id, msg, field) => {
  const e = $("#" + id);
  if (e) e.textContent = msg;
  if (field) {
    if (msg) field.setAttribute("aria-invalid", "true");
    else field.removeAttribute("aria-invalid");
  }
};

/** A dónde va cada rol cuando ya tiene sesión. El alumnado pasa antes por la presentación si aún no tiene apodo. */
function destino(role) {
  if (role === "profe") return "prof";
  return store.get("seen", false) && validAlias(store.get("name", "")) ? "home" : "meet";
}

/** «Soy alumno» o «Soy profesor»: con sesión de ese rol se entra; si no, se pide entrar o crear cuenta. */
export function entrarComo(role) {
  S.role = role;
  S.meet = 0;
  const a = online.account();
  if (a && a.role === role) {
    go(destino(role));
    if (role === "alumno") sincronizar();
    return;
  }
  S.authRole = role;
  S.authMode = store.get("hadacc", false) ? "login" : "register";
  go("auth");
}

/** Con la sesión ya abierta: trae el progreso y la clase de la cuenta sin hacer esperar a nadie. */
async function sincronizar() {
  try {
    await traer();
    await online.refreshClass();
  } catch (e) {
    if (e.code === "sesion_no_valida") return void sesionCaducada(e);
    /* sin conexión: se sigue con lo que hay en este dispositivo */
  }
  if (S.screen === "home") render();
}

/** Tras entrar: el progreso y la clase pasan a ser los de la cuenta. Un fallo no impide jugar. */
async function sincronizarTrasEntrar() {
  try {
    const me = await online.me();
    apply(me.progress);
    await online.refreshClass();
  } catch {
    /* sin conexión justo ahora: se sincronizará al abrir el inicio */
  }
}

/**
 * Si el servidor dice que la sesión ya no vale, se limpia este navegador y se pide entrar otra vez.
 * Devuelve true si era ese caso (para que quien llama no siga mostrando nada más).
 */
export function sesionCaducada(e) {
  if (!e || e.code !== "sesion_no_valida") return false;
  clearLocal();
  S.rank = null;
  S.authRole = S.role || "alumno";
  S.authMode = "login";
  S.aviso = e.message;
  go("auth");
  return true;
}

export function authMode(mode) {
  S.authMode = mode;
  go("auth");
}

/** Entrar o crear cuenta, según la pestaña elegida. */
export async function authSubmit() {
  const user = $("#au"),
    pass = $("#ap"),
    btn = $('[data-act="authsubmit"]');
  setErr("au-err", "", user);
  setErr("ap-err", "", pass);
  setErr("auth-err", "");
  btn.disabled = true;
  try {
    if (S.authMode === "register") {
      const r = await online.register(S.authRole, user.value, pass.value);
      if (S.authRole === "alumno") await adoptar();
      S.rec = { code: r.recoveryCode, next: destino(S.authRole) };
      return go("recovery");
    }
    const r = await online.login(user.value, pass.value);
    if (r.role !== S.authRole) {
      await online.logout();
      if (S.screen !== "auth") return;
      btn.disabled = false;
      return setErr(
        "auth-err",
        r.role === "profe"
          ? "Esa cuenta es de profesor. Vuelve atrás y elige «Soy profesor»."
          : "Esa cuenta es de alumno. Vuelve atrás y elige «Soy alumno»."
      );
    }
    if (r.role === "alumno") await sincronizarTrasEntrar();
    go(r.mustChange ? "changepass" : destino(r.role));
  } catch (e) {
    if (S.screen !== "auth") return;
    btn.disabled = false;
    if (e.code === "usuario_invalido" || e.code === "usuario_en_uso") {
      setErr("au-err", e.message, user);
      user.focus();
    } else if (e.code === "contrasena_invalida") {
      setErr("ap-err", e.message, pass);
      pass.focus();
    } else setErr("auth-err", e.message);
  }
}

export function showPassword(on) {
  for (const id of ["ap", "fn", "cp-old", "cp-new"]) {
    const f = $("#" + id);
    if (f) f.type = on ? "text" : "password";
  }
}

/** Contraseña olvidada: usuario, código de recuperación y contraseña nueva. */
export async function forgotSubmit() {
  const user = $("#fu"),
    code = $("#fc"),
    pass = $("#fn"),
    btn = $('[data-act="forgotsubmit"]');
  setErr("fu-err", "", user);
  setErr("fc-err", "", code);
  setErr("fn-err", "", pass);
  setErr("forgot-err", "");
  btn.disabled = true;
  try {
    const r = await online.resetPassword(user.value, code.value, pass.value);
    S.authRole = r.role;
    S.rec = { code: r.recoveryCode, next: destino(r.role) };
    go("recovery");
  } catch (e) {
    if (S.screen !== "forgot") return;
    btn.disabled = false;
    if (e.code === "usuario_invalido") {
      setErr("fu-err", e.message, user);
      user.focus();
    } else if (e.code === "contrasena_invalida") {
      setErr("fn-err", e.message, pass);
      pass.focus();
    } else if (e.code === "credenciales_invalidas") {
      setErr("forgot-err", "El usuario o el código de recuperación no son correctos.");
    } else setErr("forgot-err", e.message);
  }
}

// ---- código de recuperación ----
export async function recoveryCopy() {
  if (!S.rec) return;
  const e = $("#rec-msg");
  try {
    await navigator.clipboard.writeText(S.rec.code);
    if (e) e.textContent = "Código copiado.";
  } catch {
    if (e) e.textContent = "No he podido copiarlo. Apúntalo a mano.";
  }
}
export function recoveryOk(checked) {
  const b = $('[data-act="reccontinue"]');
  if (b) b.disabled = !checked;
}
export function recoveryContinue() {
  if (!S.rec) return go("role");
  const next = S.rec.next;
  S.rec = null; // el código no se vuelve a mostrar
  go(next);
}

// ---- contraseña temporal ----
export async function changePassSubmit() {
  const old = $("#cp-old"),
    nueva = $("#cp-new"),
    btn = $('[data-act="changepasssubmit"]');
  setErr("cp-old-err", "", old);
  setErr("cp-new-err", "", nueva);
  setErr("cp-err", "");
  btn.disabled = true;
  try {
    await online.changePassword(old.value, nueva.value);
  } catch (e) {
    if (S.screen !== "changepass") return;
    btn.disabled = false;
    if (e.code === "contrasena_invalida") {
      setErr("cp-new-err", e.message, nueva);
      nueva.focus();
    } else if (e.code === "credenciales_invalidas") {
      setErr("cp-old-err", "La contraseña temporal no es correcta.", old);
      old.focus();
    } else if (e.code === "sesion_no_valida") {
      go("role");
    } else setErr("cp-err", e.message);
    return;
  }
  const volver = S.cpVolver;
  S.cpVolver = false;
  go(volver ? "myaccount" : destino((online.account() || {}).role));
}

export function changePassOpen() {
  S.cpVolver = true;
  go("changepass");
}

export async function logout() {
  await guardar(); // lo que aún no se había enviado, antes de borrarlo de este dispositivo
  await online.logout();
  clearLocal();
  S.role = null;
  S.rank = null;
  go("role");
}

// ---- mi cuenta ----
export function accountDeleteAsk() {
  const a = online.account();
  modal(
    "<h2>¿Borrar mi cuenta?</h2>" +
      "<p>Se borrarán de nuestro servidor tu usuario <b>" +
      esc((a || {}).username || "") +
      "</b>, tu progreso, tu sitio en la clase y tus partidas. " +
      ((a || {}).role === "profe"
        ? "También se borrarán <b>todas tus clases</b> con sus alumnos."
        : "Si has creado retos, también se borrarán para todos los que estén en ellos.") +
      " No se puede deshacer.</p>" +
      '<label class="lbl" for="da-pw">Escribe tu contraseña para confirmar</label>' +
      '<input class="field" id="da-pw" type="password" maxlength="72" autocomplete="current-password" aria-describedby="da-err">' +
      '<p class="err" id="da-err" role="alert"></p>' +
      '<div class="row"><button class="btn go" data-act="modalclose">Mejor no</button>' +
      '<button class="btn" data-act="accountdel">Sí, borrar mi cuenta</button></div>'
  );
}
export async function accountDelete() {
  const pw = $("#da-pw");
  setErr("da-err", "");
  try {
    await online.deleteAccount(pw.value);
  } catch (e) {
    if (sesionCaducada(e)) return closeModal();
    setErr("da-err", e.code === "credenciales_invalidas" ? "La contraseña no es correcta." : e.message);
    return;
  }
  closeModal();
  clearLocal();
  S.role = null;
  S.rank = null;
  go("role");
}
