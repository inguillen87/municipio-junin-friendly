# M8 · Informes del histórico propio

Continúa el cierre propio de M7. **Nómina → Reportes → Consultar liquidaciones propias** consulta entre uno y doce meses consecutivos y uno, varios o los siete tipos canónicos existentes. «Seleccionar todos los tipos» consulta cada tipo; no crea un tipo nuevo ni inventa liquidaciones sin cierre.

La fuente es el histórico inmutable de grupos propios. La consulta obtiene todo el censo solicitado, identifica los grupos cerrados y verifica sus cuerpos, huellas, conceptos, importes y cobertura originales. Rechaza fuentes incompletas, grupos duplicados y un contrato repetido dentro del mismo período/tipo. Un mismo contrato en meses o tipos distintos conserva sus participaciones. Los grupos reabiertos permanecen en el histórico de cierre y se excluyen del informe vigente.

## Pedidos de Noelia y recorrido

Fuente privada: módulo 8, nueve páginas, SHA-256 `3eafe9bf6f3190a8aebf2cadab77b2507c285c6c08035d5c1e360aa6b9951ec2`; capturas de pp. 4 y 9 contrastadas para agrupación por convenio/repartición, tipos y rangos. El original y sus imágenes permanecen fuera de Git/CI/Vercel.

1. Elegir meses y tipos; consultar el histórico completo.
2. Elegir planilla por legajo, resumen por período/tipo/convenio/repartición, conceptos por legajo, estadísticas o fuentes y cobertura.
3. Si hace falta, desplegar los rangos inclusivos de legajo, repartición y convenio. Sus códigos originales y ceros iniciales se conservan. Las dimensiones proceden del cierre original, no del destino actual del empleado.
4. Las estadísticas admiten concepto; convenio y concepto; repartición y concepto; convenio/repartición/concepto. Naturaleza y unidad se mantienen separadas entre versiones. Los auxiliares no se suman a haberes ni a los totales originales.
5. Descargar PDF, Excel o CSV voluntariamente. La descarga consulta y reautoriza todas las fuentes, compara la revisión original y cancela el archivo si cambió el histórico, el alcance, la cuenta o la visibilidad. La búsqueda y la página de 25 filas sólo cambian la vista.

Todos los informes conservan precisión decimal exacta mediante aritmética racional. Los importes se exportan como texto decimal para evitar pérdidas de precisión o fórmulas de planilla inesperadas; el resumen y las estadísticas calculan sus sumas exactas antes de exportar. CSV neutraliza fórmulas, Excel conserva textos y PDF incluye todas las filas del alcance.

La consulta usa exclusivamente GET de las fachadas privadas ya publicadas de SQL125, con sus permisos nominales y de revisión existentes. No agrega API, migración, asignación de permisos, guardado, cálculo, confirmación, imputación o pago. Los eventos/consultas fallidas no cambian cuerpos o claves guardados. Se retiran los datos al ocultar la página, cambiar tarea/rango/tipos, cerrar sesión, vencer o revocarse autoridad; no se usa localStorage.

## Cobertura y límites verificables

Un grupo parcial conserva sus cantidades, cobertura y SHA-256 en Fuentes y cobertura. No se presenta como cierre municipal completo por acumular grupos parciales. Un período/tipo sin grupo cerrado aparece sin importes ni netos inventados. El dominio sigue siendo `native_registered`; no certifica que el padrón incorporado desde respaldos esté migrado al motor propio.

La consulta tiene límites explícitos: doce meses, mil grupos, 250.000 participaciones/conceptos y 256 MiB acumulados de respuestas/verificaciones. Cualquier exceso rechaza el conjunto completo; no se recorta, divide o descarga un subconjunto silenciosamente. Se preservan los límites de las APIs y grupos originales y los 2.000 registros de los exportadores anteriores; sólo este layout propio admite la capacidad ampliada.

No se infieren jurisdicción, documento, identidad nominal completa o antigüedad desde el padrón actual; esos campos todavía no están conservados en esta copia histórica. Por ello siguen pendientes variables mensuales/antigüedad de M8-01, agrupación por jurisdicción y orden documental J42/J55 de M8-04/05, formato institucional de la primera hoja del expediente y firmas. No se declara emitido un recibo de M9, pago/acreditación ni XML fiscal.

M9 debe reutilizar estos resultados inmutables con los datos personales y autoridades de emisión adecuados; la firma digital paralela de Hugo/Noelia no se modifica. M10 mantiene el presupuesto anual y su cruce con cargos efectivamente liquidados como otro cierre. Los catorce relojes, PM10 incluido, conservan el circuito común y su aceptación física/cloud pendiente; este incremento no cambia VPN, colectores ni certificados.

## Pruebas y publicación

Pruebas del modelo: censo completo de meses/tipos, 61 legajos, múltiples versiones, dimensiones históricas, precisión/unidad, auxiliares, más de diez mil conceptos, exportación de 2.001 filas, CSV seguro y conservación de cuerpos/huellas. Prueba de producto construido con handler/SQL reales y COMMIT sintético: año y siete tipos, grupos parciales, paginación, los tres archivos reales, móvil, descarga en curso, reapertura, expiración y revocación SQL con auth fixture todavía vigente.

La regresión de volumen reúne 150.000 participaciones sintéticas en treinta grupos de diez meses y tres tipos, con censo, planilla, resumen y CSV completos. Detectó y corrigió un desbordamiento de argumentos al obtener la precisión común; los límites explícitos se mantienen. El recorrido del lector incorporado abre su desplegable mediante el control normal y conserva todas las comprobaciones anteriores.

Los datos, identidades y permisos de QA son explícitamente sintéticos; no representan aceptación municipal. SHA, CI, producción y conservación de trabajo ajeno se acreditan separadamente en `verification/CODEX_OWN_REPORTS_RESULT_20261005.md`. El objetivo integral de diez módulos, actores y todo el parque de relojes continúa activo.
