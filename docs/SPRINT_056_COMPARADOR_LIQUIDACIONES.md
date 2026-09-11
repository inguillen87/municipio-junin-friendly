# Sprint 056 · comparación de liquidaciones por concepto

## Alcance
Nuevo comparador en Reportes → Haberes y descuentos y Nómina → Reportes. Seleccionar dos fuentes distintas del mismo tipo, consultar conceptos de ambas, revisar diferencias y exportar el filtro en Excel/PDF/CSV. Es una mejora analítica sobre las consultas existentes, no una homologación bancaria/fiscal ni un requisito nuevo atribuido a Noelia.

No introduce SQL, migraciones, permisos, sesiones, fórmulas, liquidaciones ni cambios de importes. Tampoco modifica el frente paralelo de relojes. Usa exclusivamente `payrollsourcereport`, que determina el ámbito por la sesión autenticada.

## Criterios
- A y B explícitos, sin decidir automáticamente que dos versiones sean dos meses distintos.
- Céntimos calculados con BigInt; diferencia B menos A. Porcentaje sólo con base A positiva, redondeo a dos decimales; bases cero/negativas no evaluables.
- Concepto ausente, importe ausente y cero son hechos distintos. Definición (grupo/unidad) diferente impide calcular una diferencia numérica.
- Variación de importes agregados no significa aumento individual. Se informa cobertura, cantidad de legajos, fecha, tipo y cierre de ambas fuentes.
- Filtros por cambios/no comparables, grupo y búsqueda; orden por código o magnitud absoluta. Los totalizadores no se vuelven a sumar.
- Unión máxima de 1.000 conceptos, con rechazo explícito si se supera. No exportar tablas parciales ni truncar importes.
- Relectura de ambas fuentes antes de exportar; comparación semántica de filas y metadatos, además de hashes. Cambio de filtro/fuente, cierre del comparador o cambio de área cancela solicitudes y evita descarga obsoleta.
- Error de sesión elimina datos y ofrece ingreso. API sintética exclusivamente dentro del navegador de QA; producción conserva el control de acceso.

## Validación reproducible
`node --test tests/payroll-comparison-056.test.js`
`npm test && node scripts/build-friendly.mjs`
`node scripts/verify-payroll-comparison-056.mjs`
`node scripts/verify-payroll-comparison-production-056.mjs`
`COMPARISON_LIVE_ASSETS=1 node scripts/verify-payroll-comparison-056.mjs`

La verificación publicada compara hashes de los archivos servidos y consulta rechazo anónimo real. Las pruebas del flujo privado utilizan respuestas API sintéticas interceptadas y no equivalen a una sesión municipal con MFA.
