// Persistencia en localStorage (prefijo pipo2.) con copia en memoria por si el navegador la bloquea.

const mem={};
export const store={
  get:function(k,d){try{var v=localStorage.getItem("pipo2."+k);return v===null?(k in mem?mem[k]:d):JSON.parse(v)}catch{return k in mem?mem[k]:d}},
  set:function(k,v){mem[k]=v;try{localStorage.setItem("pipo2."+k,JSON.stringify(v))}catch{}}
};
