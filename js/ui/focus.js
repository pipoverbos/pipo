// Gestión del foco. Al repintar una zona con innerHTML el control enfocado desaparece y el foco se pierde en <body>,
// y quien navega con teclado tiene que empezar de nuevo desde arriba. Estas ayudas lo devuelven al mismo control
// (o a uno de reserva) y llevan el foco al título cuando cambia de pantalla.

/** Anota qué control tiene el foco dentro de `root` (o null si el foco está fuera). */
export function focusSignature(root) {
  const el = document.activeElement;
  if (!el || el === document.body || !root.contains(el)) return null;
  return { id: el.id, data: { ...el.dataset } };
}

/** Devuelve el foco al control anotado; si ya no existe, al primero que encaje con `fallbacks`. */
export function restoreFocus(sig, root, fallbacks = []) {
  if (!sig) return;
  const byData = Object.entries(sig.data)
    .map(([k, v]) => `[data-${k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())}="${v}"]`)
    .join("");
  const candidates = [sig.id ? "#" + sig.id : byData, ...fallbacks].filter(Boolean);
  for (const selector of candidates) {
    const target = root.querySelector(selector);
    if (target) return target.focus({ preventScroll: true });
  }
}

/** Lleva el foco al título de la pantalla, para que se anuncie el cambio y se siga leyendo desde ahí. */
export function focusHeading(root) {
  const heading = root.querySelector("h1, h2");
  if (!heading) return;
  heading.setAttribute("tabindex", "-1");
  heading.focus({ preventScroll: true });
}
