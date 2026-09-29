# Noelia · TXT 638 AMARU: disponibilidad y control del archivo

## Estado comprobado al comenzar
Base: master `0ef2eccdc9e70c7fa13a82a740f022248f823b6a`. El generador `amaru.txt` ya estaba publicado. Se cotejaron los once archivos del verificador existente contra producción; las diez operaciones anónimas comprobadas, incluida `junin638`, respondieron 401. Una consulta READ ONLY de Neon confirmó `payroll_fixed_registry_junin638_v1` instalada, ejecutable por el rol runtime y no por PUBLIC.

No se usó una sesión personal de Noelia ni se generó un TXT con registros municipales. Las pruebas de descarga y de totales son sintéticas. La aceptación por AMARU no se infiere de un archivo generado correctamente.

## Mejora integrada
Ruta existente: Nómina → Novedades → Novedades fijas → elegir período → Consultar → Descargar TXT 638 · AMARU.

El control explica al lado del botón por qué la descarga no está disponible: registro no consultado, falta de período, falta del permiso de exportación, propuesta local abierta, operación en curso, ausencia de novedades 638 aprobadas/vigentes o identidad pendiente de revisión. No concede permisos ni convierte una propuesta pendiente en aprobada.

Tras generar el TXT aparece un resumen con archivo, período, cantidad de registros, suma exacta de los importes, tamaño en bytes y SHA-256. El resumen no expone nombres, DNI, identificadores de contrato/propuesta ni el token de autorización. Se retira al cambiar período, volver a consultar o invalidarse el contexto.

El resumen se calcula desde los mismos bytes que se descargan y se compara con la serialización completa del snapshot validado. Los centavos se suman como enteros; no se redondean ni se deducen importes faltantes. Se comprueba nuevamente el permiso y contexto antes de entregar la descarga.

## Contrato preservado, no homologación inventada
No se modificó `assets/payroll-junin-638.js` ni la migración 108. Se mantiene Formato Junin: nombre `amaru.txt`, 55 bytes por registro, DNI desplazamiento 5/longitud 8, importe desplazamiento 44/longitud 11. CRLF entre registros sin terminador final sigue siendo una convención técnica de MuniControl, no un requisito del receptor demostrado por el respaldo.

El TXT conserva todas las novedades 638 aprobadas y vigentes del período: ni la búsqueda visual ni la página limitan su población. Una identidad por revisar no se omite para producir un archivo aparentemente completo. El control deja visible que el archivo no fue enviado a AMARU y que su aceptación sigue sin verificarse.

## Evidencia ejecutada
29 pruebas nuevas; 39 focales con las diez existentes de 638. Construcción completa: 5.725 aprobadas, cero fallos y dos omitidas. El recorrido real compilado pasó 43 escenarios (37 anteriores y seis nuevos), incluyendo respuesta parcial, snapshot desactualizado, DNI/importe inválidos, búsqueda que no recorta el TXT, resumen sin identidades y visualización a 320/390 px. El ejemplo sintético de dos filas produce 112 bytes y $2.625,00; la huella mostrada coincide con el archivo descargado.

La reproducción preliminar de pérdida de permiso durante una respuesta sintética ya produjo cero descargas en la base anterior; no se declara haber corregido una fuga demostrada. Se mantiene ese comportamiento y se añade una comprobación explícita antes de guardar. Una ampliación opcional del ensayo de ciclo de vida fue bloqueada antes de guardarse y no se aplicó ni reintentó. Los seis escenarios añadidos corresponden al resumen, disponibilidad, alcance y retiro por cambio de período que efectivamente se ejecutaron.

Las regresiones del laboratorio de liquidación y del analizador de archivos se ejecutan separadamente. CI, commit integrado y validación de los archivos realmente publicados se registran en la PR después de su aprobación; la evidencia local no acredita por sí sola una publicación.

## Pedidos de Noelia: no confundir este cierre con el plan completo
La generación del TXT 638 y sus controles técnicos están implementados; falta la aceptación de un archivo real por AMARU. Recibos tienen selección por rangos, PDF conjunto y fecha declarada, pero la descarga propia por agente y el circuito institucional completo no están cerrados. La firma digital sigue con Hugo y Noelia, sin modificaciones de este frente.

La estructura presupuestaria entregada contiene cargos, cantidades y ocupantes; el pedido del módulo 10 exige cotejar cargos liquidados con presupuestados de cada año y obtener el detalle PDF. La integración histórica de PR #50 no está terminada. También continúan la consolidación de varios períodos del mismo legajo, el cálculo salarial propio y la integración contable/homologaciones. Esta mejora de TXT no sustituye esos cierres ni la prueba personal de Noelia.
