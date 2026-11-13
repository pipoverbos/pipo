# Pipo y los verbos irregulares

[![CI](https://github.com/pipoverbos/pipo/actions/workflows/ci.yml/badge.svg)](https://github.com/pipoverbos/pipo/actions/workflows/ci.yml)

Juego web educativo para aprender los verbos irregulares del inglés (infinitivo, past simple y past participle), pensado para alumnado de 1º de ESO. Se juega rellenando una tabla como la de un cuaderno, con una mascota (Pipo) que tiene vidas, da consejos y reacciona a los aciertos y errores.

Proyecto personal de Yuna: también es una pieza de portfolio (yunaespejo.com) y una base para crecer hacia clases con profesor y ranking.

## Estado actual (fase 1)

HTML, CSS y JavaScript sin dependencias ni paso de compilación, repartidos por responsabilidad (ver «Estructura del repositorio»). Ya funciona:

- Pantalla de carga y presentación de Pipo (3 pasos). Para jugar hay que elegir un **apodo** (2 a 20 caracteres; se pide no usar el nombre real).
- Elección de verbos: 80 verbos y 6 listas para elegir de golpe (Lista 1 a Lista 6, más Todos y Ninguno), marcar verbos sueltos y buscador. Las listas 1 y 2 son las del cuaderno original.
- Tres dificultades (Fácil, Normal, Difícil) que cambian cuántos huecos hay y cuántas fichas trampa aparecen.
- Mapa de 5 niveles que se desbloquean en orden y dan hasta 3 estrellas:
  1. Calentamiento · 2. En marcha · 3. Sin red (puede faltar el infinitivo) · 4. Con trampas (fichas falsas tipo `breaked`) · 5. Escribe tú (sin fichas, se escribe).
- Sistema de vidas: 5 vidas, se pierde una por error y se gana una cada 10 aciertos seguidos. Si llega a 0, Pipo "muere" y se puede reintentar.
- Repaso de errores: guarda los verbos que más se fallan y ofrece una ronda con ellos.
- Sonidos (se pueden silenciar), confeti, modo oscuro automático, diseño responsive (móvil y escritorio).

Los datos del jugador se guardan solo en el navegador (`localStorage`, claves con prefijo `pipo2.`): apodo (clave `name`), dificultad, verbos elegidos, estrellas, errores y sonido. No se envía nada a ningún servidor.

## Preparación para GitHub Pages (hecho)

- [x] Fuentes alojadas en `fonts/` con `@font-face` locales (sin Google Fonts).
- [x] `index.html` en la raíz y `.nojekyll`.
- [x] Repositorio en GitHub: https://github.com/pipoverbos/pipo
- [x] `meta description` y etiquetas Open Graph, con `og-image.png`.
- [x] CSS y JavaScript separados en `css/` y `js/`.

Lo demás de este documento es contexto y hoja de ruta, no tareas inmediatas. No añadir librerías ni frameworks.

## Ejecutarlo en local

El JavaScript usa módulos ES, que los navegadores no cargan si abres `index.html` con doble clic (`file://`). Hace falta un servidor local, por ejemplo desde la carpeta del proyecto:

```
npx serve
```

o `python -m http.server 8000` y abrir http://localhost:8000. En GitHub Pages funciona sin hacer nada más.

## Desarrollo

El juego no tiene dependencias en producción. `package.json` solo trae herramientas de desarrollo (ESLint, Prettier, Vitest y jsdom). Hace falta Node 22 o superior.

```
npm install        # una vez
npm run check      # lint + formato + tests (lo mismo que ejecuta la CI)
npm test           # solo los tests
npm run test:watch # tests en modo continuo
npm run format     # aplica Prettier
```

Los tests están en `tests/`:

- `unit/`: lógica de verbos (comparación de respuestas, puntuación, formas trampa, estrellas), integridad de los datos de verbos, niveles y listas, y **contraste de los colores** de `css/tokens.css` (WCAG AA, claro y oscuro).
- `e2e/`: arrancan el `index.html` real sobre jsdom y juegan como una persona: primera visita, partida completa de los 5 niveles, vidas y reintento, y elección de verbos por listas. Incluyen **accesibilidad**: axe-core sobre todas las pantallas, foco al cambiar de pantalla, juego con teclado y ventana modal.

La integración continua (`.github/workflows/ci.yml`) ejecuta todo esto en cada push a `main` y en cada pull request.

### Cómo se trabaja

- Una rama por tarea (`feat/…`, `fix/…`, `chore/…`) y pull request hacia `main`.
- Commits pequeños, con mensaje en español que explique el porqué.
- Un pull request solo se fusiona con la CI en verde.

## Hoja de ruta

### Fase 2 · Clases y ranking (sin datos personales)

Objetivo: que varios alumnos jueguen cada uno desde su dispositivo y vean un ranking de la clase.

Decisiones ya tomadas:

- **Sin email ni nombre real.** El profesor crea una clase y obtiene un código; cada alumno entra con ese código y un **apodo**. El ranking solo muestra apodos.
- **Sin cuentas obligatorias.** Se puede seguir jugando sin clase, como ahora.
- **Backend como servicio** (Supabase o Firebase), porque GitHub Pages solo sirve archivos estáticos. Pendiente de elegir.
- **Puntuación calculada en el servidor** (o validada allí), para que el ranking no se pueda falsear desde el navegador.

Modelo de datos orientativo:

- `classes`: id, código, nombre, creada_en, id_profesor
- `players`: id, id_clase, apodo, creado_en
- `runs`: id, id_jugador, nivel, dificultad, aciertos, errores, estrellas, fecha

Fórmula de puntos: por decidir (propuesta: puntos por acierto, bonus por racha y por estrellas, sin penalizar de más los errores).

### Fase 3 · Panel del profesor

- Ver el progreso de la clase y los verbos que más se fallan.
- Elegir qué lista de verbos practica la clase (código compartible).
- Poder borrar un alumno o una clase entera.

### Fase 4 · Monetización (solo cuando haya usuarios reales)

- La app se queda **gratis para el alumnado y sin anuncios personalizados**.
- Vías a estudiar: panel de pago para profesores o academias, versión para centros, donaciones.
- Si en algún momento se pusieran anuncios: solo no personalizados, con tratamiento de contenido dirigido a menores, y fuera de las pantallas de juego.

### Ideas en la recámara

- Accesorios para Pipo que se desbloquean con estrellas.
- Modo contrarreloj.
- Frases con huecos ("Yesterday I ___ (buy) a book").
- Diploma imprimible al terminar el nivel 5.
- Botón para escuchar la pronunciación de cada verbo.
- Traducciones de la interfaz (catalán, inglés).

## Privacidad y menores: reglas del proyecto

El público es de 12-13 años. En España, el tratamiento de datos de menores de 14 años basado en consentimiento exige el de sus padres o tutores (art. 7 de la LOPDGDD). Por eso:

- No pedir email, nombre real, foto ni ningún dato que identifique a una persona.
- No usar analítica ni cookies de terceros sin informar y sin consentimiento previo.
- Escribir una política de privacidad clara antes de activar cualquier recogida de datos (fase 2).
- Si se usa en un centro educativo, tener en cuenta que el centro también es responsable del tratamiento.
- Este documento no es asesoramiento legal: revisar con una persona experta antes de lanzar la fase 2.

## Diseño

- **Concepto:** una página de cuaderno cuadriculado (margen rojo, agujeros de anillas) sobre una tapa verde azulada. Las columnas usan los colores de los subrayadores del cuaderno original: infinitivo en verde lima, past simple en azul, past participle en morado y significado en amarillo.
- **Tipografías:** Caveat Brush para títulos y Andika para el resto. Andika está diseñada para aprender a leer: distingue bien la `I`, la `l` y el `1`, y su `a` y su `g` son las de la escritura escolar, así que encaja con el cuaderno. Se eligió comparando seis candidatas (Patrick Hand, Andika, Lexend, Atkinson Hyperlegible Next, Nunito y Comic Neue) sobre texto real del juego. Tiene negrita real, que Patrick Hand no tenía.
- **Mascota:** Pipo, un SVG en línea con varios estados de ánimo (normal, feliz, pensativo, dolido, eufórico y "muerto").
- **Sin emojis en la interfaz**, solo iconos SVG.
- **Accesibilidad:** foco visible, objetivos táctiles de al menos 44 px y respeto a `prefers-reduced-motion`. Se puede jugar entero con el teclado: las casillas de la tabla son botones con nombre, el foco va al título al cambiar de pantalla y se conserva al repintar, y la ventana de resultado recibe el foco, deja el resto inerte y se cierra con Escape. Los mensajes de Pipo se anuncian por una región `aria-live` fija. Cada pantalla tiene un único `<h1>`.

### Auditoría de accesibilidad y rendimiento

Medida en Chrome real (Lighthouse más axe-core sobre 44 combinaciones de pantalla, tema claro/oscuro y móvil/escritorio, con teclado, contraste y tamaño táctil):

|                                        | Antes                              | Después      |
| -------------------------------------- | ---------------------------------- | ------------ |
| Pantallas sin fallos de axe            | 7 de 44                            | **44 de 44** |
| Se puede jugar solo con teclado        | No (las casillas no recibían foco) | Sí           |
| Controles menores de 44 px             | 3                                  | 0            |
| Lighthouse buenas prácticas            | 96 (sin favicon)                   | 100          |
| Lighthouse rendimiento y accesibilidad | 100                                | 100          |

Lighthouse solo evalúa la pantalla de carga: por eso la auditoría completa se hizo con axe sobre todas las pantallas. Lo que se corrigió y se mantiene vigilado por los tests: ARIA no válida en las filas de verbos, las vidas y las ventanas, el contraste del modo oscuro (`--h0`, `--h3`) y del rojo de error del modo claro (`--bad`), y la falta de `<h1>`. Sin verificar con un lector de pantalla real (NVDA, VoiceOver): conviene probarlo antes de dar la accesibilidad por cerrada.

- **Responsive:** una columna en móvil, dos columnas desde 960 px.

## Estructura del repositorio

```
/
├── index.html           # solo estructura: enlaza css/ y js/main.js
├── og-image.png         # imagen al compartir el enlace
├── .nojekyll
├── fonts/               # Caveat Brush y Andika (+ licencias OFL)
├── css/                 # estilos, en el orden en que se cargan
│   ├── fonts.css        # @font-face
│   ├── tokens.css       # variables de color y modo oscuro
│   ├── base.css         # reset y estilos base
│   ├── layout.css       # la hoja de cuaderno
│   ├── components.css   # botones, tarjetas, campos, resaltador, Pipo
│   ├── screen-*.css     # una hoja por pantalla (intro, verbs, map, game)
│   ├── modal.css        # ventana modal y confeti
│   └── responsive.css   # tablet, escritorio y movimiento reducido
└── js/                  # módulos ES, sin compilar
    ├── main.js          # punto de entrada
    ├── router.js        # go() y render(); cada pantalla se registra
    ├── state.js         # estado compartido (S: interfaz, R: partida)
    ├── store.js         # localStorage (prefijo pipo2.)
    ├── events.js        # clics, teclado y arrastrar y soltar
    ├── game.js          # reglas: niveles, vidas, aciertos, fin de partida
    ├── verbs.js         # verbos elegidos, comparación, estrellas, errores
    ├── audio.js · confetti.js · utils.js
    ├── data/            # base-verbs.js (los 80 verbos) y config.js (niveles, listas, textos)
    ├── ui/              # pipo.js, icons.js, modal.js
    └── views/           # load, meet, home, verbs, map, game
```

Los 80 verbos están en `js/data/base-verbs.js`, y las listas 1 a 6 se definen en `js/data/config.js` (`LISTS`) por su primer y último verbo. Siguen siendo JavaScript y no un `.json` porque `fetch` tampoco funciona con `file://` y así no hay carga asíncrona.

## Reglas de trabajo para Claude Code

- Hacer los cambios por pasos pequeños y con un commit por cada uno.
- Explicar qué se va a cambiar antes de hacerlo y preguntar si algo no está claro.
- No empezar la fase 2 ni ninguna tarea de la hoja de ruta sin confirmación expresa.
- Mantener el español como idioma de la interfaz y de los comentarios del README.
- No inventar datos de verbos por cuenta propia: los significados están en catalán. Los 30 primeros (be–leave) son tal cual del cuaderno de la autora; los 50 siguientes (bite–write) se redactaron a petición suya y están pendientes de revisión con el profesorado.

## Notas sobre los datos de verbos

- Algunos significados vienen tal cual del cuaderno original: `hear` aparece como "escoltar", que en catalán suele ser _listen_ (para _hear_ se dice más bien "sentir" u "oir"). Pendiente de confirmar con el profesorado.
- `be` acepta `was / were` (o `was/were`) como respuesta del past simple.
- Los verbos con dos formas válidas se escriben separadas por `/`.

## Licencia

- **Código**: [MIT](LICENSE), © 2026 Yuna Espejo.
- **Pipo y la imagen de portada** (el dibujo SVG de la mascota en `js/ui/pipo.js` y `og-image.png`): todos los derechos reservados. Puedes verlos y jugar, pero no reutilizarlos ni redistribuirlos sin permiso.
- **Tipografías** (Caveat Brush y Andika): [SIL Open Font License 1.1](fonts/), con sus licencias en `fonts/`.
