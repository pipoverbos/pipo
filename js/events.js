// Eventos globales (delegación): clics, teclado, escritura y arrastrar y soltar.
import { $ } from "./utils.js";
import { store } from "./store.js";
import { S, R, setR } from "./state.js";
import { custom, allV, selSet, selV, saveSel, unlocked } from "./verbs.js";
import { BASE } from "./data/base-verbs.js";
import { MIN, COLN } from "./data/config.js";
import { snd } from "./audio.js";
import { go, render } from "./router.js";
import { closeModal } from "./ui/modal.js";
import { refreshVerbs, addVerb } from "./views/verbs.js";
import { say, renderPlay } from "./views/game.js";
import { startLevel, startPractice, place, check } from "./game.js";

export function initEvents(){
  document.addEventListener("click",function(e){
    var t=e.target;
    var chip=t.closest("[data-chip]");
    if(chip&&R&&S.screen==="game"){
      var k=+chip.dataset.chip;snd("tap");R.sel=(R.sel===k?null:k);
      if(R.sel!==null)say("Llevas «"+R.chips[k].t+"». Busca su casilla en la tabla.","think");
      renderPlay();return;
    }
    var slot=t.closest("[data-slot]");
    if(slot&&R&&S.screen==="game"){
      var key=slot.dataset.slot;
      if(R.cfg.type){
        if(!R.placed[key]&&!R.dead&&!R.done){R.selSlot=key;var p=key.split("-");say("Escribe el "+COLN[+p[1]]+" de «"+R.rows[+p[0]][3]+"».","think");renderPlay()}
      }else place(key);
      return;
    }
    var a=t.closest("[data-act]");if(!a)return;
    var act=a.dataset.act;
    if(act!=="check")snd("tap");
    switch(act){
      case "meetnext":
        if(S.meet===0){var nm=$("#nm");if(nm)store.set("name",nm.value.trim())}
        if(S.meet<2){S.meet++;render()}else{store.set("seen",true);go("home")}
        break;
      case "meetback":S.meet=Math.max(0,S.meet-1);render();break;
      case "meetpipo":S.meet=0;go("meet");break;
      case "home":closeModal();setR(null);go("home");break;
      case "play":if(selV().length>=MIN)go("map");break;
      case "diff":store.set("diff",a.dataset.d);render();break;
      case "sound":store.set("sound",!store.get("sound",true));render();break;
      case "verbs":S.vq="";S.del=null;go("verbs");break;
      case "pre":{
        var pr=a.dataset.p,s;
        if(pr==="all")s=new Set(allV().map(function(v){return v[0]}));
        else if(pr==="none")s=new Set();
        else if(pr==="l1")s=new Set(BASE.slice(0,15).map(function(v){return v[0]}));
        else if(pr==="l2")s=new Set(BASE.slice(15).map(function(v){return v[0]}));
        else s=new Set(custom().map(function(v){return v[0]}));
        saveSel(s);refreshVerbs();break;
      }
      case "tv":{var set=selSet(),inf=a.dataset.inf;if(set.has(inf))set.delete(inf);else set.add(inf);saveSel(set);refreshVerbs();break}
      case "del":{
        var di=a.dataset.inf;
        if(S.del===di){
          store.set("custom",custom().filter(function(v){return v[0]!==di}));
          var s2=selSet();s2.delete(di);saveSel(s2);S.del=null;
        }else S.del=di;
        refreshVerbs();break;
      }
      case "addverb":addVerb();break;
      case "level":{var i=+a.dataset.i;if(unlocked(i,store.get("diff","normal"))){startLevel(i,false)}break}
      case "practice":startPractice();break;
      case "map":closeModal();setR(null);go("map");break;
      case "next":closeModal();startLevel(R.idx+1,true);break;
      case "retry":closeModal();if(R.idx>=0)startLevel(R.idx,false);else startPractice();break;
      case "check":check();break;
    }
  });
  document.addEventListener("input",function(e){
    if(e.target.id==="vq"){S.vq=e.target.value;refreshVerbs()}
  });
  document.addEventListener("keydown",function(e){
    if(e.key==="Enter"&&e.target.id==="ti"){e.preventDefault();check()}
  });
  document.addEventListener("dragstart",function(e){
    var c=e.target.closest&&e.target.closest("[data-chip]");
    if(c&&R){R.sel=+c.dataset.chip;try{e.dataTransfer.setData("text/plain","x")}catch{}}
  });
  document.addEventListener("dragover",function(e){if(e.target.closest&&e.target.closest("[data-slot]"))e.preventDefault()});
  document.addEventListener("drop",function(e){
    var s=e.target.closest&&e.target.closest("[data-slot]");
    if(s&&R&&!R.cfg.type){e.preventDefault();place(s.dataset.slot)}
  });
}
