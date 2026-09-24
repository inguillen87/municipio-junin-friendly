# Asistencia, cálculo y aprobación de Personal

Actualización del plan integral del 23/09/2026, por pedido de Marcelo. Amplía la fase B y conecta las fases A (relojes) y C/D (nómina y entregas). Hugo es el referente funcional de Personal; Noelia recibe las novedades para liquidación. Este documento no asigna permisos a sus cuentas ni acredita su aceptación de reglas todavía pendientes.

## Resultado exigido

Cada cantidad debe poder explicarse y reproducirse: de qué marcas proviene, qué contrato y turno correspondían, qué licencia o justificación intervino, qué regla vigente se aplicó y quién revisó y aprobó la decisión. El objetivo es evitar tanto horas sumadas sin fundamento como tiempo descontado indebidamente.

Los catorce puntos del inventario pertenecen al mismo parque, incluido Edificio Viejo/PM10. La incorporación actual de seis relojes no homologa automáticamente sus códigos ni vincula cada usuario del dispositivo con una persona. Un recibo de archivos originales tampoco equivale a asistencia calculada.

## Reglas del motor y del producto

- Conservar originales inmutables, identidad de reloj, instante y procedencia. Duplicar una transmisión no duplica tiempo; una coincidencia ambigua entre relojes o fuentes queda para revisión, conservando ambos originales.
- Resolver persona y contrato por fecha, incluyendo varios legajos, cambios de sector y bajas/altas. No repartir la misma jornada entre contratos por conveniencia ni por semejanza del nombre.
- Separar tiempo reconstruido, tiempo computable según regla, tiempo reconocido/aprobado y novedad entregada a nómina. Permanecer más tiempo en el edificio no autoriza por sí solo una hora extra.
- Trabajar con instantes y duraciones exactas. Mostrar horas y minutos sin confundir 1:30 con 1,30 horas; redondear sólo donde una regla aprobada lo establezca, mostrando el efecto. Conservar zona horaria, día civil, cruce de medianoche y errores del reloj.
- Aplicar horarios, turnos partidos/nocturnos, descansos, feriados, tolerancias y topes con versión y vigencia. No copiar porcentajes, tolerancias o descuentos de una captura o respaldo histórico como si fueran reglas actuales homologadas.
- Distinguir licencia solicitada, aprobada, cancelada y consumo de saldo; contemplar fracciones horarias y superposiciones. No contar dos veces un mismo intervalo por licencia, trabajo y compensación. La precedencia exige regla vigente; si falta, se informa el conflicto.
- Presentismo, ausencia justificada/no justificada, tardanza y salida anticipada requieren cobertura y regla suficientes. Una falla de red, falta de fichada, persona sin turno o período incompleto produce una incidencia pendiente, nunca una ausencia definitiva ni un descuento automático.
- Mantener una misma revisión reproducible de entradas y reglas. Marcas tardías, cambios de turno o licencias posteriores generan nueva revisión y diferencias visibles; no alteran silenciosamente una aprobación o un período cerrado.

## Circuito de Hugo y Noelia

1. **Preparar:** el sistema reconstruye y propone; Personal completa los datos faltantes con motivo y evidencia. La corrección se guarda aparte del original del reloj.
2. **Revisar con Hugo:** bandeja por agente/período y por causa, con explicación de cada intervalo, cobertura, reglas, diferencias y documentos necesarios. Hugo puede devolver o rechazar lo que no corresponda dentro de sus atribuciones efectivas.
3. **Aprobar:** sólo una persona autorizada y distinta de quien preparó/corrigió esa revisión. Si Hugo la preparó, debe intervenir otro revisor autorizado. La aprobación debe estar ligada a esa revisión exacta; permisos revocados o evidencia modificada invalidan una aprobación pendiente de confirmar.
4. **Entregar a Noelia:** únicamente cantidades aprobadas, concepto/mapeo vigente, período, unidad, referencia y comprobante de aprobación. Repetir la entrega no duplica novedades. Un rechazo conserva su causa y permite corregir sin borrar la historia.
5. **Cerrar o rectificar:** registrar qué revisión consumió nómina. Una novedad posterior se trata mediante rectificación o ajuste aprobado, con original y diferencia, sin reescribir el cierre.

