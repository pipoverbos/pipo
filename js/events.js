// Eventos globales (delegación): clics, teclado, escritura y arrastrar y soltar.
import { $, cleanAlias, validAlias } from "./utils.js";
import { store } from "./store.js";
import { online } from "./online.js";
import { S, R, setR } from "./state.js";
import { selSet, selV, unlocked, listInfs, diffActual } from "./verbs.js";
import { BASE } from "./data/base-verbs.js";
import { MIN, COLN, LISTS } from "./data/config.js";
import { snd } from "./audio.js";
import { go, render } from "./router.js";
import { closeModal } from "./ui/modal.js";
import { refreshVerbs, cambiarVerbos, confirmarVerbos } from "./views/verbs.js";
import { say, renderPlay } from "./views/game.js";
import { startLevel, startPractice, place, check } from "./game.js";
import {
  entrarComo,
  authMode,
  authSubmit,
  forgotSubmit,
  showPassword,
  recoveryCopy,
  recoveryOk,
  recoveryContinue,
  changePassSubmit,
  changePassOpen,
  accountDeleteAsk,
  accountDelete,
  logout,
} from "./account.js";
import {
  loadClasses,
  profCreate,
  openProfClass,
  profBack,
  profTab,
  profReload,
  profCopyCode,
  cfgToggle,
  cfgSave,
  profDelAsk,
  profDel,
  profStudent,
  profStudentBack,
  studentPdf,
  studentRemoveAsk,
  studentRemove,
  studentResetAsk,
  studentReset,
  tempCopy,
  tempClose,
} from "./prof.js";
import {
  openClass,
  loadRank,
  joinSubmit,
  leaveAsk,
  leaveDo,
  challengeCreate,
  challengeCopy,
  challengeShare,
  challengeDelAsk,
  challengeDel,
  sendRun,
} from "./classes.js";

