# Tiempo, ausentismo y operación municipal · ampliación del plan

## Alcance y base del pedido

Pedido de Marcelo del 24/09/2026, sustentado en capturas de Ausentismo y Relojes: demora inicial, ceros poco explicados, comparación porcentual inválida, una fecha final de 2033 marcada como rango válido, salto al legajo sin contexto, paneles de recepción separados y cálculo de tiempos difícil de encontrar. Esta ampliación complementa `ASISTENCIA_CALCULO_Y_APROBACION_HUGO_20260923.md`, `MATRIZ_ACEPTACION_NOELIA.md` y `PROYECTO_INTEGRAL_JUNIN_20260919.md`; no elimina sus pendientes ni sus criterios de aceptación.

Fuentes funcionales revisadas: Noelia, módulos 1–2 (reportes), 3 (importación de novedades), 5 (novedades manuales/masivas/fijas), 6 (parámetros), 9 (recibos) y 10 (estructura presupuestaria). En el módulo 5.3 se nombran presentismos, mayor dedicación y Full Time; el módulo 3 distingue las cantidades recibidas de secretarías. No se encontró una regla de horario o recargo de extras que pueda activarse como aprobada sólo a partir de estos documentos. No se confunden códigos 4/5 del reloj con conceptos salariales 44/95.

## Incremento implementado en este trabajo

| Área | Función | Alcance verificable |
|---|---|---|
| Ausentismo / consultas | Reducir combinaciones de tablas innecesarias y agrupar claves antes de consultar los catálogos | Mismo período, filtros, filas y controles; sin caché compartida ni escrituras en la fuente. |
| Ausentismo / carga | Indicadores y detalle se presentan por separado; búsqueda y paginación no recalculan todo | Filtros visibles durante carga, cancelación de consultas anteriores, reintento por sección y tiempo máximo de respuesta. |
| Ausentismo / semántica | Nulo deja de convertirse en cero; el filtro vacío explica su alcance | Un denominador previo cero no muestra 0 %. Quitar motivo/sector conserva las fechas. |
| Ausentismo / caso | Expandir el evento en la tabla | Fecha, motivo, días/cantidad, clasificación y alerta; sin otro viaje al servidor. El legajo completo queda como acción secundaria. |
| Ausentismo / búsqueda | Nombre o legajo en todo el listado del período | Búsqueda parametrizada en servidor, limitada al permiso nominal. No se guarda el texto en la URL de navegación. |
| Calidad de fechas | Rango superior a 366 días marcado para revisión | Umbral técnico, no duración legal máxima. La fecha original se conserva; no se transforma en días descontados. |
| Relojes / entrada al módulo | Abrir el tablero en gráficos y ofrecer atajos por tarea | Panorama, jornadas/cálculos, marcaciones y observaciones; sin reinterpretar el estado del equipo. |
| Relojes / lectura | Resumen de entradas, salidas, pausas y marcas extra declaradas | Coincide con el total del filtro. Un modelo no compatible no recibe semántica K20 por defecto. |
| Jornadas / análisis | Distribución de tiempos ordinarios, extra y pausas del filtro completo | Reutiliza el resumen del reconstructor; no suma sólo la página visible ni cuenta pausas dos veces. |
| Jornada / comparación rápida | Comparar la secuencia completa con una duración ingresada HH:MM | Resta pausas según los intervalos; conserva segundos y muestra diferencia. No guarda un turno ni genera horas pagables. Secuencias incompletas o sin identidad quedan para revisión. |

La verificación de publicación, CI y pruebas se acredita por el commit y el recibo de entrega. Las pruebas de interfaz usan datos sintéticos; las consultas de rendimiento usan la fuente real en modo lectura. Ninguna de ellas equivale a una aceptación de Hugo o Noelia.

## Rendimiento observado y objetivos

