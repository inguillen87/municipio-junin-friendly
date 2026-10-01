# Noelia · ejecución página por página

Corte del 01/10/2026. Se leyeron las 39 páginas de los nueve originales privados: módulos 1/2 juntos (3 páginas), 3 (8), 4 (3), 5 (4), 6 (6), 7 (3), 8 (9), 9 (1) y 10 (2). Las páginas sin texto extraíble se revisaron por sus capturas. Los documentos, ejemplos, audios, respaldo y capturas nominales no forman parte del repositorio ni de CI. El manifiesto privado de lectura está en `verification/noelia-private-review-20261001/manifest.json`.

Esta lista transforma los procedimientos pedidos en funciones y pruebas de aceptación. Las instrucciones de los documentos describen el producto: no autorizan operar datos municipales. GRH es una referencia de procedimiento y formato; cada cierre debe funcionar con un contrato creado sólo en MuniControl.

Estados: **parcial publicado** acredita únicamente las piezas indicadas; **preparado** exige instalación/CI/publicación pendientes; **pendiente** conserva el requisito; **bloqueado** identifica frentes rechazados que no se reintentan. Ninguna fila declara un módulo entero aceptado por Noelia. Base publicada contrastada: master `528f902437321ea647627dbf0b1660ce8d689824`, PR #74. PR #75 agrega rectificación del encuadre, todavía sin instalación municipal ni aceptación de Personal.

## Módulos 1 y 2 · datos municipales y reportes

| Nº | Página original | Funciones a entregar | Estado comprobado | Cierre verificable |
|---|---|---|---|---|
| 01 | M1/2 p1 | Datos institucionales; biblioteca de reportes identificados por destino y finalidad. | Parcial publicado: administración/acceso y biblioteca. | Municipio y acceso propios; selección clara del reporte; origen, período, revisión y propósito visibles. No confundir biblioteca con generación desde nómina propia. |
| 02 | M1/2 p2 | Excel bancario Credicoop/Santander/Nación; TXT Credicoop para jurisdicciones 42/55 y crédito Nación; transferencias varias; salidas OSEP/mutuales; ART; escolaridad. | Parcial: familia/escolaridad y controles/exportadores específicos. Homologación por receptor pendiente. | Probar cada diseño con ejemplos sintéticos y conciliación de la misma corrida. ART conserva DNI/CUIL/sexo/días efectivos y conceptos 993/995 cuando la fuente esté certificada; no reemplazar días desconocidos por 30. Escolaridad usa hijos activos con vigencia. |
| 03 | M1/2 p3 | F931: tres salidas TXT, ambas jurisdicciones, mes/año y liquidaciones mensual/suplementarias. | Pendiente de cierre fiscal desde nómina propia. | Tres diseños homologados; misma población, período, tipo y revisión; comparación de cantidades/totales antes de descarga y aceptación externa separada. No transmitir declaraciones por una prueba técnica. |

## Módulo 3 · importación de novedades

