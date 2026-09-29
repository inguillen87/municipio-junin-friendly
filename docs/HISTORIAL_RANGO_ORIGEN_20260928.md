# Historial por rango inclusivo de períodos de origen

## Función de esta entrega
Base revisada: master `486ccb95eb55959254aa3f34865b037d3b8b7fef`. Se amplía la biblioteca de liquidaciones de un legajo con el modo **Desde / hasta período**, además del filtro anterior por año y mes. Ambos extremos se incluyen, se puede elegir un tipo o todos y se conserva la paginación de 24 tarjetas sobre todos los metadatos recibidos.

El alcance corresponde al punto de consulta por legajo/rango/tipos registrado en M8-02 de `NOELIA_MODULO_8_INFORMES_20260923.md`. Se utilizó ese registro de requerimientos; no se afirma una nueva lectura del PDF original de Módulo 8 en este turno.

## Comportamiento
Se filtra por `sourcePeriod` y `sourceMonth`, no por `payrollDate`. Así un ajuste con fecha de liquidación posterior permanece en el período que informa su fuente. Las fechas se confirman con el mes por escrito en español, independientemente del idioma del selector nativo del navegador.

Cambiar año/mes por rango es un modo explícito: los filtros ocultos no se acumulan. El tipo es común a ambos modos. Limpiar restaura el catálogo inicial; actualizar conserva los límites y el tipo aunque ya no tengan coincidencias. Falta de un extremo, límites invertidos y formatos inválidos no dejan datos anteriores ni amplían la búsqueda automáticamente.

Cambiar el rango retira el detalle abierto y descarta respuestas tardías. PDF/Excel de la liquidación elegida siguen usando su corrida exacta y reconsulta antes de descargar. No se modifican los lectores, los permisos, los importes, el formato de los archivos existentes ni la firma digital con Hugo y Noelia.

Un resultado vacío se presenta como ausencia de detalle incorporado, no como ausencia de liquidación o pago. Si el servidor entrega un catálogo truncado, se mantiene su advertencia; paginar no lo convierte en un archivo histórico completo.

## Lo que no está integrado
La propuesta inicial de un panel de informe consolidado PDF/Excel fue bloqueada al intentar completar su controlador. No se reintentó esa escritura por otro canal. Se retiraron los tres archivos de esa propuesta de `assets/` a `verification/*.unintegrated.txt`, fuera de Git y del build. No hay un panel truncado ni una descarga agregada nueva en esta entrega. Los documentos conjuntos por rango de legajos de PR #56 y la fecha declarada de PR #58 permanecen sin cambios.

Esta entrega cierra la consulta y selección de un rango de períodos, pero no la consolidación de todas sus corridas en un PDF/Excel, el contrato XML ni todo M8-02. Tampoco cierra descarga personal, cargo histórico contra presupuesto anual o cálculo propio.

## Verificación local
40 pruebas nuevas de rangos y 14 regresiones del paginado: 54 aprobadas. Construcción completa: 5.696 aprobadas, cero fallos y dos omitidas. El nuevo recorrido de navegador aprobó 18 escenarios, incluidas dos páginas del rango, extremos inclusivos, tipo desconocido, diferencia entre fecha y período, respuestas tardías, refresco, catálogo truncado y controles a 320/390 px.

Las regresiones existentes de biblioteca (13), paginado (20), identidad de corrida (21) y accesibilidad del visor (14) también aprobaron. El PDF individual descargado desde el rango conserva el período exacto, tres páginas y cero texto fuera de página; se revisó su render. El XLSX existente abre como paquete XML válido, sin cambiar su generador.

Se reutilizó el workflow de UX para ejecutar las pruebas antes de integrar y repetirlas con archivos públicos. Los resultados locales utilizan personas y lectores sintéticos, no una sesión real de Noelia. El commit de merge, estado READY y CI productivo se documentan en el cierre de la PR.
