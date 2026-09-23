# Noelia: módulo 8 de informes

Revisión del 23/09/2026. Este módulo amplía el [plan integral](PROYECTO_INTEGRAL_JUNIN_20260919.md); no reemplaza los módulos 1 a 7 ni acredita el reemplazo operativo completo de GRH.

Fuente recibida: `8º MODULO INFORMES.pdf`, nueve páginas, SHA-256 `3eafe9bf6f3190a8aebf2cadab77b2507c285c6c08035d5c1e360aa6b9951ec2`. Se revisaron texto y capturas de las nueve páginas. El original, las imágenes nominales y la evidencia de sesiones permanecen fuera del repositorio.

## Trazabilidad y entregas

| ID / prioridad | Pedido de Noelia y página | Base existente | Incremento de esta rama | Pendiente para aceptar el pedido completo |
| --- | --- | --- | --- | --- |
| M8-01 / P0 | Variables de liquidación; prioridad antigüedad (p. 1) | El padrón conserva años y meses originales de GRH; detalle de empleado autorizado | Antigüedad informada al corte en la ficha, con ingreso y procedencia del contrato; cero y ausencia distintos | Obtener las variables históricas efectivamente aplicadas a cada corrida y su catálogo. La antigüedad al corte no es la antigüedad liquidada de cualquier mes |
| M8-02 / P1 | Liquidación por legajo, rango de meses, un tipo o todas, conceptos y totales; Excel/XML/PDF (pp. 2–3) | Historial anual paginado, detalle exacto, controles y PDF/Excel | Sin cambio funcional en este sprint | Rango inclusivo, múltiples tipos, consolidación de todas las páginas y detalle de fuentes. XML sólo cuando exista contrato de intercambio verificable |
| M8-03 / P1 | Informe para expediente y conciliación de cierre por convenio/repartición (p. 4) | Reporte por corrida; cierre de origen abierto/cerrado/desconocido; resumen mensual de corridas elegidas | Etiquetas de tipo coherentes en reporte individual y resumen mensual | Primera hoja del expediente, agrupación histórica verificable y conciliación con estadísticas. No cerrar GRH ni contabilizar desde este informe |
| M8-04 / P1 | Planillas nominales por repartición/jurisdicción; orden y firmas (pp. 5–6) | Nómina con identidad y algunos totalizadores; datos históricos de repartición en fuente bancaria | Sin cambio funcional en este sprint | Nueva proyección mínima sin cuentas bancarias, haberes/retenciones/neto conciliados, orden J42/J55, vista previa y circuito de firma autorizado |
| M8-05 / P0 | Estadísticas por conceptos en Reportes y costo salarial; tipos, repartición, jurisdicción y agrupación (pp. 7–9) | Conceptos y costo por corrida, filtros de conceptos, PDF/Excel/CSV; resumen mensual con selección explícita | Búsqueda por mes de la fecha y tipo; fecha completa para distinguir corridas; SAC correctamente rotulado; enlace a consolidación existente | Filtros y agrupaciones históricas por convenio/repartición/jurisdicción, con la misma población e importes en pantalla y todas las descargas |

La columna «incremento» describe implementación en esta rama. Su publicación se comprueba por SHA de producción y evidencia de CI; no se da por publicada por existir este documento. Ninguna fila está declarada aceptada funcionalmente por Noelia.

## Mejoras de uso y fidelidad a GRH