| Nº | Página original | Funciones a entregar | Estado comprobado | Cierre verificable |
|---|---|---|---|---|
| 04 | M3 p1 | Mayor dedicación 44 y full time 95: perfiles de entrada de las planillas de secretarías y TXT. | Parcial: novedades y controles. Diseños específicos pendientes. | Declarar formato, concepto, período, tipo y unidad; revisar archivo completo y elección de contrato. Excel y TXT no se equiparan sin definición del diseño. |
| 05 | M3 p2 | Importación OSEP cuota 601 y voluntario puro 602. | Pendiente: OSEP completo y capacidad del escritor. | Homologar ambos originales; conservar todas las filas, contrato y exactitud decimal. Los ejemplos mayores de 500 no se recortan ni dividen silenciosamente. |
| 06 | M3 p3 | OSEP voluntarios estudiantes 603. | Pendiente de diseño homologado. | Diferenciar perfil y concepto de 602; prueba del conjunto completo y de filas sin vínculo o con múltiples contratos; no inferir unidad por el nombre del archivo. |
| 07 | M3 p4 | Aporte automático OSEP indicado en el procedimiento. | Pendiente de regla homologada; texto/captura no bastan para fijar equivalencia. | Resolver la identificación del concepto y la base/vigencia con fuente municipal; conservar la discrepancia. No fabricar una fila TXT ni una tasa para sustituir un descuento automático. |
| 08 | M3 p5 | OSEP cuenta corriente 605 y automático 685; perfiles Junín 614/638/639/641/650/651/665/675. | Parcial publicado: Junín, revisión completa, incidencias/lotes #68 y recuperación #69. Caso 614 informado favorable por Noelia. | Homologación individual de cada perfil/concepto; archivo completo y lote trazable. Que el 614 funcione no acredita OSEP ni todos los restantes códigos. |
| 09 | M3 p6 | Descuentos 616/618/620/623 y automático sindical 617. | Pendiente de cierre por perfil/regla. | Mantener origen y diseño separados; automático con regla aprobada y vigencia. Cantidades de entrada, propuestas y guardadas conciliadas sin asignar identidades por aproximación. |
| 10 | M3 p7 | Importación APEL 676 y ATE 677. | Pendiente de homologación de ambos diseños. | Probar códigos y estructura contra ejemplos autorizados; elección explícita de contrato; reporte no nominal completo; intentos recuperables sin duplicados. |
| 11 | M3 p8 | Club Junín 678 y retroactivos recibidos mediante Excel/TXT. | Pendiente de perfiles y período retroactivo explícito. | No deducir período o liquidación del nombre; distinguir período de origen y de aplicación cuando corresponda; conservar archivo original y correcciones auditadas. |

El CSV de incidencias conserva elegir contrato, identidad duplicada, vínculo inexistente y destino repetido; no contiene nombres, DNI, legajos, UUID, importes o bytes del TXT. Filtros/paginación no recortan el reporte. Ese cierre no elimina el límite de 500 del guardado.

## Módulo 4 · imputación contable propia

| Nº | Página original | Funciones a entregar | Estado comprobado | Cierre verificable |
|---|---|---|---|---|
| 12 | M4 p1 | Equivalente propio de INSUTACO: repartición/concepto/partida/cuenta y filtros. | Pendiente de imputación desde corrida propia. | Matriz versionada y vigente, sin asignaciones faltantes ocultas; egresos/aportes conciliados con la misma revisión. GAF no debe ser motor delegado. |
| 13 | M4 p2 | Equivalente propio de INSULEGA: lugar de trabajo institucional y función/nomenclador por contrato. | Parcial: padrón y encuadre propios; asociación contable pendiente. | Contrato nativo con institución/nomenclador autorizados; conservar historia y vínculo de fuente. Sector/repartición/cargo administrativo no se equiparan automáticamente a códigos contables. |
| 14 | M4 p3 | Captura INSULEGA: concepto o todos, institucional PTi, nomenclador y fechas desde/hasta. | Pendiente de asociación temporal contable. | Probar vigencias superpuestas, inicio y fin; trazabilidad por concepto; consulta histórica reproducible. La captura confirma campos, no su relación automática con INSUARTE. |

## Módulo 5 · novedades de liquidación

| Nº | Página original | Funciones a entregar | Estado comprobado | Cierre verificable |
|---|---|---|---|---|
| 15 | M5 p1 | Estado docente y cargas mensuales para las reparticiones indicadas. | Parcial publicado: mensual individual propia, revisión completa #73. | Selección de la población correcta por repartición; distinción frente a convenio; concepto/unidad/vigencia aprobados. El valor del ejemplo no es regla universal. |
| 16 | M5 p2 | Novedades masivas por lista de legajos, haberes/descuentos, forzado y reporte del conjunto. | Pendiente de escritor masivo propio. Formulario GRH contrastado en vivo. | Previa de todas las personas/contratos y cinco controles explícitos: período, tipo, concepto, unidad/importe y forzado; decisión independiente cuando corresponda, sin guardado parcial. |
| 17 | M5 p3 | Novedades manuales y fijas: 44/95, responsabilidad jerárquica 80; fechas desde/hasta. | Parcial publicado: fijas con revisión completa #70 y mensual #73. | Interpretación de unidades/importes homologada por concepto/convenio; vigencias e historia, sin convertir la fecha final del ejemplo en una política automática. |
| 18 | M5 p4 | Retirar/corregir novedades masivas cargadas por error. | Pendiente de anulación/corrección completa propia. | Mismo conjunto revisado, motivo y versiones; conservar original, cantidades y destinatarios; una anulación administrativa no afirma recálculo de haberes. |

