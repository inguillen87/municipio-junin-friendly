# M7 · Histórico propio de grupos confirmados

El punto 7.3 del módulo de Noelia exige conservar el histórico de cada liquidación para su consulta y posterior imputación. Este incremento continúa el cálculo propio de C2 y las decisiones publicadas en #103. La pestaña **Nómina → Cerrar liquidación** reúne las versiones actualmente confirmadas de un período y tipo, aunque provengan de distintas corridas.

## Recorrido

1. Consultar período y tipo. La revisión incluye todo el padrón de altas propias elegible, también los legajos sin confirmar.
2. Elegir legajos, convenios, reparticiones o todos los legajos propios de esa revisión. La búsqueda y la página sólo cambian la vista. Cualquier legajo no confirmado, cerrado o sin separación de funciones rechaza el grupo completo.
3. Revisar versiones y totales exactos, informar motivo y confirmar expresamente. El cierre conserva conceptos, importes, corridas, huellas de entrada/resultado, versiones individuales y cobertura declarada. No vuelve a evaluar reglas salariales.
4. Consultar la copia histórica. Un grupo parcial conserva su cobertura parcial; varios grupos no se presentan automáticamente como cierre municipal completo.
5. Para modificar una liquidación cerrada, reabrir su grupo completo con motivo. Después se puede anular el legajo, recalcular y confirmar una nueva versión. El primer cierre y sus importes permanecen inmutables.

El cierre bloquea nuevas capturas, finalización de capturas pendientes y nuevas decisiones para los contratos, período y tipo afectados. Permite recuperar los resultados y decisiones que ya estaban guardados, con su cuerpo y clave originales. Otros contratos y tipos permanecen independientes. Cerrar y reabrir exigen una identidad distinta de quien preparó los cálculos involucrados; cambiar de correo o membresía no vuelve independiente a la misma persona.

## Instalación y acceso

SQL125 agrega una tabla vacía y diez funciones, con cuatro fachadas privadas. Adapta cuatro funciones de SQL123/124 desde sus fuentes publicadas exactas. El instalador verifica conservación de todas las filas anteriores, metadatos, roles y ACL; permite únicamente los cuerpos adaptados explícitos y verifica las guardas instaladas. La comprobación de durabilidad usa otra conexión y no repite una instalación incierta.

La capacidad `payroll.calculation.close` se define sin asignarla automáticamente a roles o personas. Consultar exige lectura nominal y revisión de cálculos. Cada operación vuelve a verificar la autoridad en SQL. La pantalla retira datos al ocultarse, cambiar de tarea, vencer la sesión o revocarse permisos; no persiste la vista ni el intento en localStorage.

## Límites del incremento y próximos pasos

- El dominio actual es `native_registered`: altas creadas en MuniControl sin registro previo en GRH. No representa todavía todo el padrón municipal incorporado desde respaldos.
- Se conserva la identidad de los siete tipos existentes. El cierre no inventa cohortes de vacaciones/final, prorrateos, fórmulas, tasas ni homologación de códigos pendientes.
- El resultado conserva `payrollCalculated=true`, `payrollPosted=false` y `paymentExecuted=false`. Cerrar no contabiliza, paga, emite recibos institucionales ni aplica firmas.
- M8/M9 deben consumir este histórico propio para planillas e informes/recibos institucionales, con fuentes personales y formatos verificados. La imputación contable es una etapa separada; INSUARTE no se equipara a otros formatos por inferencia.
- El objetivo sigue incluyendo los diez módulos y todos los códigos que pidió Noelia, asistencia y autonomía cloud de los **14 puntos de marcación** con el mismo criterio de aceptación, y los circuitos posteriores de expedientes y firmas. Una prueba sintética no acredita funcionamiento físico ni aceptación de funcionarios.

Las verificaciones locales y de publicación se conservan en `verification/`; los originales municipales, audios, respaldos y documentos de traspaso permanecen privados.
