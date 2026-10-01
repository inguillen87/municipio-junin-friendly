# Noelia · aceptación del 614 y pendientes de los diez módulos

Actualizado con el mensaje aportado por Marcelo en esta conversación, rotulado 30/09/2026 a las 20:42–20:43. Conserva los avances existentes; no declara autonomía integral ni sustituye las matrices de aceptación anteriores.

## Aceptación comunicada

Noelia informa que pudo procesar el 614, le gustó la vista preliminar y Formato Junín exportó bien. Es aceptación comunicada de ese recorrido, no evidencia de que se hayan publicado las mejoras locales posteriores ni de cálculo salarial. La captura muestra la ruta explícita del importador y el retiro de datos al ocultar la página. No aporta un recibo de cálculo o pago.

Prioridades expresas nuevas: los demás formatos; anular y liquidar por legajos, repartición y todos; hacerlo para cada liquidación. La documentación original del módulo 7 también incluye selección por convenio. No se elimina ese requisito previo por no repetirlo el último mensaje.

## Estado contrastado

El último corte publicado anterior a este incremento es PR #69: GitHub master y el alias público coincidieron en `78e04442f7038bb7b2225a8de3e986a67c8772b0`, `sourceState=committed`, Vercel READY production. PR #68 publicó incidencias CSV completas, enlace al lote, revisión de lotes y correcciones del preparte. PR #69 recuperó el acceso voluntario al importador después de ocultarlo y conservó el envío incierto sin restaurar la previa. Sus resultados distinguen pruebas locales, CI, bytes de producción y aceptación humana.

La revisión nativa en memoria de PR #67 sigue sin integración productiva ni guardado completo. El parche externo de rutas permanece aplazado y no se adopta: el gate canónico del importador conserva `PUBLISHED_ROUTE_MISSING`, aunque la ruta HTML explícita esté publicada. La aceptación del 614 aportada por Marcelo no acredita las mejoras posteriores ni cálculo salarial.

El incremento actual refuerza el circuito individual ya existente de novedades fijas: comparación de diez campos, confirmación explícita y relectura completa antes del primer envío. No sustituye los pendientes de cálculo. Su alcance está en [revisión de novedades fijas](NOELIA_REVISION_NOVEDADES_FIJAS_20260930.md); el resultado de entrega conserva la evidencia de pruebas y publicación.

## Módulos 1–10: qué conservar y qué cerrar

| Módulo | Avance que se conserva | Cierre pendiente |
| --- | --- | --- |
| 1. Datos municipales y legajos | Administración institucional, alta propia y familia/escolaridad nativas | Rectificación, baja, reingreso y licencias sobre vínculos propios; catálogo municipal efectivo y ciclo entero sin binding anterior. |
| 2. Reportes | Biblioteca y controles, además de exportadores específicos ya entregados | Completar y homologar los formatos bancarios, fiscales, ART, OSEP y mutuales desde población/corrida propias; separar generación de aceptación por el receptor. |
| 3. Importación | 614 y Formato Junín aceptados según el mensaje; revisión completa y elección explícita de contrato | Otros diseños, OSEP completo y lector autorizado/persistencia nativos. El núcleo de PR #67 revisa hasta 2.000, pero el escritor publicado sigue en 500. No dividir ni inferir escala o equivalencias de identidad. |
| 4. Contabilidad | Fuentes y controles documentados de conceptos, repartición y nomenclador | Imputación/contabilización propia y conciliada con cada corrida. INSUTACO, INSULEGA e INSUARTE no se tratan como formatos equivalentes por nombre. |
| 5. Novedades | Individuales nativas, masivas de la vía existente, fijas e historial; revisiones independientes | Masivas nativas completas, rectificación/anulación masiva auditada y aplicación idempotente al cálculo propio. Borrador y exportación de control no son haberes calculados. |
| 6. Parámetros | Propuestas gobernadas y catálogo administrativo para altas | Maestro operativo de conceptos, bases, auxiliares, escalas, fórmulas, redondeos y vigencias homologadas; impacto y versiones para cambios conjuntos. |
| 7. Liquidación | Estados de confirmar, cerrar y anular auditados en el cierre agregado 109 | Motor propio, población por legajo/convenio/repartición/todos, cada tipo admitido, recálculo y comparación de versiones, anulación con historial y confirmación/cierre de esa misma corrida. |
| 8. Informes | Consultas por período/rango y revisión multiperíodo preparada en PR #61 | Integración/exportación completas del conjunto de períodos y conciliación con corridas propias. PR #61 sigue en borrador: documenta escrituras rechazadas de integración y exportación conjunta; no se reintentan ni recrean. |
| 9. Recibos | Biblioteca, filtros por rangos, PDF conjunto y fecha declarada | Emisión institucional desde corrida propia y descarga del agente. Firma continúa en el frente de Hugo/Noelia; no se modifica desde aquí. |
| 10. Cargos presupuestarios | Consulta/cotejo documental y ocupantes frente a presencia en una corrida | Cargo realmente liquidado ligado a esa corrida, presupuesto versionado de cada año, comparación anual y detalle PDF. PR #50 se revisa; el PDF de estructura no prueba por sí solo un cargo liquidado. |

