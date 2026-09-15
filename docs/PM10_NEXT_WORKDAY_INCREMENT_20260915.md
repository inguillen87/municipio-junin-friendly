# Próximo incremento de lectura de jornadas PM10

Corte: 15/09/2026. Revisión de código sobre `e05c3359f8a3a42fe1a8fae13e88733617b692c8` y documentación local. No se consultaron la base, el reloj ni una sesión municipal. Los estados de producción mencionados proceden de `docs/13_CONTINUIDAD.md`, no de una comprobación nueva en este diagnóstico.

## Hallazgo y cambio concreto

065 ya entrega histórico más recepciones completas, referencias estables y observaciones. El siguiente cambio útil es **mostrar las marcas extra que todavía no tienen un tramo reconstruido** y hacer legible la secuencia de la jornada.

- `lib/attendance-workdays.js:151`: el filtro `extra` exige `extraSeconds > 0`. Una entrada código 4 sin salida 5 aparece en Todos/Revisar, pero desaparece de «Con tiempo extra». No es pérdida de la marca: el filtro consulta duraciones cerradas.
- `assets/workday-panel.js:16`: la tabla y el indicador muestran `0:00:00` tanto ante falta de tramo extra como ante una duración calculada igual a cero. La presencia de un intervalo del tipo correspondiente permite distinguirlos; no debe decidirse sólo por el número de segundos.
- `assets/workday-panel.js:10`: la secuencia queda dentro de una segunda apertura, y las pausas aparecen como descuento agregado. Ya existen eventos y `pauseEventRefs` suficientes para mostrar sus extremos y procedencia sin reconstruir otra vez en el navegador.
- El corte del 14/09 registrado en continuidad contiene 56 códigos 0, 43 códigos 1 y seis códigos 4, sin 2/3/5. Es evidencia agregada anterior: no prueba seis personas, seis horas extra ni una infracción. Tampoco demuestra recreos o extras cerradas ese día.

Incremento autorizado después del diagnóstico: opción v2 «Marcas extra sin tramo completo», filtrada **antes de paginar**; duración «No reconstruido» cuando no hay intervalo calculable del tipo; secuencia accesible al abrir una jornada. Conservar `extra` y v1; no inventar salidas, rellenar hasta la hora actual ni convertir 4/5 en 44/95. Un tramo calculado de cero mantiene su cero. Si una jornada combina un tramo cerrado y marcas pendientes, conservar la duración válida y señalar lo pendiente.

Archivos previstos: `lib/attendance-workdays.js`, `lib/internal-attendance-workdays.js`, `assets/workday-panel.js`, `assets/workday-panel-model.js`, `assets/workday-panel.css` y `assets/workday-export.js` sólo para conservar la distinción al exportar. Pruebas dedicadas. Sin SQL, reglas laborales, autorizaciones ni activación de otra fuente.

## Fuentes y dependencias que siguen abiertas

Se revisaron `backlog.json` del handoff privado, tareas MC-A01–A04, y su registro `16_FUENTES_Y_PRECEDENCIA.md`. Los antecedentes de esas tareas aún describen 065 en preparación; el checkpoint actual en continuidad prevalece para estado técnico. Las aceptaciones municipales permanecen pendientes. No se modificó el backlog ni se copiaron datos nominales.

| Dependencia | Evidencia existente | Qué falta realmente |
|---|---|---|
| MC-A01: significado por equipo | `lib/attendance-workdays.js` conserva perfil candidato K20 0–5, distinto del método de verificación. El handoff `06_PM10_0592_0593.md` exige comparación controlada con export del equipo. | Validación física/funcional por Cómputos y RRHH, perfil/versión/vigencia y casos de entrada, salida, pausa y extra. La lectura de bytes no homologa su significado laboral. |
| MC-A02: turnos y obligaciones | `docs/GRH_TIME_SOURCE_DISCOVERY_20260819.md`: 30 turnos, 32 horarios, nueve tolerancias; asignaciones/calendarios mayormente 2011–2012 y feriados hasta 2008. `contracts/junin-attendance-inputs.v1.json`: ninguna de las 49 áreas trae guardia/rotación informada. | Asignación vigente por contrato y fechas, cohorte obligada a marcar, turnos/nocturnidad/descansos, feriados y excepciones confirmados. El turno 07–13 y cinco minutos del taller son ejemplos, no defaults municipales. |
| MC-A03: evaluación persistida | `scripts/migrations/024-governed-monthly-attendance-evaluation.sql` guarda corrida, manifiesto, regla, resultados y auditoría. 065 entrega referencias y un corte de lectura. | Puente de procedencia: 024 referencia `attendance_ingest_batch`; PM10 usa captura/recibos propios. No basta insertar los totales de 065 ni aprobarlos: se necesita adaptar esa unión y homologar A01/A02. |
| MC-A04: mayor dedicación/Full Time | Fuentes privadas S02, apartados 3.1/3.2, y S04, 5.3; resumen público en `docs/MATRIZ_ACEPTACION_NOELIA.md`. Las secretarías entregan cantidades 44/95. `lib/internal-overtime-workflow.js` admite declaración y revisión documental con estado final `pending_time_rules`. | Regla y solicitud/autorización por ámbito, vínculo con evidencia y producción idempotente de novedad. La declaración actual no calcula ni publica haberes. No hay relación directa entre estado 4/5 y concepto 44/95. |

El catálogo `scripts/migrations/011-versioned-time-catalog.sql` ya modela calendario, turno, regla y asignación con vigencia, segregación de aprobación y control de solapamientos. Sus comandos devuelven `attendanceEvaluationReady:false` y `minutesCalculated:false`: aprobar metadatos no pone en marcha el evaluador. Las pantallas públicas `control-horario-homologacion.html` y `control-horario-readiness.html` son explicación/simulación; no sustituyen una decisión guardada y contienen estados históricos de agosto que no deben reutilizarse como salud actual de PM10.