Antes del cambio, la misma consulta agregada del 01/08 al 10/09 tardó 13,594 segundos con motivo 20 y 13,959 segundos sin motivo. Los indicadores filtrados resolvían en menos de un segundo; las dos listas de filtros y el control global añadían el retraso principal. Después de reducir esos cruces, las mediciones fueron 1,683 y 1,804 segundos, respectivamente, con iguales resumen, serie y comparación. Son mediciones directas del backend en ese entorno/corte, no un percentil de producción ni una garantía para todas las páginas.

Objetivos para los siguientes cierres: medir p50/p95 por recurso y tamaño de período; separar arranque en frío de navegación; evitar trabajo de listados y mapas fuera de la tarea activa; mantener cancelación, límites y paginación en servidor. El rendimiento no se consigue omitiendo calidad, mezclando períodos o usando una caché nominal compartida entre municipios.

## Sprints que siguen: criterios para declarar terminado

| Prioridad / sprint | Resultado de trabajo | Cierre exigido |
|---|---|---|
| P0 · A1 Parque único | Una tarjeta por equipo, con archivo original, marcaciones incorporadas, vínculo laboral y cobertura separados | Unir por UUID/serie y punto verificados, no por nombre o posición. PM10 es un equipo más. Dos cortes diferentes no se rotulan como una consulta atómica. |
| P0 · A2 Incorporación pendiente | Pasar originales de los otros cinco equipos al circuito gobernado de eventos consultables | Primera y última marca conciliadas, reenvío sin duplicar, códigos homologados por modelo, desconocidos conservados y prueba de consulta nominal con permisos. |
| P0 · D1 Fuente 22/09 | Carga sucesora coordinada del núcleo y personal | Paquete/instalador, comparación con base operativa, conservación de nativos, restauración y aceptación de capacidad. La migración 106 publicada como código no demuestra que esté instalada. |
| P1 · B1 Ficha de asistencia contextual | Agente, período y jornada con línea temporal, incidencias y documentación autorizada | Abrir/cerrar conserva filtros y posición. No exponer diagnósticos clínicos a quien sólo debe revisar tiempo. Histórico de la persona se consulta con alcance de contrato y municipio. |
| P1 · B2 Ausentismo accionable | Bandeja de casos: sin justificar, justificante pendiente, superposición, fecha dudosa, turno/cobertura faltante | Estados definidos por evidencia y acción persistida, no por colores del gráfico. Cada caso tiene responsable, fecha límite, historial y motivo de decisión. |
| P1 · B3 Reglas y calendarios | Turnos vigentes, feriados, pausas, tolerancias, topes y excepciones por contrato | Fuente y versión de cada regla, casos acordados con Personal; no asumir una jornada uniforme para todos. |
| P1 · B4 Cálculo y revisión | Tiempo observado → computable → reconocido; diferencias y aprobación independiente | Noches, turnos partidos, dos relojes, marcas tardías, licencia parcial y cambio de contrato. Falta de fichada no produce una ausencia definitiva. |
| P1 · B5 Entrega a Noelia | Novedad aprobada por concepto/período/unidad con comprobante y revisión | Envío idempotente, rechazo recuperable, conciliación y trazabilidad hasta la revisión de asistencia; sin doble novedad. |
| P1 · A3 Aplicación/colector | Instalación municipal, servicio, cola persistente, reintentos y diagnóstico por equipo | Reinicio y pérdida de red recuperables; prueba con la PC personal apagada; certificados/secretos privados; actualización y reversión controladas. |
| P2 · C1 Salidas y cierre | Formatos bancarios/fiscales, recibos y presupuesto del ejercicio | Homologación contra los documentos de Noelia, no confundir archivo de control con pago o emisión oficial. |

La unificación visual del archivo y la recepción no se completó en este incremento: siguen siendo dos consultas existentes. El nuevo tablero y los cálculos sólo operan sobre las marcas que el backend ya puede consultar; no presentan como conciliados los cinco relojes que tienen únicamente archivo original.

## Noelia: ausentismo debe llegar a una decisión y a una novedad

