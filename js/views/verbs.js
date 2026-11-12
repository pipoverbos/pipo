// Mis verbos: elegir, buscar, añadir y borrar verbos propios.
import { $, esc } from "../utils.js";
import { store } from "../store.js";
import { S } from "../state.js";
import { custom, allV, selSet, selV, saveSel } from "../verbs.js";
import { MIN } from "../data/config.js";
import { ICON } from "../ui/icons.js";

export function verbsView(v){
  v.innerHTML='<section><div class="top"><button class="iconbtn" data-act="home" aria-label="Volver">'+ICON.back+'</button><h2>Mis verbos</h2></div>'+
    '<p><b id="vcount"></b></p>'+
    '<div class="chiprow"><button class="pill" data-act="pre" data-p="all">Todos</button><button class="pill" data-act="pre" data-p="none">Ninguno</button><button class="pill" data-act="pre" data-p="l1">Lista 1 (be–eat)</button><button class="pill" data-act="pre" data-p="l2">Lista 2 (fall–leave)</button><button class="pill" data-act="pre" data-p="mine">Solo los míos</button></div>'+
    '<details class="card mt" id="addbox"><summary>Añadir un verbo <span aria-hidden="true">+</span></summary>'+
    '<div class="form">'+
    '<div><label for="a-inf">Infinitivo (ej. swim)</label><input class="field" id="a-inf" maxlength="24" autocomplete="off" autocapitalize="none" spellcheck="false"></div>'+
    '<div><label for="a-past">Past simple (ej. swam)</label><input class="field" id="a-past" maxlength="30" autocomplete="off" autocapitalize="none" spellcheck="false"></div>'+
    '<div><label for="a-pp">Past participle (ej. swum)</label><input class="field" id="a-pp" maxlength="30" autocomplete="off" autocapitalize="none" spellcheck="false"></div>'+
    '<div><label for="a-mean">Significado (ej. nadar)</label><input class="field" id="a-mean" maxlength="30" autocomplete="off"></div>'+
    '<div><label for="a-tip">Truco para recordarlo (opcional)</label><input class="field" id="a-tip" maxlength="90" autocomplete="off"></div>'+
    '<p class="muted" style="font-size:16px">Si hay dos formas, sepáralas con /. Por ejemplo: learnt / learned.</p>'+
    '<p class="err" id="amsg" role="alert"></p>'+
    '<button class="btn main" data-act="addverb">Añadir verbo</button></div></details>'+
    '<input class="field mt" id="vq" type="search" placeholder="Buscar un verbo" autocomplete="off" value="'+esc(S.vq)+'" aria-label="Buscar un verbo">'+
    '<div id="vlist"></div></section>';
  refreshVerbs();
}
export function refreshVerbs(){
  var q=S.vq.toLowerCase().trim(),sel=selSet(),cs={};
  custom().forEach(function(v){cs[v[0]]=1});
  var list=allV().filter(function(v){return !q||v[0].indexOf(q)>-1||v[3].toLowerCase().indexOf(q)>-1});
  var h=list.map(function(v){
    var on=sel.has(v[0]);
    var row='<div class="vwrap"><button class="vrow'+(on?" on":"")+'" data-act="tv" data-inf="'+esc(v[0])+'" aria-pressed="'+on+'" role="checkbox" aria-checked="'+on+'"><span class="chk">'+ICON.check+'</span><span><b>'+esc(v[0])+' · '+esc(v[1])+' · '+esc(v[2])+'</b>'+(cs[v[0]]?'<span class="tag">tuyo</span>':'')+'<small>'+esc(v[3])+'</small></span></button>';
    if(cs[v[0]]){
      row+=S.del===v[0]?'<button class="btn small" data-act="del" data-inf="'+esc(v[0])+'" style="background:var(--bad);color:#fff">¿Seguro?</button>':'<button class="iconbtn" data-act="del" data-inf="'+esc(v[0])+'" aria-label="Borrar '+esc(v[0])+'">'+ICON.trash+'</button>';
    }
    return row+'</div>';
  }).join("");
  $("#vlist").innerHTML=h||'<p class="muted mt">No hay ningún verbo con ese nombre.</p>';
  var n=selV().length;
  $("#vcount").textContent=n+(n===1?" verbo elegido":" verbos elegidos")+(n<MIN?" · necesitas al menos "+MIN+" para jugar":"");
}
export function addVerb(){
  var g=function(id){return ($("#"+id).value||"").trim()};
  var inf=g("a-inf").toLowerCase(),p=g("a-past").toLowerCase(),pp=g("a-pp").toLowerCase(),m=g("a-mean"),t=g("a-tip");
  var re=/^[a-z' -]+(\s?\/\s?[a-z' -]+)?$/,msg=$("#amsg");
  msg.className="err";
  if(!inf||!p||!pp||!m){msg.textContent="Rellena el infinitivo, el pasado, el participio y el significado.";return}
  if(!/^[a-z' -]+$/.test(inf)||!re.test(p)||!re.test(pp)){msg.textContent="Escribe los verbos en inglés, solo con letras. Para dos formas usa /.";return}
  if(allV().some(function(v){return v[0]===inf})){msg.textContent="Ese verbo ya está en tu lista.";return}
  var c=custom();
  c.push([inf,p,pp,m,t||(inf+", "+p+", "+pp+": ¡que no se te olvide!"),"El pasado empieza por “"+p.charAt(0)+"”."]);
  store.set("custom",c);
  var s=selSet();s.add(inf);saveSel(s);
  ["a-inf","a-past","a-pp","a-mean","a-tip"].forEach(function(id){$("#"+id).value=""});
  msg.className="okmsg";msg.textContent="¡"+inf+" añadido y elegido!";
  S.vq="";$("#vq").value="";refreshVerbs();
}