El nombre de una persona no concede un permiso. Se verifican las membresías y capacidades reales en el entorno objetivo, y la separación de funciones se comprueba en servidor. Los informes de Personal no deben exponer diagnósticos clínicos a quienes sólo necesitan conocer la licencia y su efecto horario.

## Sprints de la fase B

| Sprint | Alcance | Cierre verificable |
| --- | --- | --- |
| B1. Fuentes e identidad | Homologar código/serie de cada reloj, vínculo temporal persona-contrato, cobertura y procedencia de los seis actuales | Prueba física de entradas/salidas/pausas y comparación de marcas; desconocidos conservados como pendientes; replay sin duplicar |
| B2. Reglas vigentes | Calendarios, turnos, tolerancias, descansos, licencias y topes con documentos, versiones y aprobación funcional | Casos esperados acordados con Hugo y responsables autorizados; ninguna regla histórica activada por defecto |
| B3. Simulación explicable | Reconstrucción y evaluación reproducible por intervalos, presentismo/ausentismo/licencias/extras, explicación y diferencias | Casos de aceptación de esta página aprobados; sin efecto salarial durante la simulación |
| B4. Revisión y decisiones | Completar bandeja de incidencias con decisiones persistentes, corrección fundada, devolución/rechazo y aprobación independiente | Ciclo completo con revisión exacta, auditoría, concurrencia, revocación de permisos y conservación de originales |
| B5. Novedades para Noelia | Entrega idempotente de resultados aprobados al circuito existente de novedades y conciliación de recepción | Una sola novedad por revisión/concepto, totales conciliados; ningún pago, descuento o cierre disparado por una fichada |
| B6. Operación paralela y corte | Comparar población, período, cantidades y reglas con casos aceptados por Personal/Contaduría | Diferencias explicadas y aceptaciones reales registradas antes del corte de ese dominio; plan de reversión y rectificaciones |

El trabajo existente se reutiliza: catálogo temporal, evaluación mensual, reconstrucción de jornadas, revisión por causa, preparte, novedades y separación de funciones. Estos sprints indican el cierre funcional pendiente; no declaran que esos componentes estén ausentes ni que las fases ya estén homologadas.

## Punto de partida verificado en código

| Componente existente | Alcance comprobado | Cierre pendiente |
| --- | --- | --- |
| Reconstrucción de jornadas v2 | Pares, pausas, contexto nocturno, segundos exactos e incidencias en `lib/attendance-workdays.js` | Conserva `coverageCertified:false`, `homologationStatus:unverified`, `approvalStatus:not_approved` y `payrollEligible:false` |
| Fuentes de relojes | PM10 ingresa originales y marcaciones canónicas mediante 055; los otros cinco conservan fuentes originales y acuses en el archivo dedicado | La consulta 065 de jornadas todavía no consume esos cinco; la fachada 002 del archivo dedicado es agregada, no una consulta de eventos para reconstrucción |
| Reglas 010/011 | Registro gobernado de fuentes y catálogo SQL versionado con separación de funciones | No se identificó consumidor API/UI del catálogo 011 ni evidencia de reglas operativas vigentes aceptadas por Personal |
| Evaluación mensual 024 | Revisiones, fuentes, conteos y aprobación independiente persistentes | No es un motor que reconstruya minutos desde turnos/calendarios/licencias; el acceso runtime sigue revocado |
| Licencias y extras | Circuitos de solicitudes, revisión y decisiones | Licencias conservan `pending_payroll_rules`; extras, `pending_time_rules`; falta conciliación operativa de saldos y reconocimiento según reglas |
| Preparte para Noelia | Revisión de cantidades y respaldo documental, propuesta a conceptos 44/95 | No equivale a aprobación persistente de asistencia ni a entrega automática idempotente de cantidades aprobadas |

