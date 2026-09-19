# Septiembre: candidato persistido y verificado despues de COMMIT

## Fase efectivamente cerrada

El 19/09/2026 se incorporo la version candidata del respaldo del 10 de septiembre a la copia aislada PostgreSQL 18.6: proyecto `wild-cake-87689498`, rama `br-plain-dawn-ac8crb1h`, base `neondb`. Esta vez la transaccion se confirmo: no fue otro ensayo que termino en ROLLBACK. La aplicacion productiva NO cambio de base ni de fuente activa.

Version persistida: `3955f09a-28d6-44e7-8538-189b48181f47`. Paquete nuevamente preparado y verificado desde los artefactos privados de agosto/septiembre: SHA-256 `d5f8f6a150377400d23c0af4c97aa3d58875218479907ffd2d56e3a6b3890abe`.

COMMIT confirmado a las `2026-09-19T12:24:28.859Z`. El sello usa la fecha de transaccion de PostgreSQL (`2026-09-19 12:18:20.262277+00`), no la hora del COMMIT. El verificador posterior termino a las `2026-09-19T12:25:21.785Z`; otra conexion del conector Neon tambien comprobo el registro, el sello y las 11.430 diferencias persistidas.

El corte de la fuente candidata es `2026-09-10 15:17:30`, guardado sin zona horaria. Su referencia de liquidacion es `2026-09-30`; no significa que el respaldo contenga novedades posteriores al dia 10 ni que septiembre este cerrado. La fecha fuente del manifiesto base es `2026-08-06 15:15:21`; el lote canonico mantiene su timestamp original registrado. No se reinterpreto ni modifico ese antecedente durante esta fase.

## Contenido y conservacion

| Entidad | Base de agosto | Candidato septiembre | Altas de claves | Reemplazos | Ausencias de claves |
| --- | ---: | ---: | ---: | ---: | ---: |
| Corridas | 620 | 624 | 4 | 2 | 0 |
| Foto salarial | 854 | 847 | 847 | 0 | 854 |
| Movimientos | 489459 | 495237 | 5791 | 2 | 13 |
| Hechos mensuales | 214164 | 216411 | 2248 | 811 | 1 |
| Conciliacion de legajos | 2450 | 2452 | 2 | 855 | 0 |

Son 11.430 diferencias de registros, no personas nuevas ni sueldos nuevos. El cambio de foto mensual no convierte sus ausencias en bajas laborales. Se conservan datos anteriores y nuevos de cada cambio; las tablas canonicas no fueron sobrescritas.

Antes y despues de la incorporacion, dentro de la transaccion, se compararon **147 tablas preexistentes y 890.649 registros**, con conteos y SHA-256 multiconjunto por tabla, preservando duplicados y sin depender del orden de filas: cero diferencias. Incluye las tablas nativas de normas y seguimientos. El total de tablas de la copia paso de 147 a 150 por las tres tablas privadas de version, delta y sello. No se eliminaron registros ni se separo todavia el historico.

El importador existente verifica las proyecciones completas de las cinco entidades contra las huellas de los artefactos, no solamente conteos. Repetir el mismo paquete devolvio el mismo identificador con `inserted:false`, sin otra insercion. Esta prueba de repeticion se realizo antes del COMMIT; la lectura independiente posterior prueba la persistencia del resultado.

## Controles de ejecucion

Se utilizo la migracion 061 ya versionada y el importador `importGrhSourceVersionWithinTransaction`, conservando sus validaciones de hashes, perfiles, vinculacion certificada, presupuesto de espacio y bloqueos de publicacion. El SHA-256 del archivo SQL aplicado es `dc0544cd98bbf858e79e1665e074597904f87adfaf1682c1f5a7f6f011ad5bf5`.

El primer intento se revirtio por completo: un search_path que comenzaba en pg_catalog intento crear alli las tablas no calificadas. Se verifico que no quedara ninguna tabla de version. La ejecucion correcta uso public como esquema de creacion, despues de comprobarlo; no se otorgaron privilegios sobre pg_catalog ni se relajaron las validaciones del importador.

La nueva funcion de herramienta `verifyCommittedGrhCandidate` es un verificador reutilizable de solo lectura. Comprueba destino aislado, version explicita, hash, sello en transaccion previa y lote base todavia publicado. Lee las cinco entidades mediante el lector que verifica sus sellos y exige claves unicas, conteos esperados y `operational:false`. Su propia transaccion termina en ROLLBACK porque es de lectura; eso NO revierte la importacion previamente confirmada.