- Buscar mes y tipo antes de elegir una corrida; mostrar su fecha completa para diferenciar varias del mismo mes. «Todos los tipos» amplía las opciones del catálogo: no suma todas automáticamente.
- Distinguir la fecha de liquidación del período de imputación. El catálogo individual sólo ofrece la primera; el resumen mensual existente utiliza período de imputación.
- Usar nombres documentados de GRH clásico: F Final, M Mes, O Otros conceptos, P Primera quincena, S SAC, V Vacaciones. La selección de `Info_liquidacion` consultada en GRH el 23/09 confirmó estos valores, sin ejecutar el informe. Son etiquetas de consulta; la correspondencia canónica de cálculo y aprobación sigue gobernada por separado.
- Conservar tipos desconocidos con su código. No convertir automáticamente un bono en vacaciones, una complementaria en SAC ni «Todas» en una nueva liquidación.
- Mostrar el alcance del catálogo cuando esté limitado a las 240 corridas más recientes. Un filtro vacío no vuelve a mostrar todo ni prueba ausencia de datos fuera de ese catálogo.
- Al cambiar una selección, retirar el resultado anterior. La descarga revalida acceso y la misma versión de la corrida; un cambio durante esa comprobación cancela el archivo. Una revocación borra los resultados y el catálogo del componente.
- Reutilizar el resumen mensual existente para reunir corridas explícitamente elegidas: conserva períodos, rechaza revisiones duplicadas y fuentes incompatibles. No certifica por sí solo el mes completo.
- Antigüedad: conservar años y meses informados por la fuente del contrato. No actualizar por el paso del tiempo, inferir desde ingreso, deducir desde el importe del concepto 48 ni mezclar el corte del padrón con el período elegido para liquidar.

## Datos necesarios para los próximos sprints

1. **Estadísticas históricas (M8-05).** Obtener las dimensiones originales de cada corrida. `payroll_detail_statement.lines` conserva códigos `agreement`, `costCenter`, `paymentPlace` y `sector`, pero sus nombres no prueban equivalencias con jurisdicción o repartición. La fuente 060 conserva repartición de `histolegajo` por legajo, período, fecha, tipo y mismo SHA de respaldo; una proyección para estadísticas debe extraer sólo esas dimensiones, sin exponer cuentas bancarias. No usar la organización actual del empleado para reinterpretar liquidaciones históricas.
2. **Agrupación y conciliación (M8-03/05).** Opciones documentadas: convenio y repartición, convenio, repartición, jurisdicción, concepto. La selección J42/J55 del formulario tiene claves internas 1/2: no tratarlas como códigos de jurisdicción. Diferenciar legajos únicos, participaciones en corridas y líneas; no volver a sumar totalizadores dentro de haberes o descuentos. Importes faltantes permanecen no informados.
3. **Historial consolidado (M8-02).** Consultar todas las páginas incluidas en el rango y preservar fecha/tipo/período/fuente. Separar resumen disponible de detalle disponible; no inventar conceptos para completar una corrida. El control semestral/anual no define una fórmula nueva de SAC.
4. **Planillas y expediente (M8-03/04).** Elaborar el documento de control con datos y orden verificados. Las firmas observadas en el PDF son referencia de circuito: no copiarlas como aprobación ni presentarlas como firma digital válida. Definir cierre/revisión/envío como estados distintos.
5. **Variables mensuales (M8-01).** Localizar fuente histórica de las variables utilizadas en la liquidación. Hasta entonces, el panel de antigüedad al corte es informativo; no certifica años reconocidos para una corrida elegida.

Cotejo en vivo del 23/09: los formularios `Info_liquidacion`, `ReporteLiquidacion` y `Pla_liquidacion` confirmaron los seis tipos anteriores. El menú vincula Repartición con la entidad `Sectores`, Área con `Costos` y Lugar de Trabajo con `Lupago`. Esto respalda el catálogo de reparticiones, pero no prueba por sí solo cómo el informe de estadísticas construye jurisdicción. Los formularios exactos Variables/Estadística no aparecieron en el menú ni en el catálogo inicial de reportes autorizado consultado; para esos campos se conserva la evidencia del PDF sin afirmar verificación directa del proceso. Sólo se consultaron formularios; no se ejecutaron informes o liquidaciones ni se modificó GRH.

## Comprobaciones de este incremento

Pruebas de contrato para mes/tipo, fechas civiles, tipos desconocidos, catálogo truncado, selección vacía y nombres coherentes con exportación. Navegador con respuestas sintéticas: escritorio y móvil, varias corridas, cambio de filtro durante carga/descarga, fuente equivocada y revocación de permisos. Regresión del costo salarial y del resumen mensual; pruebas específicas de antigüedad y procedencia.

No requiere migración ni cambia cálculos de nómina. La incorporación de dimensiones históricas posteriores requiere su propio contrato, pruebas, CI antes de Neon y verificación en PG18/PG17. Las pruebas sintéticas no crean datos municipales persistentes ni acreditan una sesión real de Noelia.
