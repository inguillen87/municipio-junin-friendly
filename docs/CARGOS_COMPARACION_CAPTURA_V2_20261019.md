# Comparación de cargos y capturas originales V2

La comparación anterior verificaba la población como una lista de empleados. Las capturas enriquecidas de nómina también incluyen fuentes originales de días y otras reglas aprobadas; su huella corresponde a ese objeto completo. El contrato V2 selecciona el dominio de la captura original y conserva íntegra su entrada y resultado, sin reinterpretar el histórico con el padrón actual.

La API incorpora dos recursos explícitos de lectura, `annual-v2` y `detail-v2`. El panel solicita ambos y verifica las respuestas. Los recursos V1 conservan su contrato; una respuesta V1 o la ausencia del lector V2 produce un error seguro, sin cambiar de lector automáticamente. Continúan las verificaciones de sesión, municipio, fuente certificada y todos los permisos existentes.

Cada captura se incluye una sola vez. La población original completa se distingue del subconjunto cerrado. La verificación enlaza empleados, reglas, precisión, versiones de fuentes y resultado con el programa capturado. Una modificación coherente de los datos guardados y sus huellas no puede sustituir las fuentes originales.

## Comprobación local

- 75 pruebas focales aprobadas, cero fallos y cero omisiones. Incluyen las dos consultas de API que antes devolvían 400 y cuatro casos de alteración de fuentes que fallaban antes de corregir el verificador.
- Compilación estática aprobada.
- 44 comprobaciones de navegador con panel y handler HTTP reales, datos sintéticos y doble estricto de la frontera SQL. Se verificaron población original de tres personas con una cerrada, y otro alcance de 52 filas con paginación y búsqueda.
- CSV, Excel y PDF conservaron las 52 filas y las cantidades originales completas. Se comprobaron cambio de fuente entre lecturas, revocación, ocultamiento, ausencia del lector V2 y pantallas de 1440, 390 y 320 píxeles.

## Pendiente para publicar

Esta entrega no instala ni ejecuta SQL. El sucesor SQL198 continúa como candidato privado. Falta cerrar su instalación y preservación sobre el contexto canónico, los escritores administrativos de presupuesto y asignaciones, y las pruebas PostgreSQL17/18 con las capturas reales del circuito sintético conjunto. La prueba de navegador usa un doble SQL; no demuestra esas propiedades de PostgreSQL ni aceptación municipal.

El panel no debe publicarse hasta disponer del lector V2 validado. Esta entrega no calcula, confirma, anula, cierra ni paga liquidaciones productivas y no completa por sí sola el objetivo municipal.