El circuito propuesto —ampliación de producto, no transcripción de un módulo entregado— es: detectar el caso, revisar evidencia de fecha/turno/licencia, registrar resolución por un responsable autorizado, calcular el efecto bajo una regla vigente, revisar independientemente y entregar la cantidad aprobada a novedades. Presentismo, mayor dedicación y Full Time mantienen sus conceptos y unidades, no se deducen de una barra horaria.

Los módulos 1–2 conservan sus listados y formatos; 3, la recepción validada de novedades; 4, INSUTACO/INSULEGA e integración contable; 5, individuales/masivas/fijas con corrección auditada; 6, parámetros/escalas/fórmulas; 7, confirmación y cierre. El módulo 9 sigue exigiendo rango de legajos y reparticiones, período, fecha de pago, tipos, PDF, firma y descarga por agente. El módulo 10 sigue exigiendo confrontar cargos liquidados con presupuesto anual, no solamente listar la estructura.

## Hugo: preparación y aprobación de Personal

Debe poder filtrar por punto, área, persona, día y causa; revisar la secuencia original junto al tiempo reconstruido; agregar una corrección fundada sin sobrescribir el reloj; devolver, rechazar o aprobar según sus capacidades reales. Si preparó/corrigió la revisión, la aprobación independiente corresponde a otro usuario autorizado. Ni su nombre ni el rol técnico conceden por sí solos una facultad de aprobación.

## Mariano: normas aplicables y decisiones documentadas

Vincular las reglas de licencias, horarios y extras con la norma/documento vigente en su ámbito. La capa jurídica debe permitir revisar vigencia, alcance, versiones, contratos/expedientes y plazos del caso; no sustituye el control administrativo ni decide automáticamente sobre salud, sanciones o haberes. Persisten los pendientes de corpus real, relaciones jurídicas, alertas entregadas y aceptación de los seis circuitos de su área.

## Superadministrador y expansión a otros clientes

Administración por municipio/empresa: responsables y capacidades, fuentes y dispositivos, uso/costos, estado de conectores, políticas y versiones, alertas técnicas y auditoría. Las plantillas de configuración pueden reutilizarse; las fórmulas, horarios, identidades y permisos no se copian a otro cliente sin configuración y aprobación. Costos de Neon/Vercel/almacenamiento se separan por destino; no se activa un plan pago global para resolver el límite de un solo municipio.

No mostrar toda la información nominal desde el tablero técnico. El acceso de soporte debe ser acotado y auditable; no equivale a firmar recibos o aprobar novedades en nombre de los usuarios.

## Condiciones transversales

Sin series o denominador válido se muestra ausencia de evidencia, no 0 %. Las cifras describen eventos o tiempo observado, no productividad ni culpabilidad. Búsquedas, filtros y exportaciones usan el mismo alcance y distinguen página de total; los filtros de detalle no alteran silenciosamente los indicadores generales. Toda escritura exige validación del servidor, historial e idempotencia; cada sprint termina con pruebas, build, commit, despliegue verificado y alcance pendiente explícito.


## Revalidación del incremento final

Conservando también la inclusión original por contrato en las listas de filtros, la última medición fue 2142 ms con motivo 20 y 1457 ms sin motivo, frente a 13594 y 13959 ms. Resumen, serie mensual, comparación y corte resultaron iguales en ambas versiones. La prueba no cambia la base ni equivale al tiempo total HTTP de una sesión municipal.

El tablero de trabajo se presenta antes que los inventarios técnicos; «Equipos y recepción» permite llegar a ellos sin alterar sus fuentes. La comparación de jornada no comparte el componente de incidencias y no convierte la ausencia de tramos completos en cero horas. Los cambios sin aplicar en los filtros sobreviven a una respuesta tardía; salir de la página retira las filas nominales.


## Incremento del 24/09 · cotejo de estructura y nómina

`NOELIA_COTEJO_ESTRUCTURA_NOMINA_20260924.md` añade presencia agregada de legajos contra una corrida concreta, PDF/CSV completos y revalidación de lectura. No valida el cargo de esa corrida ni el cupo aprobado del ejercicio y no cierra los pendientes de relojes, recibos o respaldo sucesor. CI y publicación se verifican por separado.
