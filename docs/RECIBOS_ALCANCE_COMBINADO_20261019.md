# Recibos: legajos y reparticiones en una misma selección

En «Recibos propios», el alcance «Legajos y reparticiones» permite aplicar ambos rangos al mismo tiempo. Sólo se incluyen los recibos que cumplen los dos; por ejemplo, legajos 100 a 200 de las reparticiones 35 a 40.

1. Elegir período y tipos de liquidación.
2. Elegir «Legajos y reparticiones» e informar el inicio de cada rango. Un límite final vacío usa el mismo código inicial.
3. Revisar los recibos completos y comprobar los dos rangos en el resumen antes de conservar la preparación.

Los modos de un solo legajo, una repartición y todos los legajos siguen disponibles. No se añaden filtros por convenio. Los códigos y la pertenencia a repartición corresponden al cierre original; no se reconstruyen con el padrón actual.

Cambiar cualquiera de los cuatro límites invalida la revisión anterior. Buscar dentro del resultado sólo modifica la vista: la preparación y el PDF siguen incluyendo todo el conjunto revisado. Un envío pendiente conserva sus parámetros, cuerpo y clave; la corrección explícita restaura ambos rangos.

## Validación y alcance

Se reutilizan los seis filtros del contrato de recibos y el filtrado conjunto ya definido por SQL142. Este incremento no agrega SQL ni cambia permisos, firmas o reglas salariales.

Las seis pruebas causales fallaron antes del cambio y pasaron después, junto con 157 pruebas de Recibos. El navegador real sobre datos ficticios pasó 507 comprobaciones en 1366, 390 y 320 píxeles: una fuente completa de cinco registros produjo dos en la intersección; el PDF conservó ambos aunque la búsqueda mostrara uno. Los reintentos conservaron cuerpo y clave, con un único evento por escenario y sin aprobación automática.

Estos resultados acreditan el incremento de interfaz y sus contratos sintéticos. No acreditan instalación, publicación, liquidación municipal ni aceptación de Noelia; cada estado requiere su evidencia correspondiente.
