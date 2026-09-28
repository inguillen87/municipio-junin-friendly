# Módulo 10 · integridad de referencias y exportación nominal

## Alcance
Corrección independiente sobre master `b486f40`. La PR #50 conserva la extracción histórica en borrador; este incremento no la integra ni modifica el trabajo concurrente de recibos. El objetivo funcional sigue siendo el pedido de Noelia: cargos liquidados frente a presupuesto anual y detalle PDF. El control publicado todavía compara presencia por legajo.

## Errores corregidos
1. En comparación numérica, dos números como `01000` y `1000` que no estaban en el PDF producían una referencia ambigua en el contador, pero desaparecían del detalle y de sus archivos. Ahora ambos originales se conservan como filas para revisión, sin inventar nombre o cargo. El contador de referencias y la cantidad de filas se distinguen: una referencia repetida puede representar dos filas.
2. Un ocupante documental con varios candidatos de nómina recibía internamente el primer número como si estuviera asignado. Ahora la asignación queda nula mientras exista ambigüedad.
3. Una exportación con búsqueda nominal podía declarar una salida completa. El documento ahora indica búsqueda, filas seleccionadas, total nominal y alcance sobre todas las páginas del filtro. El resumen por cargo permanece completo y separado; el nombre de archivo señala una búsqueda.
4. El renderer general no mostraba las claves particulares Corrida/Estado fuente del documento nominal. Se agregó el contexto compatible Período/Estado y la fecha de emisión del PDF en sus notas. La salida identifica la fecha exacta de la corrida, el estado informado por origen y la huella del resultado, sin atribuir aprobación municipal.

Los originales, ceros iniciales, fuente documental y reglas de coincidencia permanecen separados. No se infieren cargos históricos, vigencia anual, vacantes, pagos ni firmas.

## Pruebas
- 43 pruebas focales aprobadas, incluidas 14 nuevas respecto de las 29 originales.
- 14 recorridos de navegador con PDF y API sintéticos: referencias repetidas, diferencias, exportación CSV completa, búsqueda nominal, PDF con alcance y fecha exactos, cambio de fuente/año, cancelación y pérdida de permisos.
- Sin errores de navegador ni solicitudes de escritura en esos recorridos.
- El PDF se renderizó localmente y se revisaron los límites de página. La salida completa sintética conserva cinco páginas; no se afirma una reducción conseguida.
- El resultado de la construcción completa, CI y paridad de los archivos publicados se registra al cerrar la PR.

## Lo que no se ejecutó
La plataforma bloqueó la propuesta de controles móviles y la del renderer compacto antes de guardar los cambios. El parche de UI se comprobó ausente y `assets/report-document.js` quedó sin modificar. No se reintentaron por otra vía.

No se modificaron base de datos, permisos, credenciales, MFA, legajos, haberes, cierres ni fuentes. Las pruebas no usan la sesión personal de Noelia ni presentan archivos a AMARU. Continúan pendientes integración histórica de PR #50, evidencia anual aprobada, aceptación de Noelia, homologación del TXT638, mejora móvil y PDF compacto.

## Cierre local
Construcción completa final: 5.438 pruebas aprobadas, cero fallos y dos omitidas. Se comprobó la fecha exacta en el PDF filtrado y cero bloques de texto fuera de página. Se mantuvo el sufijo histórico `_diferencias`; `_busqueda` distingue los archivos nominales filtrados. La versión de producción y su SHA se acreditan por separado después de integrar.
