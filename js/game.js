// Reglas del juego: niveles, vidas, aciertos, errores y final de partida.
import { $, esc, shuffle } from "./utils.js";
import { store } from "./store.js";
import { S, R, setR } from "./state.js";
import { BASE } from "./data/base-verbs.js";
import { selV, selSet, score, reg, same, getStars, missMap, addMiss } from "./verbs.js";
import { LV } from "./data/config.js";
import { snd } from "./audio.js";
import { confetti } from "./confetti.js";
import { pipo } from "./ui/pipo.js";
import { starsHTML } from "./ui/icons.js";
import { modal } from "./ui/modal.js";
import { render } from "./router.js";
import { say, renderHud, renderPlay, shakeSlot } from "./views/game.js";

export function cfgFor(i) {
  var d = store.get("diff", "normal"),
    L = LV[i];
  return { n: L.n, cols: L.cols, g: L.gaps[d], tr: L.tr[d], type: L.type, intro: L.intro(L.gaps[d]) };
}
export function levelVerbs(i) {
  var vs = selV()
    .map(function (v) {
      return [v, score(v) + Math.random() * 0.9];
    })
    .sort(function (a, b) {
      return a[1] - b[1];
    })
    .map(function (x) {
      return x[0];
    });
  var n = vs.length,
    base = Math.floor(n / 5),
    rem = n % 5,
    s = 0,
    out = [];
  for (var k = 0; k < 5; k++) {
    var sz = base + (k < rem ? 1 : 0);
    if (k === i) {
      out = vs.slice(s, s + sz);
      break;
    }
    s += sz;
  }
  if (out.length > 8) out = shuffle(out.slice()).slice(0, 8);
  return shuffle(out.slice());
}
export function practiceVerbs() {
  var mm = missMap(),
    sel = selSet();
  return BASE.filter(function (v) {
    return sel.has(v[0]) && mm[v[0]] > 0;
  })
    .sort(function (a, b) {
      return mm[b[0]] - mm[a[0]];
    })
    .slice(0, 8);
}
export function newLevel(cfg, idx, rows, keep) {
  var lives = keep ? R.lives : 5,
    streak = keep ? R.streak : 0;
  setR({
    cfg: cfg,
    idx: idx,
    rows: rows,
    hid: [],
    placed: {},
    chips: [],
    sel: null,
    selSlot: null,
    lives: lives,
    streak: streak,
    mis: 0,
    done: false,
    dead: false,
    failed: {},
    total: 0,
    last: null,
  });
  R.hid = rows.map(function () {
    return new Set(shuffle(cfg.cols.slice()).slice(0, cfg.g));
  });
  rows.forEach(function (v, i) {
    R.hid[i].forEach(function (f) {
      R.total++;
      if (!cfg.type) R.chips.push({ t: v[f], col: f, used: false });
    });
  });
  if (cfg.tr) {
    var real = {};
    rows.forEach(function (v) {
      real[v[1]] = 1;
      real[v[2]] = 1;
    });
    var c = [];
    rows.forEach(function (v) {
      c.push(reg(v[0]));
      c.push(reg(v[1]));
    });
    c = shuffle(
      Array.from(new Set(c)).filter(function (x) {
        return !real[x];
      })
    ).slice(0, cfg.tr);
    c.forEach(function (t) {
      R.chips.push({ t: t, col: -1, used: false });
    });
  }
  shuffle(R.chips);
  S.screen = "game";
  render();
  say(cfg.intro, "normal");
}
export function startLevel(i, keep) {
  newLevel(cfgFor(i), i, levelVerbs(i), keep);
}
export function startPractice() {
  var rows = practiceVerbs();
  if (rows.length < 3) return;
  newLevel(
    {
      n: "Repaso de errores",
      cols: [0, 1, 2, 3],
      g: 2,
      tr: 0,
      type: false,
      intro: "Repaso de errores: practicamos los verbos que más se te resisten. ¡Sin prisa!",
    },
    -1,
    shuffle(rows.slice()),
    false
  );
}
export function success(key, txt, row, f) {
  R.placed[key] = txt;
  R.last = key;
  R.streak++;
  snd("ok");
  var msg = "¡Bien! " + (f < 3 ? row[4] : row[0] + " significa " + row[3] + "."),
    mood = "normal";
  if (R.streak >= 10) {
    R.streak = 0;
    R.lives++;
    snd("life");
    msg = "¡10 aciertos seguidos! Gano una vida. " + (f < 3 ? row[4] : "");
    mood = "cheer";
  }
  if (Object.keys(R.placed).length === R.total) {
    finish();
    return;
  }
  say(msg, mood);
  renderHud();
  renderPlay();
}
export function fail(row, msg, key) {
  R.lives--;
  R.streak = 0;
  R.mis++;
  R.failed[row[0]] = 1;
  addMiss(row[0]);
  if (R.lives <= 0) {
    R.dead = true;
    snd("die");
    renderHud();
    renderPlay();
    say("Me he quedado sin vidas en " + (R.idx >= 0 ? "el nivel " + (R.idx + 1) : "el repaso") + ".", "dead");
    showDead();
    return;
  }
  snd("bad");
  say(msg + " Pierdo una vida.", "hurt");
  renderHud();
  renderPlay();
  shakeSlot(key);
}
export function place(key) {
  if (R.dead || R.done || R.placed[key]) return;
  if (R.sel === null) {
    say("Primero toca una ficha de arriba.", "think");
    return;
  }
  var p = key.split("-"),
    i = +p[0],
    f = +p[1],
    row = R.rows[i],
    ch = R.chips[R.sel];
  if (ch.t === row[f]) {
    ch.used = true;
    R.sel = null;
    success(key, ch.t, row, f);
  } else {
    var msg;
    if (ch.col === -1) msg = "¡Trampa! Esa forma no existe: los verbos irregulares no acaban en -ed.";
    else if (ch.col !== f) msg = "Esa ficha es de otra columna. Mira los colores de la cabecera.";
    else if (f === 3) msg = "Ese significado es de otro verbo. Mira bien la fila.";
    else msg = "Ese no encaja en " + row[0] + ". Pista: " + row[5];
    R.sel = null;
    fail(row, msg, key);
  }
}
export function check() {
  if (R.selSlot === null || R.dead || R.done) return;
  var ti = $("#ti");
  if (!ti || !ti.value.trim()) {
    say("Escribe tu respuesta antes de comprobar.", "think");
    return;
  }
  var p = R.selSlot.split("-"),
    i = +p[0],
    f = +p[1],
    row = R.rows[i],
    key = R.selSlot;
  if (same(ti.value, row[f])) {
    R.selSlot = null;
    success(key, row[f], row, f);
  } else fail(row, "Esa no es. Pista: " + row[5], key);
}
export function finish() {
  R.done = true;
  var stars = R.mis === 0 ? 3 : R.mis <= 2 ? 2 : 1;
  if (R.idx >= 0) {
    var d = store.get("diff", "normal"),
      s = getStars(d);
    if (stars > s[R.idx]) {
      s[R.idx] = stars;
      store.set("stars." + d, s);
    }
  } else {
    var mm = missMap();
    Object.keys(R.failed).length;
    R.rows.forEach(function (v) {
      if (!R.failed[v[0]]) delete mm[v[0]];
    });
    store.set("miss", mm);
  }
  renderHud();
  renderPlay();
  snd("up");
  confetti();
  var last = R.idx === 4,
    practice = R.idx < 0;
  var title = last ? "¡Has terminado el juego!" : practice ? "¡Repaso completado!" : "¡Nivel superado!";
  var txt = last
    ? "Pipo se salva con " + R.lives + (R.lives === 1 ? " vida" : " vidas") + ". ¡Eres una crack de los verbos!"
    : practice
      ? "Los verbos que has acertado salen de tu lista de repaso."
      : R.mis === 0
        ? "¡Sin ningún error!"
        : "Has cometido " + R.mis + (R.mis === 1 ? " error" : " errores") + ". ¡Sigue así!";
  var btns = "";
  if (!last && !practice) btns += '<button class="btn go big" data-act="next">Siguiente nivel</button>';
  btns +=
    '<button class="btn" data-act="' +
    (practice ? "home" : "map") +
    '">' +
    (practice ? "Inicio" : "Mapa de niveles") +
    "</button>";
  modal(
    pipo("cheer") +
      "<h2>" +
      title +
      "</h2>" +
      (practice ? "" : starsHTML(stars)) +
      "<p>" +
      esc(txt) +
      '</p><div class="row">' +
      btns +
      "</div>"
  );
  say(title, "cheer");
}
export function showDead() {
  modal(
    pipo("dead") +
      '<h2>Pipo se ha quedado sin vidas</h2><p>No pasa nada, ¡los verbos irregulares cuestan! Inténtalo otra vez.</p><div class="row"><button class="btn go big" data-act="retry">Reintentar</button><button class="btn" data-act="' +
      (R.idx >= 0 ? "map" : "home") +
      '">' +
      (R.idx >= 0 ? "Mapa de niveles" : "Inicio") +
      "</button></div>"
  );
}