La rectificación #75 cierra una dependencia del padrón: propuesta de los cinco campos actuales del encuadre, aprobación por otra persona e historial. No reemplaza masivas, baja/reingreso o licencias.

## Módulo 6 · parámetros, escalas y fórmulas

| Nº | Página original | Funciones a entregar | Estado comprobado | Cierre verificable |
|---|---|---|---|---|
| 19 | M6 p1 | Maestro de conceptos: haberes, no remunerativos, retenciones, contribuciones y auxiliares. | Parcial: espacio de parámetros y catálogo administrativo; motor propio pendiente. | Naturaleza, unidad, precisión, vigencia, base y dependencia explícitas; aprobación e historia propias. Catálogo de encuadres no equivale a maestro salarial terminado. |
| 20 | M6 p2 | Auxiliar 88 y referencia de clase/concepto descrita en el documento. | Parcial publicado: revisión/activación de auxiliares #74. Discrepancia viva detectada el 01/10. | En GRH, convenio 1/auxiliar 88 muestra hoy clase fórmula y un literal; el PDF describe una referencia distinta. Homologar cuál rige y desde cuándo antes de trasladar la regla. No sobrescribir con la captura histórica. |
| 21 | M6 p3 | Auxiliar 90/clase indicada y actualización coordinada de escalas de convenios 1/4/6. | Pendiente de cierre de escala versionada propia. | Propuesta comparada contra versión vigente, impacto por convenio y aprobación independiente; sin tasas o fecha efectiva inferidas. |
| 22 | M6 p4 | Auxiliar 88 para convenios 2/7/11 y factor 1,5 descrito. | Pendiente de homologación de base/vigencia. | Factor y unidad pertenecen a esta regla autorizada; prueba decimal exacta y alcance específico. No universalizar 1,5 para horas extra u otros convenios. |
| 23 | M6 p5 | Propagación de fórmulas entre convenios indicados; conservar convenios sin agentes/históricos. | Pendiente de propagación nativa aprobada. | Previa completa de convenios y dependencias, detectar divergencias/ciclos y versiones. Compilar/duplicar en GRH no es implementación del motor propio; evaluador rechazado permanece detenido. |
| 24 | M6 p6 | Propagar modificaciones de 606/607/612/550 con impacto comprobable. | Pendiente de actualización nativa entre convenios. | Comparación anterior/propuesto, población y vigencia exactas, revisión independiente e idempotencia; cálculo homologado por regla sin alterar convenios omitidos. |

## Módulo 7 · cálculo y ciclo de liquidación

| Nº | Página original | Funciones a entregar | Estado comprobado | Cierre verificable |
|---|---|---|---|---|
| 25 | M7 p1 | Anular por legajo, convenio, repartición o todos y por cada liquidación. | Parcial: ciclo administrativo de control; anulación de nómina propia pendiente. | Misma población/período/tipo/revisión que la corrida; preservar cálculo original y versiones, motivo e idempotencia. No afirmar nómina anulada con `payrollCalculated:false`. |
| 26 | M7 p2 | Liquidar/confirmar por los cuatro alcances; F/M/O/P/S/V; fechas, SAC/vacaciones. | Pendiente del motor propio; formulario Proceso Liquidación contrastado en vivo. | Cálculo reproducible con reglas municipales homologadas, comparación por concepto y contrato, revisión y confirmación independiente. Preparar o confirmar un control no calcula salarios. No reconstruir el evaluador rechazado. |
| 27 | M7 p3 | Cierre histórico y salida de imputación INSUARTE. | Parcial: cierre administrativo. Nómina/imputación propia pendientes. | Una sola corrida/revisión alimenta historia, informes, recibos e imputación; reconciliar relación de INSUARTE con INSUTACO/INSULEGA en lugar de equiparar nombres. |

