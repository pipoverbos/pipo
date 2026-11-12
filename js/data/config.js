// Configuración del juego: dificultades, niveles y consejos de la pantalla de carga.

export const MIN=10;
export const DIFFS={easy:"Fácil",normal:"Normal",hard:"Difícil"};
export const DIFFD={easy:"Pocos huecos y pocas trampas. Ideal para empezar.",normal:"Un buen reto, ni muy fácil ni muy difícil.",hard:"Muchos huecos y más trampas. ¡Solo para valientes!"};
export const COLN=["infinitivo","pasado (past simple)","participio (past participle)","significado"];
export const LV=[
{n:"Calentamiento",cols:[1,2,3],gaps:{easy:1,normal:1,hard:2},tr:{easy:0,normal:0,hard:0},type:false,
 intro:function(g){return "Nivel 1: calentamiento. Faltan "+g+(g===1?" hueco":" huecos")+" por fila. Toca una ficha y luego su casilla."}},
{n:"En marcha",cols:[1,2,3],gaps:{easy:1,normal:2,hard:3},tr:{easy:0,normal:0,hard:0},type:false,
 intro:function(g){return "Nivel 2: ahora faltan "+g+(g===1?" hueco":" huecos")+" por fila."}},
{n:"Sin red",cols:[0,1,2,3],gaps:{easy:2,normal:3,hard:3},tr:{easy:0,normal:0,hard:0},type:false,
 intro:function(g){return "Nivel 3: ¡ojo! Faltan "+g+" huecos por fila y puede faltar hasta el infinitivo."}},
{n:"Con trampas",cols:[0,1,2,3],gaps:{easy:2,normal:3,hard:3},tr:{easy:2,normal:4,hard:6},type:false,
 intro:function(){return "Nivel 4: cuidado con las trampas. Entre las fichas hay formas falsas, como las que acaban en -ed. Si las usas, pierdo una vida."}},
{n:"Escribe tú",cols:[0,1,2],gaps:{easy:1,normal:2,hard:3},tr:{easy:0,normal:0,hard:0},type:true,
 intro:function(g){return "Nivel 5: sin fichas. Tienes el significado y escribes tú "+(g===1?"la forma que falta":"las "+g+" formas que faltan")+" de cada fila. Toca una casilla para empezar."}}
];
export const TIPS=[
"Si el pasado y el participio son iguales, ¡aprendes dos formas por el precio de una!",
"Los verbos irregulares son los más usados en inglés. Aprenderlos vale la pena.",
"Truco: begin, drink y swim siguen el patrón i, a, u.",
"Repasa 5 minutos cada día. Es mejor que 1 hora el domingo.",
"Di las tres formas en voz alta: infinitivo, pasado y participio."
];