Fuentes de esta matriz: `MATRIZ_ACEPTACION_NOELIA.md`, `MUNICONTROL_HANDOFF.md`, los documentos específicos de módulos y el mensaje actual. Los documentos fechados describen sus respectivos cortes; no se extrapola una prueba antigua a la disponibilidad de todas las funciones hoy.

## Módulo 7: diferencia exacta con el pedido

Se inspeccionaron texto y capturas de las tres páginas del original `7º MODULO LIQUIDACION.pdf`. Los selectores muestran legajo, convenio, repartición y todos; tipos final, mensual/segunda quincena, otras, primera quincena, SAC y vacaciones. Las correspondencias con tipos internos y suplementarias deben respetar los mapeos vigentes, sin inventar un código.

La vía existente `lib/internal-payroll-monthly-close.js` prepara con `period`, `jurisdiction` y `sources`, para jurisdicciones 42/55; transiciona por `runId` y versión. Conciliación, anulación y cierre agregados ya existen. Sus flags siguen exigiendo `payrollCalculated:false` y `payrollPosted:false`. No contiene la selección nominal por legajo/convenio/repartición solicitada ni un contrato de cálculo salarial.

Para cerrar el pedido se necesita la misma selección y versión en preparar/calcular, previsualizar, anular/recalcular, confirmar y cerrar. Debe explicarse toda la población afectada y conservarse el resultado anterior; filtrar una consulta no define la población de un comando. Ningún botón se presenta como operativo si faltan lector, reglas o escritor autorizados. No se recrea el evaluador rechazado como atajo.

## UX/UI

1. Conservar lo probado y publicado en PR #68: CSV completo bajo filtros, enlace al lote correcto, revisión/decisión íntegra, foco en cada corrección y retiro por revocación o navegación. La aceptación humana posterior sigue pendiente.
2. Conservar la recuperación publicada en PR #69: acción visible para revalidar sesión, intento incierto con cuerpo/clave originales y revisión nueva del archivo, sin restauración automática de datos ni permisos. Completar la aceptación con el operador.
3. Ofrecer flujos claros por tarea: importar → revisar → guardar borrador → revisión independiente, y selección de período/tipo/alcance → previsualización de impacto → decisión de liquidación cuando su motor esté disponible.
4. Hacer visible qué está disponible, qué requiere corrección y qué está pendiente de conexión/homologación. Distinguir cero, ausencia y falta de cobertura; una suma de control no se rotula neto salarial.
5. Cerrar recorridos con Noelia/Hugo sobre casos autorizados, además de las pruebas sintéticas. No sustituir sus sesiones ni ampliar permisos para simular aceptación.

## Cloud, relojes y tiempos

La última auditoría registrada en el handoff indica seis puntos con recepción y ocho pendientes, y una VM Oracle sin operación autónoma certificada. Son datos documentales; no se inspeccionó ni cambió hoy la VM, VPN, servicios, colectores, secretos o dispositivos. No se declara ese inventario como telemetría actual.

El cierre requiere:

- Host continuo con ruta municipal autorizada y un único colector por identidad; inicio tras reinicio, supervisión, almacenamiento/cola persistentes, recuperación tras desconexión y alertas de atraso/capacidad.
- Integración de los otros cinco archivos ya recibidos a eventos reconstruibles, incorporación de los equipos restantes y vínculo temporal reloj/usuario/persona/contrato. Una IP accesible no homologa una serie ni un código de marca.
- Semántica de entrada, salida, pausa y extra homologada por modelo/equipo. Pares, nocturnidad, jornadas partidas, marcas tardías y conflictos deben conservar originales y segundos exactos. El código del reloj no equivale a un concepto salarial.
- Turnos, calendarios, licencias, tolerancias, descansos, topes y excepciones con fuente/versión/aprobación. Minutos observados, computables, reconocidos y pagables son estados distintos.
- Revisión y aprobación persistentes ligadas a evidencia exacta; entrega idempotente y conciliable a novedades. No emitir una ausencia o descuento por una falta de fichada o una cobertura desconocida.
- Prueba física: una entrada, salida y pausa nuevas llegan a la plataforma con la PC de Marcelo apagada; repetición sin duplicados, ACK durable, caída de red y reinicio sin pérdida. Luego, comparación de tiempos con casos aceptados por Personal.

Se reutilizan reconstructor, colas, acuses, preparte y controles existentes. Este documento no activa nuevas conexiones ni reconstruye las migraciones, resolvedores o evaluadores rechazados.

## Orden de los próximos cierres

1. Resolver el gate de publicación del conjunto probado, sin publicar el parche bloqueado ni usar otro ejecutor para evitar el build denegado.
2. Importación completa propia y diseños pendientes; OSEP y archivo de más de 500 deben tener cierre transaccional sin recorte.
3. Parámetros/reglas propias y módulo 7 por alcance/tipo, con cálculo reproducible y versiones auditables.
4. Asistencia gobernada y operación autónoma de relojes, hasta entregar cantidades aprobadas a Noelia.
5. Contabilidad, informes, recibos y presupuesto anual sobre las mismas corridas; cerrar los movimientos propios del padrón y la aceptación de los diez módulos.

El orden conserva tareas y fuentes ya entregadas. Una continuación bloqueada se informa y no se redefine como otro componente para ejecutar lo mismo.