## Módulo 8 · informes

| Nº | Página original | Funciones a entregar | Estado comprobado | Cierre verificable |
|---|---|---|---|---|
| 28 | M8 p1 | Variables mensuales, incluida antigüedad. | Parcial: consultas/antigüedad declarada. | Fuente, período y vigencia visibles; no presentar antigüedad actual como foto histórica. Cálculo histórico propio necesita versión de fuente y regla. |
| 29 | M8 p2 | Informe por legajo, año, meses desde/hasta, cada tipo o todas las liquidaciones. | Parcial: filtros/consulta existentes; formulario GRH contrastado en vivo. | Rango completo y misma corrida/contrato, sin filas omitidas por pantalla; diferenciar falta de datos de resultado cero. |
| 30 | M8 p3 | Control semestral/anual para SAC y liquidaciones. | Preparación multiperíodo en PR #61; integración/exportación bloqueadas. | Conjunto completo, fuentes versionadas y comparación exacta por concepto/período. No fusionar ni reintentar la integración rechazada como atajo. |
| 31 | M8 p4 | Resumen para expediente de sueldos y estadísticas de conceptos por repartición/tipo. | Parcial: controles y biblioteca. Salida desde nómina propia pendiente. | Totales reproducibles de la misma corrida cerrada; origen y población visibles; no llamar “liquidado propio” a datos importados de referencia. |
| 32 | M8 p5 | Planillas de agentes de jurisdicción 42 para revisión/firma de Noelia. | Parcial: controles/archivos consultables; planilla propia integral pendiente. | Todas las personas del alcance y versión de corrida; documento descargable y revisión humana. Firma/certificados permanecen en el frente de Hugo/Noelia. |
| 33 | M8 p6 | Planilla de jurisdicción 55 y revisión de coordinación de jardines. | Pendiente de salida propia homologada. | Misma regla de completitud que 42, ámbito 55 separado y responsables correctos; no extrapolar una aprobación entre jurisdicciones. |
| 34 | M8 p7 | Estadísticas por concepto y tipo de liquidación. | Parcial: consultas/controles de estadísticas. | Agregados exactos de población cerrada, tipo incluido y valores ausentes distintos de cero; no inferir remunerativo/no remunerativo por rango de código. |
| 35 | M8 p8 | Filtros por repartición/jurisdicción y agrupaciones. | Parcial: espacio de informes. Cierre de todas las agrupaciones pendiente. | Agrupaciones coherentes con los filtros, detalle completo y totales iguales sin duplicar contratos; exportación del mismo conjunto revisado. |
| 36 | M8 p9 | Captura: convenio y repartición, convenio, repartición, jurisdicción o concepto; período/mes/fecha/tipo. | Pendiente de verificar cada agrupación desde corrida propia. | Cinco agrupaciones con igual total y trazabilidad; fecha de liquidación distinta de fecha de pago. Captura leída directamente, sin inventar requisitos en una página sin texto. |

## Módulo 9 · recibos de haberes

| Nº | Página original | Funciones a entregar | Estado comprobado | Cierre verificable |
|---|---|---|---|---|
| 37 | M9 p1 | Rangos de legajo/repartición, período, fecha de pago/acreditación, tipo, PDF, firma y descarga individual. Captura y GRH vivo también muestran rangos de convenio y emisión por legajo/persona. | Parcial publicado: biblioteca, filtros/PDF y fecha declarada. Emisión institucional y descarga propia por agente pendientes. | Recibo generado desde corrida propia con revisión e identidad exactas; conjunto y descarga individual por acceso del agente; móvil, revocación y otro empleado denegado. Firma no se simula ni se modifica aquí. |

