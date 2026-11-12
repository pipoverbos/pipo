// Punto de entrada: registra las pantallas, activa los eventos y arranca.
import { registerView, render } from "./router.js";
import { initEvents } from "./events.js";
import { loadView } from "./views/load.js";
import { meetView } from "./views/meet.js";
import { homeView } from "./views/home.js";
import { verbsView } from "./views/verbs.js";
import { mapView } from "./views/map.js";
import { gameView } from "./views/game.js";

registerView("load", loadView);
registerView("meet", meetView);
registerView("home", homeView);
registerView("verbs", verbsView);
registerView("map", mapView);
registerView("game", gameView);

initEvents();
render();
