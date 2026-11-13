# Política de privacidad de «Pipo y los verbos irregulares» — BORRADOR

> **Estado: borrador. No está publicada ni enlazada desde el juego.** No es asesoramiento legal. Antes de activar el
> ranking de clases hay que revisarla con una persona experta (protección de datos y menores) y completar los
> campos marcados con **[PENDIENTE]**. Mientras tanto, el juego no envía ningún dato a ningún servidor.

## 1. Quién es responsable

**[PENDIENTE: nombre o razón social, dirección de contacto y correo de contacto de la persona o entidad responsable.]**

Si el juego se usa en un centro educativo, el centro también tiene responsabilidad sobre el tratamiento de los datos de
su alumnado y debería indicarlo en su propia información a las familias.

## 2. Qué es esto, en pocas palabras

Pipo es un juego para aprender los verbos irregulares del inglés. **Se puede jugar sin clase y sin enviar ningún dato.**
Solo si el profesorado crea una clase y el alumnado se une a ella, se guardan unos pocos datos en un servidor para poder
mostrar un ranking de la clase.

## 3. Qué datos se guardan

**Siempre, en tu propio dispositivo (no se envían a ningún sitio):** el apodo, la dificultad elegida, los verbos
seleccionados, las estrellas, los verbos que más fallas y si el sonido está silenciado. Se guardan en el
almacenamiento local del navegador (`localStorage`). Puedes borrarlos desde los ajustes del navegador.

**Solo si te unes a una clase, en el servidor:**

| Dato                                                                                 | Para qué                                           |
| ------------------------------------------------------------------------------------ | -------------------------------------------------- |
| Apodo (2 a 20 caracteres)                                                            | Mostrarte en el ranking de tu clase                |
| Código de la clase                                                                   | Saber a qué clase perteneces                       |
| Resultados de cada partida: nivel, dificultad, aciertos, errores, estrellas y puntos | Calcular y mostrar el ranking                      |
| Un código secreto aleatorio (solo se guarda su huella, no el código)                 | Reconocer tu navegador sin pedir contraseña        |
| Fecha y hora de cada partida                                                         | Limitar envíos excesivos y borrar clases inactivas |

**Quien crea una clase** (profesorado) guarda además el nombre de la clase (por ejemplo «1º ESO B») y una clave secreta
aleatoria (solo se guarda su huella).

**No pedimos ni guardamos:** nombre real, apellidos, correo electrónico, teléfono, foto, ubicación ni identificadores
de dispositivo. **Te pedimos que no uses tu nombre real como apodo.**

Como en cualquier servicio de internet, el proveedor técnico puede tratar de forma temporal datos técnicos de la
conexión (como la dirección IP) para que el servicio funcione y sea seguro. **[PENDIENTE: confirmar con el proveedor y
con la persona experta qué registros técnicos se conservan y durante cuánto tiempo.]**

## 3 bis. Cookies y analítica

El juego **no usa cookies**, ni de terceros ni propias, y **no incluye analítica ni publicidad**. Si esto cambiara,
se informaría antes y se pediría permiso cuando la ley lo exija.

## 4. Con qué base y para qué

- **Finalidad:** mostrar un ranking dentro de una clase y permitir al profesorado gestionarla. Nada más. No se
  elaboran perfiles ni se toman decisiones automatizadas sobre nadie, ni se usan los datos para publicidad.
- **Base legal: [PENDIENTE].** El público habitual tiene 12-13 años. En España, el tratamiento de datos de menores de
  14 años basado en el consentimiento exige el de sus padres o tutores (art. 7 de la LOPDGDD). Hay que decidir con la
  persona experta si el consentimiento lo recoge el centro educativo o la propia aplicación, y cómo se acredita.
  **El juego no debe activar el ranking hasta resolverlo.**

## 5. Quién ve esos datos

- **Tu clase** ve tu apodo y tus puntos en el ranking. Nadie fuera de la clase lo ve sin conocer su código.
- **Proveedor de la base de datos:** Supabase (encargado del tratamiento), con servidores en la **Unión Europea**
  **[PENDIENTE: confirmar región (Frankfurt, eu-central-1) y firmar/aceptar su contrato de encargado del tratamiento].**
- No se venden ni se ceden los datos a nadie más.

## 6. Cuánto tiempo se guardan

- Una **clase sin ninguna partida en 12 meses se borra sola**, con todos sus alumnos y resultados.
- Puedes borrar tus datos cuando quieras (apartado 7), y el profesorado puede borrar a un alumno o toda la clase.

## 7. Tus derechos y cómo ejercerlos

Puedes acceder a tus datos, corregirlos, pedir que se borren, oponerte al tratamiento y limitarlo.

- **Borrar tus datos de la clase:** desde el propio juego (opción «Salir de la clase y borrar mis datos»)
  **[PENDIENTE: pantalla por construir]**. Se borran tu apodo y todas tus partidas.
- **El profesorado** puede borrar a un alumno o la clase entera con su clave de profesor.
- **Por escrito:** a **[PENDIENTE: correo de contacto]**. Las familias de menores de 14 años pueden ejercer estos
  derechos en nombre de sus hijos o hijas.
- Si crees que tus datos no se tratan bien, puedes reclamar ante la **Agencia Española de Protección de Datos**
  (www.aepd.es).

## 8. Seguridad

- Los datos se guardan en tablas cerradas: el juego solo puede usar un pequeño conjunto de operaciones controladas
  (unirse, enviar una partida, ver el ranking, borrar).
- Los códigos secretos (del alumno y del profesorado) no se guardan, solo una huella irreversible (SHA-256).
- Los puntos los calcula el servidor, que rechaza partidas imposibles.
- Ningún sistema es infalible. Por eso guardamos lo mínimo: un apodo y resultados de un juego.

## 9. Cambios en esta política

Si cambia, se publicará aquí la nueva versión con su fecha. **[PENDIENTE: fecha de la versión.]**

---

## Anexo para quien revise este borrador (no se publica)

Lo que hay implementado, para contrastarlo con el texto de arriba. Todo está en `supabase/migrations/0001_clases_y_ranking.sql`
y se prueba en `tests/db/schema.test.js`.

- Tablas `classes`, `players` y `runs`, cerradas (RLS activado, sin ninguna política y sin permisos para `anon`).
- Siete funciones públicas: `create_class`, `join_class`, `submit_run`, `class_ranking`, `leave_class`,
  `teacher_remove_player` y `teacher_delete_class`.
- Secretos de 128 bits aleatorios; solo se guarda el SHA-256.
- Límite de 60 alumnos por clase y de un envío cada 10 segundos por alumno.
- Limpieza `private.purgar_clases_inactivas()` (12 meses), **pendiente de programar en el panel de Supabase (pg_cron).**
- Cosas **sin hacer** que esta política da por hechas o pendientes: pantalla de «Salir de la clase y borrar mis datos»,
  base legal y consentimiento, registros técnicos del proveedor, contrato de encargado del tratamiento.