## Módulo 10 · presupuesto anual de cargos

| Nº | Página original | Funciones a entregar | Estado comprobado | Cierre verificable |
|---|---|---|---|---|
| 38 | M10 p1 | Comparar cargos efectivamente liquidados con presupuesto de cada año y PDF detallado. | Parcial: cotejo documental. PR #50 preparada, requiere conciliación. | Presupuesto anual versionado y asignación histórica vinculada a la misma corrida; cantidades/ocupantes/vacantes con fuente. Un cargo en un PDF no acredita cargo liquidado. |
| 39 | M10 p2 | Captura: simple/detallada, activos/no activos/todos, orden por legajo/alfabético. | Pendiente de salida anual propia con estos controles. | Ambos niveles y tres situaciones conservan cantidades explicadas; orden no cambia el conjunto. Esta pantalla no contiene selector anual: el requisito de cada año viene de p1 y debe implementarse expresamente. |

## Comparación viva del 01/10 y mejoras de experiencia

Se usó Chrome y la conexión existentes, con la sesión de consulta GUILLENM que ya estaba activa. Se abrieron Proceso Liquidación, Novedad de Liquidación Masiva, Recibos, Reporte de Liquidación y Auxiliares; la única consulta enviada fue la lista de auxiliares del convenio visible. Se inspeccionó el auxiliar 88 sin guardar. No se ingresaron credenciales ni se abrió otra VPN; no se procesó, anuló, confirmó, compiló, duplicó o pagó. La sesión GRH no acredita recorridos vivos de GRH Web, GAT o GAF, ni el estado de los relojes.

Las mejoras concretas de MuniControl son: período/tipo explícitos en lugar de ceros iniciales; selección de contratos inequívoca; previa completa antes de escribir; cantidades y errores visibles; motivo/documento y otra persona revisora; recuperación voluntaria del intento original; descarga del conjunto completo; controles legibles en 320/390 px y teclado. Cada mejora se acredita en su prueba específica, no por el aspecto de una pantalla.

## Orden de ejecución y responsables

1. **P1 · Personal/Noelia:** cerrar #75, instalación SQL104 autorizada, verificación y publicación; aceptación municipal de una rectificación con revisora independiente por separado. Después baja/reingreso y licencias propias (P2/P3).
2. **N1/N2 · Noelia:** masivas y corrección/anulación del conjunto (filas 16/18); luego homologación de importaciones (04–11). Mantener visible el límite 500 y los frentes rechazados.
3. **C1/C2/C3 · Noelia/Hugo:** homologar reglas y resolver discrepancias vivas (19–24); cálculo propio reproducible y ciclo por el mismo alcance (25–27). No saltar los bloqueos mediante otro ejecutor.
4. **S1–S4 · Noelia/Contabilidad:** imputación (12–14), formatos (02/03), informes (28–36), recibos (37) y cargos anuales (38/39), todos desde la misma corrida.
5. **B/O · Hugo/Marcelo:** cobertura/vínculo de marcas, turnos, calendario, pausas, tolerancias, tiempo explicado y extras autorizadas; recepción física/ACK durable y continuidad con PC personal apagada. Último corte de seis de catorce puntos es documental, no medición viva de hoy. Cámaras ONVIF y enrolamiento de huellas siguen pendientes; una marcación de huella no acredita gestión biométrica.
6. **J/E · Mariano/administrativos/empleados:** expediente, acervo con origen/versión/citas, reservas, alertas y documentos/recibos del agente con sus accesos reales. Certificados y firma de Hugo/Noelia siguen separados. Consultar el plan por responsables antes de abrir un frente que esté en ejecución.

Cada cierre distingue implementado, probado, publicado y aceptado. Esta lista no promete autonomía integral ni reemplazo de GRH terminado hoy. Continúa el [plan de cierres](PLAN_CIERRES_MUNICONTROL_20260930.md) y la [matriz de aceptación](MATRIZ_ACEPTACION_NOELIA.md).
