# PDF conjunto de todos los documentos del rango

## Alcance de la entrega
Integra la preparación de PR #56 con los filtros publicados en PR #57. En Reportes → Documentos por rango de legajos, después de aplicar una corrida y sus rangos, aparece **Preparar y descargar PDF conjunto**. No usa sólo la página visible ni obliga a abrir cada legajo.

La firma digital continúa en el frente de Hugo y Noelia. Este PDF conserva la condición informativa de los detalles originales; no acredita pago, no emite recibos oficiales y no aplica firmas. No cambia fecha de pago, fuentes, permisos, haberes ni el trabajo paralelo del Módulo 9.

## Recorrido completo
La preparación vuelve a leer todas las páginas de la población, conserva los límites inclusivos de legajo/repartición, recalcula su huella completa y exige identificaciones únicas. Lee todos los conceptos de cada documento y compara fecha, período, mes, tipo, dataset y fuente; después relee cada documento y toda la población. Antes de descargar, vuelve a comprobar el acceso y la selección mediante el lector existente.

La portada contiene índice por legajo y páginas de cada documento. Se agregan todos los conceptos y sus controles, conservando fuentes, advertencias, datos ausentes y diferencias. Los nombres y reparticiones siguen siendo los del padrón al corte: no se los presenta como asignaciones históricas de la liquidación.

Si falta un documento, hay vínculos por revisar, cambia una fuente, se pierde el acceso o se cancela, no se entrega un PDF parcial. Se puede corregir el rango y volver a preparar. Un nuevo intento vuelve a leer los datos; no reutiliza un archivo privado guardado en el navegador.

La pantalla muestra las fases de población, lectura, relectura y generación. Cancelar funciona también entre los documentos del renderer. Cambiar rangos/mes/tipo, volver a consultar, ocultar/desmontar la pantalla o retirar los permisos invalida la preparación y evita una descarga tardía.

## Límites y diseño
Se mantienen límites explícitos: hasta 2.000 personas, 50.000 conceptos, 32 MiB y cinco minutos, con un máximo de tres lecturas concurrentes. El límite es de preparación, no una promesa de completitud de un catálogo truncado. Se indica cuándo acotar el rango.

El renderer individual conserva sus bytes en la muestra de regresión. La variante conjunta usa anchos acotados para nombres/descripciones largas y separa cantidad e importe; no reduce precisión ni elimina valores. Los textos que no puede representar fielmente se rechazan en lugar de sustituirse por signos de interrogación.

## Evidencia local
Construcción completa: 5.608 pruebas aprobadas, cero fallos y dos omitidas. 99 pruebas focales de colección, filtros y detalle. Aprobados los recorridos del nuevo panel y las regresiones de filtros, rangos, identidad exacta, accesibilidad del detalle y biblioteca paginada.

La prueba de 55 agentes lee dos páginas completas, relee los 55 documentos y genera 605 conceptos en 168 páginas con índice; repetir desde la página 2 produce la misma población. El rango combinado 20–50 / repartición 02 comprende 21 agentes (20–40) y genera 65 páginas. El caso de tres agentes genera diez páginas.

Se revisaron las imágenes renderizadas y la geometría de los PDF sintéticos: ningún bloque fuera de página, incluyendo una muestra con nombres de 150 caracteres, descripciones largas y cantidades/importes máximos admitidos. No se emplearon documentos municipales en estas pruebas.

La primera propuesta de un verificador amplio fue bloqueada antes de guardarse. El ensayo utilizado monta el panel compilado en loopback y expone únicamente el lector en memoria de fixtures, sin peticiones a APIs municipales. Su modo de publicación descarga sólo archivos públicos, compara cada uno con el build del commit integrado y repite la prueba local usando esos bytes. Las regresiones existentes mantienen la comprobación del centro de reportes completo.

El identificador de merge, estado READY y resultado de CI/publicación se registran al cerrar la PR; las pruebas locales no se presentan como una sesión real de Noelia ni como homologación de recibos. Siguen separados la fecha de acreditación/pago, la descarga propia por agente, los cargos históricos de PR #50 y la aceptación AMARU.
