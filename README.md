# Pipo y los verbos irregulares

Juego web educativo para aprender los verbos irregulares del inglés (infinitivo, past simple y past participle), pensado para alumnado de 1º de ESO. Se juega rellenando una tabla como la de un cuaderno, con una mascota (Pipo) que tiene vidas, da consejos y reacciona a los aciertos y errores.

Proyecto personal de Yuna: también es una pieza de portfolio (yunaespejo.com) y una base para crecer hacia clases con profesor y ranking.

## Estado actual (fase 1)

Todo vive en un único archivo, `index.html` (HTML, CSS y JavaScript sin dependencias ni paso de compilación). Ya funciona:

- Pantalla de carga y presentación de Pipo (3 pasos, con nombre opcional).
- Elección de verbos: 30 verbos de base, filtros rápidos (Lista 1, Lista 2, Todos, Ninguno, Solo los míos) y buscador. Se pueden añadir y borrar verbos propios.
- Tres dificultades (Fácil, Normal, Difícil) que cambian cuántos huecos hay y cuántas fichas trampa aparecen.
- Mapa de 5 niveles que se desbloquean en orden y dan hasta 3 estrellas:
  1. Calentamiento · 2. En marcha · 3. Sin red (puede faltar el infinitivo) · 4. Con trampas (fichas falsas tipo `breaked`) · 5. Escribe tú (sin fichas, se escribe).
- Sistema de vidas: 5 vidas, se pierde una por error y se gana una cada 10 aciertos seguidos. Si llega a 0, Pipo "muere" y se puede reintentar.
- Repaso de errores: guarda los verbos que más se fallan y ofrece una ronda con ellos.
- Sonidos (se pueden silenciar), confeti, modo oscuro automático, diseño responsive (móvil y escritorio).

Los datos del jugador se guardan solo en el navegador (`localStorage`, claves con prefijo `pipo2.`): nombre, dificultad, verbos elegidos y propios, estrellas, errores y sonido. No se envía nada a ningún servidor.

## Lo que hay que hacer ahora

Solo esto. Lo demás de este documento es contexto y hoja de ruta, no tareas inmediatas.

1. Alojar las fuentes en el propio repositorio (Caveat Brush y Patrick Hand, por ejemplo con `@fontsource`) y sustituir el `<link>` de Google Fonts por `@font-face` locales en `fonts/`.
2. Dejar el proyecto listo para GitHub Pages: `index.html` en la raíz, `.nojekyll`, `README.md`.
3. Inicializar git, hacer el primer commit y explicar cómo crear el repositorio y activar Pages (Settings → Pages → rama `main`).
4. Añadir una etiqueta `<meta name="description">` y las etiquetas Open Graph básicas para que se vea bien al compartir el enlace.

No cambiar la lógica del juego ni el diseño. No añadir librerías ni frameworks.

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
- **Tipografías:** Caveat Brush para títulos y Patrick Hand para el resto.
- **Mascota:** Pipo, un SVG en línea con varios estados de ánimo (normal, feliz, pensativo, dolido, eufórico y "muerto").
- **Sin emojis en la interfaz**, solo iconos SVG.
- **Accesibilidad:** foco visible, `aria-live` en el globo de Pipo, objetivos táctiles de al menos 44 px y respeto a `prefers-reduced-motion`.
- **Responsive:** una columna en móvil, dos columnas desde 960 px.

## Estructura prevista del repositorio

```
/
├── index.html        # juego completo (de momento todo en un archivo)
├── fonts/            # fuentes alojadas en el propio repositorio
├── .nojekyll
└── README.md
```

Más adelante, si el archivo crece, separar en `css/`, `js/` y `data/verbs.json` (los 30 verbos base están ahora en el array `BASE` dentro de `index.html`).

## Reglas de trabajo para Claude Code

- Hacer los cambios por pasos pequeños y con un commit por cada uno.
- Explicar qué se va a cambiar antes de hacerlo y preguntar si algo no está claro.
- No empezar la fase 2 ni ninguna tarea de la hoja de ruta sin confirmación expresa.
- Mantener el español como idioma de la interfaz y de los comentarios del README.
- No inventar datos de verbos: los significados están en catalán, tal como aparecen en el cuaderno de la autora.

## Notas sobre los datos de verbos

- Algunos significados vienen tal cual del cuaderno original: `hear` aparece como "escoltar", que en catalán suele ser *listen* (para *hear* se dice más bien "sentir" u "oir"). Pendiente de confirmar con el profesorado.
- `be` acepta `was / were` (o `was/were`) como respuesta del past simple.
- Los verbos con dos formas válidas se escriben separadas por `/`.

## Licencia

Por decidir.
