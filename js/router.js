// Navegación: cada pantalla se registra con su nombre y render() dibuja la actual.
import { $ } from "./utils.js";
import { S } from "./state.js";

var views={};
export function registerView(name,fn){views[name]=fn}
export function go(s){S.screen=s;render()}
export function render(){
  var v=$("#view");
  window.scrollTo(0,0);
  if(views[S.screen])views[S.screen](v);
}
