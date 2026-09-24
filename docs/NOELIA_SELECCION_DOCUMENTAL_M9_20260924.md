# Noelia · módulo 9.A: selección documental por rangos

## Requisito y alcance

El documento de Noelia «9. RECIBOS», página 1, pide: desde/hasta legajo; desde/hasta repartición; período; fecha de acreditación o pago; tipos; PDF; firma digital; y descarga por cada agente. Este incremento implementa la selección y consulta del documento disponible, no toda la emisión de recibos.

El módulo 10 pide confrontar cargos liquidados con los presupuestados del ejercicio y obtener el detalle en PDF. Su reporte de 51 páginas, fechado el 23/09/2026, se mantiene como fuente documental independiente. No se utiliza como padrón salarial del módulo 9 ni se interpreta Cant como cupo anual aprobado.

## Recorrido

Centro de reportes → Documentos por rango → Consultar liquidaciones → elegir fecha y tipo → completar rangos → Aplicar selección. Un vínculo único permite abrir sus conceptos en la misma sección, sin volver al listado general de legajos.

La selección recorre el conjunto completo antes de paginar. Los rangos son inclusivos y numéricos: el sector 2 precede al 10. Se conservan los números originales; referencias como 1 y 01 no se fusionan. Los homónimos no se agrupan por nombre.

Se muestran legajos del filtro, vínculos únicos y vínculos por revisar. La distribución por repartición corresponde a toda la selección; la tabla dibuja 25 filas por página. Modificar rangos retira el resultado anterior y exige aplicar la nueva consulta. Cancelar impide que una respuesta tardía restaure los datos.

## Corte administrativo y liquidación

La repartición al corte es el sector del padrón certificado. No es una asignación histórica reconstruida para la liquidación. La pantalla distingue el corte del padrón, la fecha de liquidación, el período de origen y el tipo. El corte se transporta como instante UTC explícito y se presenta en hora de Mendoza.

Los códigos no numéricos o desconocidos quedan fuera de un rango numérico; se informa su cantidad sobre el conjunto completo. Los vínculos ausentes, ambiguos o incompletos no reciben una acción que adivine la identidad o el documento.

La huella de selección se conserva al paginar. Si cambia la fuente o el alcance, la lectura se retira: no se mezclan páginas ni se convierten fallos en cero legajos.

## Documento individual

Se reutiliza el lector existente con el contrato y el conjunto exactos. El detalle incluye ahora nombre, legajo, período, tipo y fecha junto a sus conceptos. Cerrar ese detalle mantiene la selección principal.

La exportación individual existente vuelve a autorizar y verificar el documento. El resultado sigue identificado como detalle informativo sin firma. No se agregó un emisor de recibos ni una descarga masiva; tampoco se asignó una fecha de pago ficticia.

## Estado por requisito

| Requisito de Noelia | Resultado de este incremento |
|---|---|
| Desde/hasta legajo | Selección completa en servidor con límites inclusivos. |
| Desde/hasta repartición | Selección por sector del padrón certificado al corte mostrado. La asignación histórica exige otro cierre. |
| Período y tipo | Se elige una corrida concreta; su período original se muestra al consultar. |
| Acreditación/pago | No informado: exige evidencia propia, no derivación de la fecha de nómina. |
| PDF | Acceso al detalle individual informativo existente. No emisión oficial por lote. |
| Firma digital | Pendiente del circuito de emisión y validación de firma. |
| Descarga por agente | Pendiente de identidad propia vinculada y publicación autorizada. |

## Acceso y consistencia

El recurso `payrolldocumentbatch` exige sesión municipal gestionada, nómina, legajos y vinculación certificada de fuente. Reutiliza el lector autorizado del padrón salarial antes y después de leer el directorio. El manejador general verifica también la huella de la fuente al principio y al final.

La respuesta no incorpora DNI, CUIL, sexo, cuentas ni importes del padrón auxiliar. Cada página sólo muestra las referencias seleccionadas y su vínculo. Los conceptos financieros se consultan por separado al abrir un documento mediante la autorización existente.

No se crean permisos, tablas, migraciones ni decisiones salariales. Las lecturas del padrón conservan su auditoría existente. Se invalidan datos al cancelar, cambiar los filtros, cambiar de contexto o perder acceso, incluso cuando la denegación ocurre al abrir el detalle individual.

## Verificaciones de desarrollo

Las 39 pruebas nuevas cubren rangos, claves originales, paginación, ambigüedad, retiro por cambio de fuente, denegación, sesión gestionada y ausencia de datos auxiliares innecesarios.

La prueba de PostgreSQL ejecuta las consultas reales con tablas temporales y registros sintéticos, en una base local específica y un servidor loopback. Verifica nueve condiciones de origen y aislamiento y termina con rollback. No utiliza sesiones ni datos municipales.

También se comprobó que ambas consultas pueden planificarse sobre el esquema real de MuniControl mediante EXPLAIN sin ANALYZE. Esa comprobación fue de estructura y alcance, no una prueba funcional con la sesión de Noelia. El origen seleccionado continuaba fechado el 10/09; no se promovió otro respaldo.

Los recorridos del navegador verifican la página integrada, apertura individual, exportación informativa existente, filtros, cortes, cancelación, móvil y revocación con respuestas sintéticas. CI, commit, despliegue y coincidencia de archivos publicados se acreditan por separado en el registro de entrega.

## Próximos cierres que permanecen abiertos

Emisión por lote con evidencia propia; fecha de pago; validación de firma digital; publicación y descarga por sujeto; repartición histórica de la corrida. Para el módulo 10 siguen pendientes cupo aprobado, cargo/clase/jurisdicción y conciliación presupuestaria homologada. Los relojes, la incorporación del 22/09 y el circuito de aprobación y novedades mantienen sus fases anteriores.

## Aceptación final local

El build completo pasó 4.941 pruebas, cero fallos y dos omitidas. La selección integrada aprobó 15 recorridos de navegador; el Centro de reportes conservó sus 22 recorridos; el detalle individual y su biblioteca aprobaron 13 recorridos cada uno. El escenario nuevo incluye revocación durante la lectura individual, no sólo durante la consulta principal.

PostgreSQL 17 aprobó los nueve controles SQL con rollback de las tablas temporales. Se verificó en el esquema real que source_cutoff es timestamptz; el transporte usa UTC y el navegador muestra 15:17:30 de Mendoza para el corte del 10/09. No se utilizó ese examen de metadatos como sustituto de una sesión municipal de aceptación.

La aceptación y los datos de las capturas son sintéticos. No se presenta la cantidad de pruebas como demostración de emisión oficial, firma o puesta al día del respaldo.