**Próximo corte de implementación:** B1, consulta gobernada de eventos originales de los cinco relojes adicionales y vinculación temporal de identidad, reutilizando el reconstructor. Homologar códigos por equipo; no asumir que un mismo número representa entrada, pausa o extra en todos. Probar replay, dos contratos/legajos coincidentes, marcas tardías, corte de red y cambio de evidencia. B4 puede desarrollarse en paralelo, pero no cerrar la aprobación calculada sin B1/B2. Esta revisión de código no certifica las reglas instaladas ni las capacidades efectivas de una cuenta de Hugo.

Referencias: `scripts/migrations/011-versioned-time-catalog.sql`, `scripts/migrations/024-governed-monthly-attendance-evaluation.sql`, `scripts/migrations/055-pm10-continuous-reception.sql`, `scripts/migrations/065-clock-workday-source-continuous.sql`, `scripts/clock-database/002-source-integration.sql` y `assets/attendance-preparte-model.js`.

## Casos obligatorios de aceptación

| Caso | Resultado esperado |
| --- | --- |
| Jornada completa, partida y nocturna; cambio de mes/año | Cada intervalo conserva fecha y contexto; exportar o paginar no corta ni duplica la jornada |
| Entrada/salida o pausa faltante; marca fuera de orden | Incidencia explicada, sin inventar pareja ni imputar cero horas trabajadas |
| Mismo lote reenviado, ACK perdido y captura repetida | Mismas marcas y cantidades; comprobante estable, sin doble novedad |
| Dos dispositivos, importación histórica y fichada de precisión ambigua | Procedencia preservada; deduplicación sólo sustentada o revisión explícita |
| Reloj atrasado/adelantado y red interrumpida | Calidad/cobertura visible; no inferir ausencia ni corregir originales silenciosamente |
| Licencia parcial, día completo, cancelación y superposición | Saldo y tiempo conciliados con decisiones vigentes; sin doble cómputo |
| Feriado, descanso, turno cambiado y contrato cambiado | Aplicación de reglas efectivas por fecha; conflictos visibles |
| Tolerancia, redondeo, topes y límites exactos | Casos justo antes/en/después del límite; cantidad exacta y efecto de redondeo explicados |
| Exceso de permanencia sin autorización; autorización parcial | Separación entre tiempo observado y reconocido; no otorgar ni pagar extras automáticamente |
| Marca/licencia nueva tras revisión o cierre | Nueva revisión y diferencia; aprobación anterior y cierre preservados |
| Autorrevisión, sesión vencida, permisos revocados, aprobación concurrente | Rechazo del cambio indebido en servidor, sin aprobación parcial ni pérdida del trabajo |
| Transferencia repetida o respuesta perdida hacia novedades | Resultado idempotente y conciliable por agente, contrato, período, concepto y revisión |

## Evidencia para declarar terminado

Pruebas automáticas y casos sintéticos en entornos aislados; CI del commit exacto; migraciones sólo después de controles verdes, en PG18 y PG17; despliegue y verificación de producción por separado. No se crean datos municipales ficticios persistentes. La homologación requiere resultados esperados y aceptación reales de responsables autorizados: las pruebas técnicas no se presentan como firma de Hugo o Noelia.

La fecha deseada de octubre no sustituye estos criterios. Cada dominio puede habilitarse con un alcance y período identificados, manteniendo visibles las funciones todavía pendientes.


## Ampliación del 24/09 · tiempo y ausentismo

Ver `PLAN_TIEMPO_AUSENTISMO_OPERACION_20260924.md`: corrección de cargas y ceros, caso contextual, consulta nominal, métricas de relojes, comparación de tiempos y aceptación por Noelia/Hugo/Mariano/superadministración. Distingue el incremento implementado de la conciliación de los otros equipos, reglas, aprobaciones y fuente del 22/09 pendientes.
