# D1.3 · cargador transaccional de preparación sucesora

## Base y alcance

Se continúa desde GitHub y el alias de producción verificados en `587836f139f549d182a647de700f54d1560aa2c5`. Se conserva D1.2 y el cruce de ausencias B2.1. El expediente de proveedores sigue diferido hasta G-AUT-01.

Este incremento conecta el paquete completo de D1.1 con las tres tablas privadas de la migración 106. El cargador no cambia `grh_effective_source_binding`, contratos, solicitudes, novedades ni haberes. Un conjunto sellado sigue siendo una preparación, no la fuente operativa seleccionada.

## Secuencia implementada

1. Reconstruir y verificar el paquete de las cuatro extracciones. Su SHA-256 debe coincidir con el confirmado explícitamente por quien ejecuta mantenimiento.
2. Usar una sola conexión y transacción `SERIALIZABLE READ WRITE`, con límites de tiempo y bloqueo. Comprobar proyecto, rama, base, propietario y selección exacta; adquirir exclusión por municipio y vínculo.
3. Comprobar capacidad de todo el clúster antes de la reconstrucción costosa. Volver a cotejar los diez dominios, sus imágenes anteriores, la cohorte contractual y las trece cabeceras nativas dentro de esa transacción.
4. Instalar 106 únicamente cuando se solicita y aún no existe. Exigir tablas con RLS, propiedad correcta y sin acceso de lectura/escritura para el rol de ejecución de la aplicación.
5. Insertar la carátula y las diferencias en lotes de hasta 200 filas; el sello vuelve a comprobar el padre, los diez dominios, cantidades, imágenes anteriores y huellas. Exigir el sello diferido antes del cierre.
6. Releer la preparación persistida y todas sus diferencias, incluyendo los payloads de origen almacenados, y recalcular sus huellas. Repetir la inspección de origen y cabeceras para detectar modificaciones propias indebidas. Comprobar tamaño final.
7. Ensayar con `ROLLBACK` o confirmar con `COMMIT` sólo por opción explícita. Una respuesta perdida del cierre se informa como incierta, no como carga fallida o rollback demostrado.

La repetición de la misma fuente y paquete verifica la preparación existente y no crea otra. Un paquete diferente, sello incompleto, permisos indebidos, cambio de fuente o imagen incompatible falla; no se reutiliza una carga parcial. Las conexiones de resultado incierto se descartan.

La inspección previa sigue siendo exclusivamente read-only. La revalidación dentro de una carga tiene un tipo separado y exige Serializable/read-write; no se etiqueta una sesión de escritura como lectura ni se usa el informe D1.2 anterior como autorización permanente.

## Capacidad observada, no cuota comercial inferida

La lectura agregada de Neon del 25/09/2026 a las 01:01:31 UTC obtuvo 477.224.960 bytes en la base y 500.154.368 bytes sumando todas las bases y plantillas del clúster. La migración 106 seguía ausente. No se escribió ninguna fila de producción.

El presupuesto técnico vigente en el repositorio es 512 MiB, con 16 MiB de reserva y 24 MiB de crecimiento permitido para esta operación. Quedan 19.015625 MiB después de la reserva: **no cumple los 24 MiB requeridos**. Esto describe el límite configurado y medido, no una certificación del plan comercial o la cuota actual de Neon. No se redujo la reserva ni se aumentó un límite para forzar la carga.

La carga real queda bloqueada antes de instalar. Sigue pendiente resolver el espacio de forma revisada o completar la separación del entorno ya contemplada, y probar una restauración municipal. El ensayo sintético de este incremento no sustituye esa restauración.

## Uso explícito y verificaciones

`scripts/stage-grh-successor.mjs` requiere `--target`, las cuatro rutas absolutas (`--baseline-core`, `--candidate-core`, `--baseline-curated`, `--candidate-curated`), `--expect-package` y exactamente una opción entre `--rehearse` o `--commit-staging`. `--install-schema` es optativa y explícita. No admite seleccionar una fuente ni ejecutar pagos. La conexión se proporciona mediante `MC_SUCCESSOR_STAGE_DATABASE_URL`, nunca en el archivo de destino ni en un argumento impreso.

La primitiva `stageSuccessorWithinTransaction` siempre devuelve `committed:false`: su llamador controla la transacción. Sólo el ejecutor de mantenimiento puede devolver un comprobante confirmado después de recibir el resultado de COMMIT. La salida es agregada, sin nombres, importes ni cuerpos de solicitudes.

Se agregaron 30 pruebas unitarias: separación de contratos de lectura/carga, estado de transacción, destino, propietario, capacidad, argumentos, cancelación previa, mantenimiento de una conexión, rechazo/rollback y cierre incierto. La aceptación local en PostgreSQL 17 utilizó el esquema real 061/096/098/106 con datos inventados: 403 diferencias, tres lotes, rollback completo, carga, repetición sin duplicación y huellas de todas las tablas anteriores intactas. La matriz CI repite la aceptación en PostgreSQL 17 y 18.

## Criterios que permanecen pendientes

Se implementa la carga privada, pero este incremento no instala 106 en Neon ni guarda allí el paquete del 22/09. No cambia la fuente seleccionada ni afirma resolver todas las decisiones, adjuntos o eventos nativos. La conservación comprobada por el cargador abarca la cohorte y trece cabeceras; la aceptación sintética compara además todas las tablas del escenario. La conciliación completa necesaria para activar el sucesor sigue separada.

No hay nueva pantalla, endpoint público, permiso ni modificación salarial. El siguiente cierre operativo es capacidad y restauración verificadas, ejecución de preparación sellada en el destino adecuado y selección sucesora explícita con validación transaccional. Los módulos 7 y 9 y la autonomía integral no se declaran cerrados por este componente.
