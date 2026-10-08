# Novedades: lotes completos hasta 2.000 filas

El escritor mensual anterior admitía 500 filas, aunque la previa del Formato Junín podía revisar archivos mayores. Esta ampliación permite guardar un lote completo de hasta 2.000 filas en los formatos ya habilitados. La búsqueda y las páginas sólo cambian la vista. Nunca se guardan las primeras 500 ni se divide el archivo en lotes ocultos.

La capacidad se consulta en la base vigente. Mientras la instalación técnica no se haya aplicado, una base que informa 500 sigue bloqueando expresamente los archivos mayores. La preparación individual nativa conserva su límite de una fila. Se mantienen los límites de bytes y de longitud de los campos; aumentar la cantidad no habilita textos libres más largos.

El guardado crea un borrador. No calcula, aprueba, confirma, anula ni paga haberes. OSEP necesita su propio formato validado y permanece pendiente; probar un lote sintético de 759 filas no valida un archivo OSEP.

## Controles conservados

- La identidad, el período, el contrato, las capacidades y la fuente se comprueban antes de guardar; el recibo se contrasta con todas las filas originales.
- Una falla en la última fila revierte el lote y su auditoría. Un reintento conserva el cuerpo, la clave y el token de la previa; no duplica la operación.
- Cambiar archivo, concepto, período o vínculo invalida la revisión. Ocultar la pantalla o retirar permisos retira los datos privados.
- El reporte CSV de incidencias sigue incluyendo todas las páginas y sólo informa fila, estado y acción sugerida. La búsqueda no recorta el reporte.

## Instalación técnica

`scripts/prepare-monthly-batch-capacity-installation.mjs` genera un lote revisable vinculado al commit exacto. No conecta ni ejecuta SQL. Se aplican tres funciones existentes y tres restricciones, sin tablas nuevas ni cambios de permisos. Las migraciones históricas 026 y 101 se mantienen intactas.

La instalación exige los cuerpos originales y los metadatos revisados. Las dos representaciones equivalentes de la restricción de cantidad observadas en PostgreSQL se verifican como textos exactos. La validación de ordinales admite cuatro dígitos y mantiene el máximo numérico de 2.000. El control de conservación compara filas, secuencias, objetos, funciones, permisos y los demás metadatos antes y después; cualquier diferencia ajena revierte la transacción. Repetir la instalación verifica el estado ya aplicado.

Se usan exclusivamente las dos bases existentes de MuniControl, primero PG18 y después PG17. La comprobación durable se realiza en una conexión posterior, sin escrituras de negocio ni devolución de filas nominales.

## Verificación

La suite SQL ejecuta las funciones reales en PostgreSQL 17 y 18 con contratos sintéticos y rollback final. Prueba lotes de 759 y 2.000 filas, cero explícito, última fila, reintentos, rechazo de 2.001 y reversión de precondiciones y postcondiciones. Conserva las 359 comprobaciones heredadas.

El navegador usa el frontend compilado y el handler HTTP real con SQL simulado. Comprueba lotes completos, filtros, recibos, recuperación, revocación, invalidación, reporte sin datos personales y controles accesibles a 1.440, 390 y 320 píxeles. La suite SQL separada acredita la atomicidad real. La aceptación con archivos y cuentas municipales corresponde a Noelia y no se deduce de estas pruebas.
