// Punto de entrada: registra las pantallas, activa los eventos y arranca.
import { store } from "./store.js";
import { registerView, render } from "./router.js";
import { initEvents } from "./events.js";
import { loadView } from "./views/load.js";
import { meetView } from "./views/meet.js";
import { homeView } from "./views/home.js";
import { verbsView } from "./views/verbs.js";
import { mapView } from "./views/map.js";
import { gameView } from "./views/game.js";
import { roleView } from "./views/role.js";
import { authView, forgotView, recoveryView, changePassView, profView } from "./views/account.js";
import { joinView, rankView, challengeView, challengeDoneView } from "./views/classes.js";

store.init(); // antes de pintar nada: lleva los datos guardados a la versión actual

registerView("load", loadView);
registerView("meet", meetView);
registerView("home", homeView);
registerView("verbs", verbsView);
registerView("map", mapView);
registerView("game", gameView);
registerView("join", joinView);
registerView("rank", rankView);
registerView("role", roleView);
registerView("auth", authView);
registerView("forgot", forgotView);
registerView("recovery", recoveryView);
registerView("changepass", changePassView);
registerView("prof", profView);
registerView("challenge", challengeView);
registerView("challengedone", challengeDoneView);

initEvents();
render();
