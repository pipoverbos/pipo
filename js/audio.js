// Efectos de sonido sintetizados con Web Audio (se pueden silenciar).
import { store } from "./store.js";

let ac = null;
export function snd(t) {
  if (!store.get("sound", true)) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    var now = ac.currentTime;
    var seq = {
      ok: [
        [660, 0, 0.09],
        [880, 0.09, 0.12],
      ],
      bad: [
        [220, 0, 0.16],
        [160, 0.12, 0.22],
      ],
      up: [
        [523, 0, 0.1],
        [659, 0.1, 0.1],
        [784, 0.2, 0.1],
        [1046, 0.3, 0.28],
      ],
      life: [
        [784, 0, 0.1],
        [988, 0.1, 0.1],
        [1318, 0.2, 0.22],
      ],
      die: [
        [300, 0, 0.2],
        [220, 0.2, 0.2],
        [150, 0.4, 0.4],
      ],
      tap: [[520, 0, 0.04]],
    }[t];
    seq.forEach(function (n) {
      var o = ac.createOscillator(),
        g = ac.createGain();
      o.type = t === "bad" || t === "die" ? "sawtooth" : "triangle";
      o.frequency.value = n[0];
      g.gain.setValueAtTime(0.0001, now + n[1]);
      g.gain.exponentialRampToValueAtTime(0.11, now + n[1] + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + n[1] + n[2]);
      o.connect(g);
      g.connect(ac.destination);
      o.start(now + n[1]);
      o.stop(now + n[1] + n[2] + 0.03);
    });
  } catch {
    /* sin audio (bloqueado o no disponible): el juego sigue sin sonido */
  }
}