export function initEvents() {
  document.addEventListener("click", function (e) {
    var t = e.target;
    var chip = t.closest("[data-chip]");
    if (chip && R && S.screen === "game") {
      var k = +chip.dataset.chip;
      snd("tap");
      R.sel = R.sel === k ? null : k;
      if (R.sel !== null) say("Llevas «" + R.chips[k].t + "». Busca su casilla en la tabla.", "think");
      renderPlay();
      return;
    }
    var slot = t.closest("[data-slot]");
    if (slot && R && S.screen === "game") {
      var key = slot.dataset.slot;
      if (R.cfg.type) {
        if (!R.placed[key] && !R.dead && !R.done) {
          R.selSlot = key;
          var p = key.split("-");
          say("Escribe el " + COLN[+p[1]] + " de «" + R.rows[+p[0]][3] + "».", "think");
          renderPlay();
        }
      } else place(key);
      return;
    }
    var a = t.closest("[data-act]");
    if (!a) return;
    var act = a.dataset.act;
    if (act !== "check") snd("tap");
    switch (act) {
      case "meetnext":
        if (S.meet === 0) {
          var nm = $("#nm"),
            alias = cleanAlias(nm ? nm.value : "");
          if (!validAlias(alias)) {
            // Sin apodo no se puede seguir: se avisa en el propio campo y el foco vuelve a él.
            $("#nm-err").textContent = "Escribe un apodo de 2 a 20 letras o números para poder jugar.";
            nm.setAttribute("aria-invalid", "true");
            nm.focus();
            break;
          }
          store.set("name", alias);
        }
        if (S.meet < 2) {
          S.meet++;
          render();
        } else {
          store.set("seen", true);
          go("home");
        }
        break;
      case "meetback":
        S.meet = Math.max(0, S.meet - 1);
        render();
        break;
      case "student":
        entrarComo("alumno");
        break;
      case "profe":
        entrarComo("profe");
        break;
      case "authmode":
        authMode(a.dataset.m);
        break;
      case "authback":
        S.role = null;
        go("role");
        break;
      case "authsubmit":
        authSubmit();
        break;
      case "forgot":
        go("forgot");
        break;
      case "forgotsubmit":
        forgotSubmit();
        break;
      case "showpw":
        showPassword(a.checked);
        break;
      case "recok":
        recoveryOk(a.checked);
        break;
      case "reccopy":
        recoveryCopy();
        break;
      case "reccontinue":
        recoveryContinue();
        break;
      case "changepasssubmit":
        changePassSubmit();
        break;
      case "logout":
        logout();
        break;
      case "proflist":
        loadClasses();
        break;
      case "profnew":
        go("profnew");
        break;
      case "profnewsubmit":
        profCreate();
        break;
      case "profopen":
        openProfClass(a.dataset.code);
        break;
      case "profback":
        profBack();
        break;
      case "proftab":
        profTab(a.dataset.t);
        break;
      case "profreload":
        profReload();
        break;
      case "profcopy":
        profCopyCode();
        break;
      case "cfgtoggle":
        cfgToggle(a.dataset.k, a.dataset.v, a.checked);
        break;
      case "cfgsave":
        cfgSave();
        break;
      case "profdelask":
        profDelAsk();
        break;
      case "profdel":
        profDel();
        break;
      case "profstudent":
        profStudent(a.dataset.alias);
        break;
      case "profstudentback":
        profStudentBack();
        break;
      case "studentpdf":
        studentPdf();
        break;
      case "studentremoveask":
        studentRemoveAsk();
        break;
      case "studentremove":
        studentRemove();
        break;
      case "studentresetask":
        studentResetAsk();
        break;
      case "studentreset":
        studentReset();
        break;
      case "tempcopy":
        tempCopy();
        break;
      case "tempclose":
        tempClose();
        break;
      case "myaccount":
        S.cpVolver = false;
        go("myaccount");
        break;
      case "accountback":
        go(online.account() && online.account().role === "profe" ? "prof" : "home");
        break;
      case "changepassopen":
        changePassOpen();
        break;
      case "accountdelask":
        accountDeleteAsk();
        break;
      case "accountdel":
        accountDelete();
        break;
      case "home":
        closeModal();
        setR(null);
        go("home");
        break;
      case "play":
        if (selV().length >= MIN) go("map");
        break;
      case "diff":
        store.set("diff", a.dataset.d);
        render();
        break;
      case "sound":
        store.set("sound", !store.get("sound", true));
        render();
        break;
      case "verbs":
        S.vq = "";
        go("verbs");
        break;
      case "pre": {
        var pr = a.dataset.p,
          s;
        if (pr === "all") s = new Set(BASE.map((v) => v[0]));
        else if (pr === "none") s = new Set();
        else s = new Set(listInfs(LISTS.find((l) => l.id === pr)));
        cambiarVerbos(s);
        break;
      }
      case "tv": {
        var set = selSet(),
          inf = a.dataset.inf;
        if (set.has(inf)) set.delete(inf);
        else set.add(inf);
        cambiarVerbos(set);
        break;
      }
      case "verbschange":
        confirmarVerbos();
        break;
      case "level": {
        var i = +a.dataset.i;
        if (unlocked(i, diffActual())) {
          startLevel(i, false);
        }
        break;
      }
      case "practice":
        startPractice();
        break;
      case "map":
        closeModal();
        setR(null);
        go("map");
        break;
      case "next":
        closeModal();
        startLevel(R.idx + 1, true);
        break;
      case "retry":
        closeModal();
        if (R.idx >= 0) startLevel(R.idx, false);
        else startPractice();
        break;
      case "check":
        check();
        break;
      case "class":
        openClass();
        break;
      case "challenge":
        go("challenge");
        break;
      case "challengemake":
        challengeCreate();
        break;
      case "challengecopy":
        challengeCopy();
        break;
      case "challengeshare":
        challengeShare();
        break;
      case "challengedelask":
        challengeDelAsk();
        break;
      case "challengedel":
        challengeDel();
        break;
      case "joinclass":
        joinSubmit();
        break;
      case "rankreload":
        loadRank();
        break;
      case "leaveask":
        leaveAsk();
        break;
      case "leavedo":
        leaveDo();
        break;
      case "resendrun":
        sendRun();
        break;
      case "modalclose":
        closeModal();
        break;
    }
  });
  document.addEventListener("input", function (e) {
    if (e.target.id === "vq") {
      S.vq = e.target.value;
      refreshVerbs();
    }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && e.target.id === "ti") {
      e.preventDefault();
      check();
    }
    if (e.key === "Enter" && e.target.id === "nm") {
      e.preventDefault();
      $('[data-act="meetnext"]').click();
    }
    // Intro en los campos de las clases: es lo mismo que pulsar su botón.
    var enter = {
      cc: "joinclass",
      cn: "joinclass",
      rn: "challengemake",
      ra: "challengemake",
      au: "authsubmit",
      ap: "authsubmit",
      fu: "forgotsubmit",
      fc: "forgotsubmit",
      fn: "forgotsubmit",
      "cp-old": "changepasssubmit",
      "cp-new": "changepasssubmit",
      pn: "profnewsubmit",
    }[e.target.id];
    if (e.key === "Enter" && enter) {
      e.preventDefault();
      $('[data-act="' + enter + '"]').click();
    }
    // Las casillas de la tabla son role="button" sobre una celda: no responden solas a Enter ni a Espacio.
    if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches("td[data-slot]")) {
      e.preventDefault();
      e.target.click();
    }
    // Escape en una ventana de resultado: la salida segura es volver al mapa o al inicio.
    if (e.key === "Escape") {
      var out = $(
        '#modal [data-act="map"], #modal [data-act="home"], #modal [data-act="modalclose"], #modal [data-act="tempclose"]'
      );
      if (out) out.click();
    }
  });
  document.addEventListener("dragstart", function (e) {
    var c = e.target.closest && e.target.closest("[data-chip]");
    if (c && R) {
      R.sel = +c.dataset.chip;
      try {
        e.dataTransfer.setData("text/plain", "x");
      } catch {
        /* algunos navegadores no permiten dataTransfer: se arrastra igual */
      }
    }
  });
  document.addEventListener("dragover", function (e) {
    if (e.target.closest && e.target.closest("[data-slot]")) e.preventDefault();
  });
  document.addEventListener("drop", function (e) {
    var s = e.target.closest && e.target.closest("[data-slot]");
    if (s && R && !R.cfg.type) {
      e.preventDefault();
      place(s.dataset.slot);
    }
  });
}
