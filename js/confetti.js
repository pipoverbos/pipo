// Confeti al superar un nivel (respeta prefers-reduced-motion).
import { $ } from "./utils.js";

export function confetti() {
  if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var c = $("#conf"),
    cols = ["#D6F06A", "#8EDCF2", "#CDAEF5", "#FFF08A", "#F2828D"];
  for (var i = 0; i < 70; i++) {
    var s = document.createElement("i");
    s.style.cssText =
      "left:" +
      Math.random() * 100 +
      "%;background:" +
      cols[i % 5] +
      ";animation-delay:" +
      Math.random() * 0.7 +
      "s;--dx:" +
      (Math.random() * 140 - 70) +
      "px;--rot:" +
      Math.random() * 720 +
      "deg;width:" +
      (6 + Math.random() * 6) +
      "px;height:" +
      (10 + Math.random() * 8) +
      "px";
    c.appendChild(s);
    (function (el) {
      setTimeout(function () {
        el.remove();
      }, 3400);
    })(s);
  }
}
