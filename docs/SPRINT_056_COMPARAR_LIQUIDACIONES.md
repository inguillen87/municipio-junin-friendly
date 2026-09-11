# Sprint 056 — Comparar liquidaciones por concepto

## Operación disponible
Centro de reportes → Comparar liquidaciones; también Nómina → Comparar liquidaciones. El catálogo y cada fuente se consultan en la API existente `payrollsourcereport`, bajo la sesión y los permisos actuales. No se introduce un endpoint público ni un acceso alternativo a datos nominales.

El usuario selecciona dos conjuntos distintos del mismo tipo. Puede revisar conceptos sin totalizadores (vista inicial), solo totalizadores o todos los códigos, buscar por código/descripción, separar cambios/incidencias y ordenar por diferencia absoluta. PDF, Excel y CSV conservan exactamente las filas filtradas. Se muestran las fechas, el estado de cierre de origen y la cantidad de legajos de cada conjunto.

## Semántica que se conserva
- Diferencia = comparada menos base. Aritmética decimal en centavos con BigInt, no suma de floats.
- Un importe cero es distinto de un concepto no presente o un importe faltante. Los ausentes no se imputan como cero.
- Si cambia descripción, clasificación o unidad del concepto, se pide revisar la definición y no se calcula una variación engañosa.
- Porcentaje sobre una base estrictamente positiva; base cero o negativa tiene motivo explícito de no cálculo. No se presenta Infinity ni NaN.
- Mismo importe con distinta cantidad de legajos del concepto no se presenta como «Sin variación».
- Las cantidades no prueban que las personas sean las mismas. Las diferencias no se califican como ahorro, error ni aumento salarial individual.
- Los totalizadores no se vuelven a sumar con los conceptos. Los indicadores cuentan códigos, no dinero.
- Mismo día, orden temporal inverso, distinta población o fuentes sin cierre son condiciones visibles, no cambios silenciosos de la selección.
- Unión completa de hasta 2.000 códigos de dos fuentes de hasta 1.000; catálogo limitado a las 240 corridas del endpoint, con truncamiento informado.

## Acceso, concurrencia y descargas
Antes de exportar se vuelven a consultar las dos fuentes y se comparan identificadores, fechas, tipo, estado, conteos, etiquetas, hashes y contenido de los conceptos. Cambiar filtros, selección o tarea cancela consultas pendientes. El rechazo de sesión y los fallos de integridad vacían la tabla. Al abandonar la tarea se retiran también los metadatos y el catálogo. No se persisten salarios en localStorage/sessionStorage.

## Aceptación reproducible
- `node --test tests/payroll-comparison-056.test.js`
- `npm test` y `node scripts/build-friendly.mjs`
- `node scripts/verify-payroll-comparison-056.mjs`
- Regresiones: resumen 055, biblioteca/legajo, centro de reportes y padrón F/M.
- Producción: `node scripts/verify-payroll-comparison-production-056.mjs` compara SHA-256 de recursos canónicos y exige rechazo real sin sesión; luego `COMPARISON_LIVE_ASSETS=1 node scripts/verify-payroll-comparison-056.mjs` recorre los archivos publicados con API interceptada exclusivamente en el navegador de QA.

Los ejemplos de pruebas son sintéticos, no registros municipales. Estos tests no equivalen a una sesión municipal con MFA ni a la revisión de dos liquidaciones reales por el área usuaria. No hay escrituras de negocio ni migraciones.

## Alcance
Mejora adicional de revisión operativa sobre datos conservados. No completa por sí sola los pendientes de la matriz de Noelia: generación bancaria/fiscal, escolaridad, fórmulas por convenio, confirmación/cierre autónomos e imputación contable. No transforma un reporte comparativo en recibo oficial, pago o declaración fiscal.
