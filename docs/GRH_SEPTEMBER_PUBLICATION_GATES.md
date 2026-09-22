# Publicación coordinada de la fuente GRH de septiembre

Este documento describe el cambio y sus gates. No constituye un recibo de publicación: el commit, los resultados de CI, la instalación y la lectura posterior en producción se certifican por separado.

El respaldo S11 tiene corte **10/09/2026 15:17:30**, huella lógica **5a604acfe5ea32832b630d8aab29e494038d4c8940b231e283a53d14112665c7**. La nómina de septiembre está abierta; agosto es el último mes cerrado. El corte no acredita datos posteriores al día 10, pagos ni liquidaciones calculadas por MuniControl. Detalles, documentos, bancos y homologaciones conservan sus fuentes propias.

## Evidencia y almacenamiento

La copia privada de producción PG17 se restauró con 167 tablas, 893.963 filas y 380 funciones, conservando dueños y permisos. El ajuste de search_path fue de la sesión de restauración. El ensayo con copia completa de curadas y staging alcanzó 586.289.540 bytes y fue revertido por capacidad, manteniendo agosto operativo.

La alternativa compacta conserva las tablas originales, sus claves y su staging. Guarda diferencias selladas, referencias reales de corridas, la foto actual y la conciliación. El ensayo integral del 22/09 reconstruyó exactamente las cinco entidades de la fuente mediante conteos y huellas; alcanzó 509.003.304 bytes para todas las bases/templates del cluster local. Conservó el límite de 512 MiB y la reserva permanente de 16 MiB. El crecimiento y la capacidad deben volver a medirse en cada destino.

| Entidad | Agosto | Septiembre | Evidencia del cambio |
|---|---:|---:|---|
| Corridas |620|624|2 corregidas y 4 nuevas; identificadores persistidos reales.|
| Foto salarial |854|847|Son cortes distintos; ausencia de foto no acredita baja laboral.|
| Movimientos |489459|495237|2 correcciones, 5791 altas y 13 ausencias de claves.|
| Hechos mensuales |214164|216411|811 correcciones, 2248 altas y 1 ausencia; importes exactos.|
| Conciliación |2450|2452|855 cambios y 2 altas; 875 activos proxy y 28 fuera de la foto.|

Las reconstrucciones completas del ensayo coincidieron con los sellos de los artefactos, incluidos NULL y decimales. No se copian nuevamente los 216.411 hechos ni los 495.237 movimientos. Las tablas de operaciones propias, familias, certificados y eventos se bloquean y comparan antes/después; las fechas escolares de agosto permanecen en su recuperación histórica.

El ensayo durable posterior confirmó COMMIT local y replay desde una conexión independiente, con 508.290.600 bytes de cluster. Las rutas reales del API devolvieron los conteos y cortes esperados: directorio 2452/875/847, último cierre con 854 contratos, septiembre abierto con 855 contratos en sus corridas y 624 corridas históricas. Cada consulta individual quedó por debajo de cinco segundos en ese equipo; el análisis de ausencias sumó 9,18 segundos al ejecutarse sus once consultas serialmente. La fachada de historial con sesión real quedó pendiente de producción porque la sesión restaurada había vencido; sí se comprobó su proyección histórica. Estas mediciones locales no prometen latencia de Neon.

La copia PG17 permite recuperar espacio físico reindexando, sin eliminar filas. El orden preparado y ensayado usa pasos independientes, medición fresca antes de cada uno y comprobación de huellas, restricciones, OID y validez después. El índice anterior se libera al confirmar cada paso. Los índices de fuentes históricas usan fillfactor 100; los de identidad, contratos y asistencia conservan su configuración. El mantenimiento reserva 4 MiB transitorios, más margen del índice y overhead; la publicación exige nuevamente 16 MiB permanentes. No se cambian planes ni conexiones. La proyección de ahorro no sustituye el tamaño real de Neon.

## Implementación

