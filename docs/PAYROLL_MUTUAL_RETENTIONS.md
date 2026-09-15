# Detalle de retenciones a mutuales desde datos propios

Este incremento de MC-E06/S12 agrega el detalle a **Resumen mensual**, reutilizando la selección explícita de período y liquidaciones y la consulta de datos conservados. El operador no vuelve a cargar un Excel para producir otro. Puede elegir conceptos, revisar importes y descargar Excel o PDF desde el mismo resultado.

La referencia funcional es la muestra privada `AGOSTO/LIQUIDACION MENSUAL/NOTAS MUTUALES/DETALLE DE LO RETENIDO A MUTUALES 08.2026.xlsx`, con columnas de código de descuento y total retenido. El archivo privado y sus importes no forman parte del repositorio, las pruebas, CI ni los artefactos públicos. No se presupone que esta selección represente otras mutuales, períodos o jurisdicciones.

## Recorrido

1. Consultar las liquidaciones disponibles y seleccionar explícitamente un período y entre 1 y 24 fuentes.
2. Consultar el resumen y abrir **Detalle de lo retenido a mutuales**.
3. Seleccionar descuentos o usar los códigos de la muestra de agosto: **614, 620, 623, 641, 649, 665, 675, 676, 677 y 678**. Ninguno se selecciona automáticamente al entrar por primera vez.
4. Buscar, agregar o quitar conceptos; revisar subtotal, total y observaciones.
5. Descargar Excel o PDF. La selección de mutuales es independiente del filtro de texto y de la página del resumen general.

La preconfiguración está versionada como `mutual-retentions-s12-202608.v1`. Los nombres y los importes se toman del resumen consultado. Se indica si los conceptos elegidos coinciden con la referencia o si la selección fue editada. La referencia no certifica su vigencia en otro período.

## Identidad, exactitud y totalización

El modelo acepta únicamente objetos validados por `monthlySummaryData`. Para resolver la identidad del concepto, trata un código como `0614` y la selección `614` como equivalentes sólo cuando esa identidad es única en la fuente. Conserva `0614` en la pantalla y en ambos archivos. Si la fuente contiene las dos variantes, el detalle de mutuales se bloquea con una observación; el resumen general conserva las filas originales sin fusionarlas. La selección tampoco admite dos variantes de la misma identidad.

Son sumables únicamente los conceptos de descuento cuyo grupo de totalización identifica **996**, excluyendo el rango de totalizadores **990–999** y cualquier código referenciado como grupo de totalización por otra fila del resumen. Esa regla no infiere una fórmula ni un porcentaje. El operador puede añadir otros componentes de descuento del resumen; su inclusión como mutual queda explícita en la selección editada.

| Estado | Importe del detalle | Efecto en el total |
|---|---|---|
| Informado, incluido `0.00` | Importe exacto de todas las líneas incluidas | Se suma. |
| Ausente de las fuentes elegidas | No determinable | Total pendiente; ausencia no equivale a cero. |
| Una o más líneas sin importe | No determinable | Total pendiente; no se presenta una suma parcial del concepto. |
| No sumable o totalizador | No determinable | Total pendiente; el importe original sigue consultable en el resumen general. |

La falta de cantidad no invalida un importe explícitamente informado. El **subtotal informado** reúne únicamente componentes sumables completos. El **total de la selección** sólo existe cuando todos los conceptos elegidos están informados y son sumables; con selección vacía ambos son no determinables y se deshabilita la descarga.

Se suman centavos enteros con `BigInt`, manteniendo signos y hasta 1.000 componentes. Excel usa celdas numéricas hasta 15 cifras significativas; valores mayores permanecen como texto decimal exacto. El total puede exceder el máximo de un componente sin perder precisión. No se ejecutan fórmulas presentes en textos fuente. Las alturas de filas se ajustan para nombres largos.

## Acceso, cambios y archivos

No se agrega endpoint, migración ni permiso. Se reutiliza `GET /api/internal-payroll-monthly-source-summary` y sus controles existentes de sesión, `payroll.read`, tenant, binding de fuente y release. Los límites y las garantías del resumen se describen en [PAYROLL_MONTHLY_SOURCE_SUMMARY.md](PAYROLL_MONTHLY_SOURCE_SUMMARY.md).

Antes de cada descarga, la pantalla vuelve a consultar las mismas fuentes y compara el resumen completo, incluyendo estado de cierre, huella del contenido y momento de incorporación. Una diferencia bloquea el archivo y exige otra consulta. Una respuesta 401/403 elimina filas protegidas y referencias del catálogo. Cambiar conceptos, fuentes o capacidades durante una verificación cancela la descarga; un resultado tardío no puede producir un archivo.

Excel contiene **Retenciones**, **Fuentes** y **Control**. PDF contiene detalle, totales, fuentes exactas y control; los totales continúan en la página del detalle cuando hay espacio. Ambos conservan período, códigos elegidos, IDs de liquidación, fecha y tipo de corrida, cierre informado, momento de incorporación, SHA-256 del respaldo, huella del contenido, huella del resumen y hora de consulta.

Son documentos de control interno sobre las liquidaciones seleccionadas. No certifican el mes completo, no recalculan nómina, no emiten una nota firmada ni acreditan un pago. Los caracteres que el PDF no puede representar sin alterar la fuente bloquean únicamente ese formato; Excel conserva el texto original.

## Evidencia y reproducción

Las pruebas de este incremento usan exclusivamente datos sintéticos. `tests/payroll-mutual-retentions.test.js` incorpora 14 pruebas de modelo, exportación y distribución del PDF al recorrido normal de `npm test`, sin duplicar las pruebas existentes del resumen mensual.

```text
node --test tests/payroll-mutual-retentions.test.js tests/payroll-monthly-summary.test.js
node scripts/build-friendly.mjs
node scripts/verify-mutual-retentions-browser.mjs
```

En Windows, si no está instalado Chromium de Playwright, se puede usar el Chrome instalado con `MUTUAL_RETENTIONS_BROWSER_CHANNEL=chrome`. El navegador abre un contexto nuevo sin una sesión municipal e intercepta todas las solicitudes. El modo normal sólo lee la compilación `public/` y comprueba que los cuatro assets del incremento coincidan byte por byte con las fuentes antes de iniciar. CI ejecuta este modo después de construir; nunca usa un reemplazo de assets para ocultar una compilación incompleta.

Opciones de desarrollo: `MUTUAL_RETENTIONS_BUILD_DIR` permite comprobar una compilación preparada por separado; `MUTUAL_RETENTIONS_SOURCE_OVERLAY=1` permite revisar los cuatro assets locales sobre una compilación existente sin modificarla. Este último modo queda explícito en la evidencia y está prohibido en CI.

La suite de navegador cubre 15 controles: selección explícita, preconfiguración y ceros iniciales, independencia del filtro general, edición de códigos, pantallas de escritorio y 390 px, ausencias/faltantes, ambigüedad, caracteres PDF, cambios de cierre/contenido/importe, revocación de sesión o permiso, cancelación por conceptos/fuentes/acceso y selección vacía. Las capturas y los archivos de `verification/mutual-retentions/` están excluidos de Git y rotulados como sintéticos.

La prueba de PDF analiza 1.000 conceptos con descripciones de 240 caracteres anchos e importes máximos. Verifica todas las páginas para detectar texto fuera de márgenes o superpuesto al pie. La revisión de escritorio/móvil y la prueba sintética no acreditan una sesión real, aceptación del área ni funcionamiento de la versión publicada. Esas comprobaciones corresponden a la validación posterior de la publicación exacta.