Las tres tablas y el lector del candidato siguen sin SELECT/EXECUTE para el rol de aplicacion. El rol en la copia continua NOLOGIN. Se comprobo la ausencia de privilegios efectivos de lectura; no se simulo ni certifico un login municipal real. No se cambiaron credenciales ni variables de Vercel.

La herramienta integral nueva de staging no pudo guardarse; no forma parte de esta entrega. La incorporacion real se ejecuto con el importador existente desde una sesion local controlada. El codigo nuevo publicado es el verificador posterior, sus pruebas y este registro tecnico. La propuesta de correccion del indicador de fuente en Integracion no llego a conectarse y se retiro su borrador no utilizado; no se declara esa correccion realizada.

## Capacidad observada, sin subir planes

El crecimiento de las relaciones medido por el importador fue 17.473.536 bytes (aproximadamente 16,66 MiB), menor al presupuesto de 24 MiB. Su postflight registro 480.821.248 bytes en el conjunto de bases y 39.272.448 bytes libres despues de reservar 16 MiB sobre el limite configurado de 512 MiB.

Una lectura posterior al COMMIT registro 480.886.784 bytes en el conjunto (aproximadamente 458,61 MiB), con 39.206.912 bytes (37,39 MiB) restantes despues de esa reserva. El pequeno crecimiento posterior no se oculta. Son tamanos observados mediante PostgreSQL, no una factura ni una garantia de espacio para todo el ano. No se cambiaron planes, cuotas o autoescalado y no se uso la base historica vacia.

## Regresion y evidencia privada

Pasaron 3.760 pruebas y la compilacion completa, con cero fallos, omisiones o cancelaciones. Son nueve pruebas nuevas del verificador sobre las 3.751 anteriores. Las pruebas unitarias usan un cliente simulado; la ejecucion posterior al COMMIT y las consultas independientes de Neon son evidencia separada y real.

Los informes precommit y postcommit, las huellas por tabla y los artefactos fuente permanecen en la carpeta municipal privada `september-candidate-20260919`, fuera del repositorio. No se publicaron filas personales, documentos, importes individuales ni credenciales. Esta fase no agrega pantallas ni se atribuye pruebas nuevas de navegador.

## Siguiente tramo del plan de implementacion

La consulta agregada de conciliacion del candidato encontro 2.452 claves de legajo, 875 administrativos activos, 847 activos incluidos en la corrida de origen y 28 activos fuera de esa corrida. **Dos claves del candidato no estan en los contratos GRH del lote base**: deben conciliarse con identidades y altas propias antes de publicarlas; no se crearon empleados por inferencia. Estas cifras describen el respaldo, no un censo municipal actual certificado.

La fuente candidata informa agosto con referencia `2026-08-31` cerrado y septiembre con referencia `2026-09-30` abierto. Esa apertura es una condicion expresa de NO usar septiembre como gasto cerrado o liquidacion propia aprobada.

| Paso | Estado al cierre |
| --- | --- |
| Restauracion completa de la copia PG18 | Cerrada en la fase anterior; conservada en esta fase |
| Incorporacion y lectura verificable de septiembre despues de COMMIT | Cerrada en esta fase, solo como candidata |
| Conciliacion administrativa e identidades, preservando altas y cambios nativos | Pendiente; revisar las dos claves nuevas y los estados, no solo cantidades |
| Adaptacion de todos los consumidores a una unica fuente activa | Pendiente; detalle de haberes y fuentes bancarias tienen procedencia independiente |
| Separacion del detalle historico por gestiones | Pendiente; el candidato depende de la base de agosto, por lo que no se pueden recortar esas filas sin adaptar y verificar la reconstruccion |
| Credencial restringida, diferencial final y cambio de conexion a PG18 | Pendiente; la produccion actual sigue intacta |
| Liquidacion propia de octubre | Requiere casos aprobados, conceptos/reglas, novedades, conciliacion por legajo y circuito de control |

La lectura independiente de la base operativa `noisy-poetry-54471701` confirmo que conserva 147 tablas, su fuente GRH publicada del 06/08/2026 y ninguna tabla grh_core_source_version. No se activa una candidata por publicar este codigo en GitHub/Vercel. El archivo original de GRH se conserva y no se declara eliminada la dependencia operativa.

Referencias tecnicas primarias: https://www.postgresql.org/docs/18/transaction-iso.html y https://www.postgresql.org/docs/18/sql-createfunction.html. Las cifras y estados de esta nota proceden de la ejecucion y lecturas del proyecto; esas referencias explican los mecanismos, no prueban el estado de MuniControl.
