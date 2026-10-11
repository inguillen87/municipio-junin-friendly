# Participación del período: conservación del intento ante ocupación

Una ocupación breve de las tablas podía rechazar la preparación de una participación válida con `PARTICIPATION_BUSY`. La ejecución SQL ahora puede esperar como máximo un segundo, respetando cualquier límite de bloqueo menor que ya tenga la conexión. Mantiene los mismos bloqueos SHARE y advisory y vuelve a ejecutar la guardia original.

Después de esperar comprueba nuevamente el contexto municipal, la identidad, los permisos y el vencimiento real de la sesión. Una ocupación persistente, una sesión vencida o una autorización retirada impiden el guardado. No se reintenta un POST automáticamente: cuerpo, clave, huella y revisión independiente conservan sus reglas originales. El contenido posterior a la guardia, incluidos el cálculo de la huella y la inserción del evento, permanece idéntico.

SQL161 adapta únicamente el cuerpo de `own_participation_command_v1(jsonb,jsonb,uuid)`. El lote técnico verifica la versión anterior o la final, conserva OID, firma, propietarios, ACL, todas las tablas y el resto de los objetos. Una repetición sólo verifica. No crea tablas o funciones, cambia permisos, adopta empleados ni ejecuta cálculos o pagos.

Los controles nuevos usan PostgreSQL y handlers reales con datos inventados: liberación de un holder controlado sobre las tres tablas, ocupación persistente, límite menor del llamador, vencimiento de sesión durante la espera, vencimiento por inactividad, retirada de autoridad y recuperación del comprobante original. Se mantienen las pruebas anteriores y las expectativas originales de los workflows. El holder del fallo anterior de CI no fue identificado; el holder sintético permite reproducir el mecanismo sin atribuir aquel incidente a autovacuum o a una persona.

Las reglas de bloqueo y los tiempos de transacción están documentados por PostgreSQL en [explicit locking](https://www.postgresql.org/docs/18/explicit-locking.html) y [date/time functions](https://www.postgresql.org/docs/18/functions-datetime.html). La comprobación técnica no constituye aceptación municipal de Noelia ni homologación salarial.