- 096 agrega selección explícita por tenant/binding y vistas tipadas de corridas, hechos y movimientos. Congela las bases necesarias para reconstruir la fuente.
- 097 adapta siete funciones instaladas y metadatos. Las definiciones previas y posteriores se verifican por huella, sin reescribir las migraciones históricas.
- 098 agrega diferencias de las cinco entidades curadas, vistas por corrida real y vistas actuales. El staging candidato es una proyección verificable de esas fuentes. Sus sellos comprueban claves, tipos, hashes y relación con 061.
- 099 adapta 18 consumidores curados y sus bloqueos, conservando permisos, identidad escolar, registros manuales y altas nativas. La recuperación escolar materializa una vez la cohorte y sus hashes para evitar consultas repetidas por hijo.
- El publicador interno recibe artefactos verificados y una huella del paquete. Reutiliza 061 antes de rotar contratos; crea metadatos reales; sella 098; promueve identidades; importa corridas/foto/conciliación; recupera fechas escolares; comprueba preservación y capacidad; escribe el puntero al final.

La transacción pertenece al llamador y exige READ COMMITTED. Cualquier error requiere ROLLBACK. El recibo interno declara committed:false; no equivale a confirmación durable. El replay verifica el par sellado, contexto vigente, las tres proyecciones físicas y recuperación escolar persistida, sin repetir escrituras. El COMMIT se comprueba mediante otra conexión.

El API y el asistente verifican un token de selección antes y después de sus consultas. Si cambia la fuente durante una respuesta, rechazan la mezcla. Las vistas originales históricas y las funciones de reconstrucción de 061 conservan su base; no se reemplazan por lecturas recursivas del candidato. No se amplían permisos directos del runtime.

## Informes agregados

El generador offline verifica todos los artefactos curados y reproduce exactamente las cifras, rótulos y ventanas del agregado anterior. S11 publica 2452 legajos históricos, 875 activos proxy y 31702 eventos de ausencia; 2026 contiene 1688 eventos y 596 legajos afectados. Los datos agregados conservan la serie desde diciembre de 2019 y sus límites de comparabilidad. El umbral de grupos se aplica a sectores, género y afectados; los totales temporales no incorporan desglose nominal.

La fuente publicada se verifica además por huella y corte. Los ensayos de exportación conservan el agregado aprobado de agosto como fixture y verifican también los archivos de septiembre. El navegador recorre la biblioteca actual, abre el resumen y descarga el informe completo en escritorio y móvil.

## Gates ejecutables

El inventario offline de scripts/lib/grh-publication-consumers.mjs falla ante referencias nuevas no cubiertas. Es un inventario de SQL literal, no una certificación del SQL instalado. Los generadores PostgreSQL 096–099 ejecutan escrituras y lecturas sintéticas dentro de transacciones que se revierten; cada uno exige una base local descartable específica.

El workflow grh-source-publication.yml instala dependencias, ejecuta build y pruebas, y corre los cuatro generadores en PostgreSQL 17 y 18. La prueba de consumidores curados usa 2684/2686 familias e incluye recuperación por lote, identidad cambiada, precedencia manual con fecha NULL, PDF anterior, revocación y altas nativas 42/55. La autenticación auxiliar de la fixture se declara expresamente; no certifica una sesión de producción.

Además se ejecuta el publicador completo sobre una restauración privada: fallos posteriores a escrituras, rollback, reconstrucción completa, capacidad, replay y API sobre volúmenes reales. El API local usa acceso HTTP inyectado para probar consultas; la sesión y los permisos reales se verifican después en producción. No se conservan datos nominales en los reportes de QA ni se crean registros municipales ficticios en producción.

## Secuencia de publicación

1. Un commit revisado en rama aislada; CI completo verde, incluidos PG17 y PG18.
2. Revalidar respaldo y estado actual. Recuperar espacio de PG17 con los pasos medidos y confirmar preservación y reserva.
3. Instalar 096–099 primero en PG18 y después en PG17. Sin puntero, las vistas mantienen agosto; comprobar paridad y permisos.
4. Promover el código compatible a master, esperar Vercel success y comprobar SHA y assets servidos. No activar septiembre mientras el API anterior siga publicado.
5. Publicar el paquete en una sola transacción por destino: PG18 y luego PG17. Confirmar desde otra conexión, sin reintento ciego ante respuesta de COMMIT incierta.
6. Verificar producción autenticada: corte 10/09, cohorte actual, agosto cerrado/septiembre abierto, fuentes independientes, escuela y exportaciones; acceso anónimo rechazado. Conservar recibos privados con conteos, huellas y tiempos.

La fuente S11 no completa por sí sola la sustitución de GRH ni los demás módulos del plan. La incorporación de respaldos posteriores y la liquidación nativa tienen sus propios controles.
