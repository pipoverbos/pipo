// Efectos de sonido sintetizados con Web Audio (se pueden silenciar).
import { store } from "./store.js";

let ac=null;
export function snd(t){
  if(!store.get("sound",true))return;
  try{
    ac=ac||new (window.AudioContext||window.webkitAudioContext)();
    var now=ac.currentTime;
    var seq={ok:[[660,0,.09],[880,.09,.12]],bad:[[220,0,.16],[160,.12,.22]],up:[[523,0,.1],[659,.1,.1],[784,.2,.1],[1046,.3,.28]],
      life:[[784,0,.1],[988,.1,.1],[1318,.2,.22]],die:[[300,0,.2],[220,.2,.2],[150,.4,.4]],tap:[[520,0,.04]]}[t];
    seq.forEach(function(n){
      var o=ac.createOscillator(),g=ac.createGain();
      o.type=(t==="bad"||t==="die")?"sawtooth":"triangle";o.frequency.value=n[0];
      g.gain.setValueAtTime(.0001,now+n[1]);g.gain.exponentialRampToValueAtTime(.11,now+n[1]+.02);g.gain.exponentialRampToValueAtTime(.0001,now+n[1]+n[2]);
      o.connect(g);g.connect(ac.destination);o.start(now+n[1]);o.stop(now+n[1]+n[2]+.03);
    });
  }catch{/* sin audio (bloqueado o no disponible): el juego sigue sin sonido */}
}
