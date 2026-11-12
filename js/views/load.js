// Pantalla de carga.
import { $, esc, pick } from "../utils.js";
import { store } from "../store.js";
import { S } from "../state.js";
import { TIPS } from "../data/config.js";
import { pipo } from "../ui/pipo.js";
import { go } from "../router.js";

let loadTimer=null;
export function loadView(v){
  v.innerHTML='<section class="load">'+pipo("normal")+
    '<h1>Pipo y los verbos irregulares</h1><p class="sub">Preparando el cuaderno…</p>'+
    '<div class="bar" role="progressbar" aria-label="Cargando" aria-valuemin="0" aria-valuemax="100"><i id="bf"></i></div>'+
    '<p class="tipline" id="tl">'+esc(pick(TIPS))+'</p></section>';
  var p=0,t=0;
  clearInterval(loadTimer);
  loadTimer=setInterval(function(){
    t++;p=Math.min(100,p+4+Math.random()*6);
    var bf=$("#bf");if(bf)bf.style.width=p+"%";
    if(t%12===0){var tl=$("#tl");if(tl)tl.textContent=pick(TIPS)}
    if(p>=100){clearInterval(loadTimer);setTimeout(function(){if(S.screen==="load"){S.meet=0;go(store.get("seen",false)?"home":"meet")}},350)}
  },110);
}
