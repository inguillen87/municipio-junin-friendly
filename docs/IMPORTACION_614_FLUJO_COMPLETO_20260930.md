# Importación original por DNI: cierre funcional del caso 614

## Requisito y fuente
Noelia identifica dos necesidades distintas en los audios del 29/09: importar los TXT originales con su formato/concepto, y anular/procesar la liquidación para controlar los resultados. En el audio de 19:46:24 propone comenzar con el código 614 y comprobar que, por ejemplo, catorce registros recibidos produzcan catorce registros cargados. En el de 19:50:14 prioriza importación y anular/procesar; la exportación puede seguir después. En 19:47:35 precisa que la devolución es **Exportación descuentos** de GRH, no este formulario de entrada.

La transcripción local se cotejó con las huellas de los audios adjuntos: 19:31:10 d38b6fb9…; 19:44:52 ab9da855…; 19:46:24 f33f2b17…; 19:47:35 7e3c84ad…; 19:50:14 7ac1d308…. Las repeticiones con otro nombre contienen los mismos bytes. No se toma una palabra o código dudoso de la transcripción como fórmula salarial.

La fuente real del caso es `614082026.txt` dentro de la carpeta CAJA DE AHORRO- SEGURO de AGOSTO.zip: SHA-256 `7df66651900b28a68ec77bbc4c78a726cefc491a358658ca1be74da33da04fb1`, doce registros y doce DNI únicos. El lector estructural previamente ejecutado preservó esos doce DNI e importes, sin resolver identidad ni guardar novedades. El ejemplo hablado de catorce registros no se convierte en una afirmación de que ese archivo real contiene catorce.

El diseño de **Formato Junín** está contrastado con formatoitem del respaldo del 22/09 y GRH_WEB en vivo el 29/09: 55 posiciones, DNI desde offset 5/longitud 8 e importe desde offset 44/longitud 11, con punto y dos decimales. Se conservan las posiciones desde cero; no se interpreta DNI como legajo.

## Entrega
Ruta visible desde Novedades: **Importar TXT de GRH**. Pantalla `importar-novedades-grh.html` con formato conocido, concepto y período explícitos, tipo mensual, archivo original, previa completa y guardado del lote.

La fuente autorizada resuelve DNI contra personas/contratos GRH activos que coinciden con municipio, empresa, base, versión publicada y mes del contrato. No hay emparejamiento por nombre. Dos contratos de la misma persona requieren elección explícita y una nueva revisión; DNI duplicado entre personas distintas requiere corrección de identidad. Ausentes, duplicados o cambios no habilitan guardado parcial.

La previa conserva todas las filas, importes y hash del archivo. Búsqueda y paginación sólo cambian la vista. El botón vuelve a comprobar fuente y vínculos antes de escribir. La llamada a la facade de preparación existente y sus verificaciones de identidad/recibo se ejecutan en una sola sentencia PostgreSQL: si una postcondición falla, la inserción y auditoría se revierten juntas.

El resultado muestra entradas, guardadas, omitidas e identificador de lote. Un acuse perdido o inválido conserva el cuerpo y la clave de la misma operación para reintentar sin duplicar el lote. Un cambio de autoridad retira la información nominal. No se guarda en localStorage ni sessionStorage.

## Alcance exacto
El resultado es un lote de novedades **en borrador**, no una liquidación calculada, un pago ni un recibo oficial. Se continúa su revisión en el circuito existente. No se renombra cancelar lote como anular liquidación. No se cambia la firma digital con Hugo y Noelia.

Se admite Formato Junín mensual completo hasta el límite vigente de 500 filas; otros diseños no se cargan bajo ese nombre. OSEP de 759 filas, escala por concepto, variantes de 185/206 posiciones y valoración/recálculo salarial siguen pendientes. No se cambia el límite silenciosamente ni se divide un archivo en lotes parciales.

## Pruebas ejecutadas antes de integrar
123 pruebas focales de lector, servicio, contrato cliente, API y autorización. Construcción completa local: 5.909 aprobadas, cero fallos y dos omitidas. Dieciocho recorridos de la página compilada utilizando el control de acceso JavaScript real, el handler HTTP real y los servicios reales; únicamente identidad/SQL utilizan datos y respuestas sintéticas. Casos de 12, 14, 60 y 501 filas; cambio de período/concepto, identidad ambigua, fuente cambiada, pérdida de permisos, cancelación y mismo reintento tras acuse inválido. Las pruebas sintéticas no acreditan la sesión personal de Noelia.

PostgreSQL 17 desechable: quince comprobaciones de la consulta exacta de candidatos y diez de preparación atómica con las facades reales, además de 359 comprobaciones heredadas. Los ensayos hacen ROLLBACK y no utilizan datos municipales. Incluyen rechazo anterior al guardado y rechazo posterior a una inserción real de prueba, comprobando que tampoco persiste la auditoría. El andamiaje de capacidades/SoD heredado sigue siendo sintético: no se confunde con una prueba nueva de IAM productivo.

Las regresiones existentes de TXT genérico/RETRO, novedades nativas, controles de lote y grilla masiva también aprobaron. El caso de anular/procesar liquidación no está entre esas pruebas y no se declara cerrado.

Durante el ensayo se encontró que el control real de capacidades devuelve Set, mientras que una primera simulación devolvía Array. Se corrigió el consumidor y se sustituyó el doble del script por el script real antes de aceptar el recorrido. También se corrigió el botón oculto que conservaba un estado habilitado después de invalidar la previa. Ninguna corrección cambia roles o permisos de la base.

El nuevo preflight conserva la política de la facade: el vínculo laboral propio del operador no se inventa como condición adicional de preparación; la autorización y las condiciones de aprobación siguen resueltas por los controles existentes. No se habilita al operador para aprobarse su lote.

## Coordinación y publicación
Se detectaron cambios concurrentes en el worktree compartido de PR #64. Se aisló esta entrega en `work/grh-intake-ui-20260930` para no sobrescribirlos. Se conservan los lectores estructurales de PR #64; la integración de OSEP no se da por terminada al cerrar el caso 614.

No hay migraciones nuevas, tablas, permisos, funciones SQL alteradas ni un segundo escritor de novedades. La API existente agrega dos comandos con las mismas comprobaciones de sesión, origen, JSON, capacidad, fuente e idempotencia. No se crea una novedad real de prueba en el municipio ni se utiliza la sesión de Noelia para validar código.

Los resultados de CI y el SHA/estado efectivo del despliegue se documentan tras ejecutar la publicación. No inferir producción a partir de este documento o de una prueba local.
