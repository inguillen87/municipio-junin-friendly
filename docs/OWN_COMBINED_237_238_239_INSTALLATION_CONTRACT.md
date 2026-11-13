# Composición operativa de 237, 238 y 239

El SQL semántico de una migración no es el instalador operativo. La composición incorpora los cambios de nómina234→236→235→237→239 desde el padre exacto a7fd y agrega la función de lectura 238 dentro de la misma transacción. La aplicación candidata reúne el runtime237, su reparación de espera en QA, los cambios de interfaz y el contrato239.

## Identidad del paquete

| Artefacto | SHA-256 |
|---|---|
| Padre SQL esperado | `a7fd575c59fc326802f108530a4606a7a4d55ca25f354ea4f8adba82d57c17c4` |
| Composición237 anterior, preservada | `9fe1f7cb1f66a40e096d4fec99074c240b2fff18ee543a8829ed64a3fdeb792c` |
| Instalador completo237+238+239 | `62bcb845b858c156e604b7082df8084ceac39172b724de2b40894246b4695503` |
| SELECT preflight | `c90a0cbafbd2e29f1a833d65844b1f3d20d02af8ce9e5e4d885da94d7af5e6e3` |
| SELECT postflight | `487d74dc099195fd0c663cc73a30461aa3adee56056c52913c09ae0b913c9f04` |
| Reversión independiente238 | `f4caa3b7cbf20465ad097c6f400b873c50f1977ef46d65d1e047334ffc027bdc` |

El paquete generado `MuniControl_SQL_237_238_239_62bcb845_package.zip`, SHA-256 `0a0790a9bd62a362cc83c630715465ae37513aee7da15eb8a521385796410079`, contiene el instalador íntegro, ambos SELECT, guardas operativas, metadatos, manifiesto y evidencia sintética. Se entrega separado del repositorio. Los deltas semánticos versionados requieren esa recomposición y no deben ejecutarse aisladamente para adoptar el runtime.

## Precondiciones y postcondiciones

La precondición de nómina comprende510 funciones existentes con cuerpo y metadatos exactos,81 nombres nuevos ausentes, estructura de cierre y relaciones esperadas, y ausencia de la tabla nativa. El destino es `neondb` con rol `neondb_owner`. El artefacto fue comprobado en PostgreSQL17.12 y18.7. No es un incremento para una base que ya haya instalado237 o235.

El postflight comprueba591 funciones de nómina, sus metadatos, estructura nativa, readiness y familias completas de30 y62 miembros. La atestación comprende573 dependencias de nómina. Las huellas de funciones no sustituyen la comprobación de propietario, ACL, configuración, tipos, volatilidad ni el resto de metadatos fijados.

La función `tenant_iam_admin_view_v4(text,uuid,integer,text,text,uuid,integer)` de238 tiene una guarda independiente; queda fuera de la atestación de nómina. Por ello, los totales protegidos son511 funciones antes y592 después. Se acepta que238 ya esté aplicado con su postimagen exacta; se rechaza cualquier otra deriva.238 expone el catálogo de capacidades, sin conceder permisos ni modificar identidades, membresías o roles.

## Instalación y reversión

Primero se verifica la identidad del archivo y el SELECT preflight. La futura ejecución autorizada debe procesar el instalador completo, detenerse ante el primer error y comprobar luego el SELECT postflight. Ambas consultas devuelven un objeto con `passed`, coincidencias y diferencias; no debe interpretarse un resultado distinto de `passed: true` como una aprobación parcial.

El instalador tiene un solo `BEGIN` y un solo `COMMIT`. Una deriva 238 introducida en el laboratorio hizo fallar su guarda después del DDL de nómina: se revirtieron todos los cambios previos de esa transacción, con funciones y datos empresariales conservados. No hay escrituras municipales solicitadas como parte de la instalación.

La reversión versionada de238 restaura exclusivamente su función de lectura a la preimagen exacta. No revierte237/239 ni migra datos de nómina hacia atrás. No hay un rollback global aprobado en este paquete. La reversión automática por fallo dentro de la transacción y una reversión posterior a COMMIT son operaciones distintas.

## Contrato239 y evidencia

El contrato escolar conserva filas311/312, exige una decisión municipal propia y admite solamente convenio1 mensual durante un único mes distinto de febrero, con condición tipada `L[101] == 2`. Exige evidencia, revisión de fases y `decisionSha256`. No establece equivalencia entre CONM y UNIM. La aprobación del programa sigue el circuito ordinario; poseer un hash documental no constituye aprobación. Las guardas de los tres canales rechazan la reaparición de esos códigos, incluso con importe y cantidad cero.

La comprobación final de composición pasó20 controles por motor. Incluye instalación completa, atomicidad,510/591 metadatos, conservación de datos, familias, restauración de una función anterior que invalida ambas familias, rechazo de deriva y ambos SELECT ejecutados en transacciones de sólo lectura. Las pruebas239 focales pasaron37 por motor y30 en el laboratorioJS original; la suite pública autónoma pasa29 porque omite la comparación con el runtime anterior. Las cifras no son sumables como casos únicos. Las suites amplias previas de237 no se repitieron.

La evidencia de laboratorio no acredita una liquidación municipal real, la aprobación de conceptos o decisiones económicas, ni resultados de CI/preview. El paquete es un candidato no instalado en producción. La migración240 no forma parte de esta composición.
