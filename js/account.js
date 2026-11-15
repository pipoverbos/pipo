// Lógica de las cuentas: entrar, crear cuenta, recuperar la contraseña y cerrar sesión.
// Las pantallas están en views/account.js. Todo lo que habla con el servidor pasa por online.js.
import { $, validAlias } from "./utils.js";
import { store } from "./store.js";
import { S } from "./state.js";
import { online } from "./online.js";
import { go } from "./router.js";

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
  if (a && a.role === role) return go(destino(role));
  S.authRole = role;
  S.authMode = store.get("hadacc", false) ? "login" : "register";
  go("auth");
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
  go(destino((online.account() || {}).role));
}

export async function logout() {
  await online.logout();
  S.role = null;
  S.rank = null;
  go("role");
}