Como comparación de producto, `docs/CIVITAS_ESUELDOS_EVIDENCE_20260821.md` documenta el recorrido turno → calendario esperado → fichada → revisión. Conviene conservar la explicación de esperado/registrado cuando exista un turno aprobado. Hoy el aporte comprobable es explicar registrado/pendiente con menos aperturas y trazabilidad, sin copiar el ejemplo de conversión de excedente a extra. No se realizó una investigación nueva del mercado.

## Pruebas y límites de salida

El diagnóstico ejecutó 12 aserciones sintéticas sobre el motor actual: código 4 aislado queda en Revisar y fuera de `extra`; un caso cerrado con pausa de 15 minutos y extra de dos horas conserva referencias y `payableSeconds:null`. No son fichadas municipales.

Para la implementación: cero calculado frente a ausencia de intervalo; código 4 aislado; código 5 aislado; tramo cerrado más otra entrada extra; pausa sin regreso; marcas simultáneas; perfiles incompatibles; observación sin ubicación; cruce de medianoche; dos contratos/dispositivos que no se mezclan. El filtro y sus totales deben abarcar la ventana completa antes de paginar. CSV/Excel deben exportar todo el mismo filtro/corte y conservar referencias, sin archivo parcial ante 409 o revocación. Teclado y móvil deben permitir leer la secuencia, manteniendo la evidencia extensa bajo detalle y la frase «Referencia no homologada · sin aprobación salarial».

Esto mejora la revisión de marcas y prepara evidencia útil para A01; no cierra A01–A04, no determina tardanzas/ausencias ni acredita autonomía del colector con la PC apagada.

## WIP preparado tras autorizar la implementación

La implementación conserva las cantidades del motor y agrega al DTO v2 `summary`/`periodSummary.ordinaryIntervalCount` y `extraIntervalCount`, más `row.reconstructedEvents: [{eventRef, kind, day}]`. Esta última lista contiene exclusivamente referencias presentes en los eventos de esa fila: permite reconocer un evento usado por un tramo del día adyacente sin filtrar datos de otra persona ni señalar un falso pendiente. El contexto se procesa con los mismos emparejamientos; la salida pública v1 mantiene su contrato. Los lectores aceptan respuestas v2 anteriores sin esos metadatos y no convierten el cero de un resumen sin contadores en prueba de reconstrucción.

Pruebas focales: 140/140 aprobadas, incluidas 16 nuevas de presentación/HTTP y conservación v1. Navegador: 16/16 recorridos en Edge con idioma `es-AR`, todos los endpoints y mapas ficticios; CSV/Excel de 107 filas con filtro/corte conservados, revocación y cambio de revisión sin archivo parcial. Evidencia local: `verification/workday-review/results.json`, `desktop-synthetic.png`, `mobile-synthetic.png`. El escenario usa el shell publicado e05 más los cuatro assets WIP explícitos; no acredita publicación del cambio, una sesión municipal ni escritura en la base. No se ejecutó build global, SQL ni commit. El integrador debe reconstruir y verificar el artefacto conjunto antes de publicar este WIP separado de PR32.

Archivos de este WIP: `lib/attendance-workdays.js`, `lib/internal-attendance-workdays.js`, `assets/workday-panel.js`, `assets/workday-panel-model.js`, `assets/workday-panel.css`, `assets/workday-export.js`, `scripts/verify-workday-review-browser.mjs`, `tests/workday-review-presentation.test.js`, `tests/fixtures/workday-review-synthetic.js`, este documento y `scripts/verify-continuous-workdays-browser.mjs`. Este último sólo actualiza el idioma del contexto y la expectativa de «No reconstruido»; sus 14 recorridos originales deben repetirse sobre el build integrado. El runner nuevo de 16 recorridos sí se ejecutó sobre los assets WIP finales.

Para la integración, el runner usa Chromium de Playwright por defecto; `WORKDAY_BROWSER_CHANNEL=msedge` selecciona Edge explícitamente en Windows. Por defecto sirve `public` (o `BROWSER_SOURCE_ROOT`) y, antes de abrir el navegador, exige igualdad SHA-256 de los cuatro assets de jornadas con sus fuentes. Sólo `WORKDAY_REVIEW_WIP_OVERLAY=1` permite superponer fuentes WIP. El informe distingue `built-files-verified` de `explicit-wip-overlay` y registra hashes de fuente/bytes servidos y ruta. Los 16 recorridos citados arriba corresponden a la superposición WIP previa; la comprobación del build exacto integrado queda a cargo del integrador.

## Validación del incremento integrado

El integrador construyó un archivo aislado del árbol preparado `f76b5332667360e35900d5c988d52c3e2c505208`, basado en PR32, sin incorporar los cambios en ensayo de septiembre. `npm test`: **2.919 aprobadas, cero fallos u omitidas**. Sobre ese build pasaron **14 recorridos anteriores y 16 nuevos** de jornadas con Edge y `es-AR`; el runner nuevo registró `built-files-verified`, con los cuatro hashes iguales y sin superposición WIP. APIs y mapas sintéticos. Escritorio y móvil inspeccionados sin hallazgos bloqueantes. CSV/Excel conservaron el filtro completo de 107 filas y 217 eventos. Esto acredita el artefacto integrado; la publicación y sus bytes se comprueban separadamente.

La entrega también corrige el verificador restante de revisión de novedades 056: build antes de comparar, rutas canónicas y comparación con el HTML construido. Su smoke público y 21 comprobaciones de navegador sintéticas pasaron antes de integrarlo. No cambia su operación ni permisos.
