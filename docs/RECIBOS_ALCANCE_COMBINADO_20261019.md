# Recibos: legajos y reparticiones en una misma selección

En «Recibos propios», el alcance «Legajos y reparticiones» aplica ambos rangos al mismo tiempo. Por ejemplo, permite elegir los legajos 100 a 200 de las reparticiones 35 a 40.

1. Elegir período y tipos de liquidación.
2. Elegir «Legajos y reparticiones» e informar el inicio de cada rango. Un límite final vacío usa el mismo código inicial.
3. Revisar el conjunto completo y comprobar ambos rangos en el resumen antes de conservar la preparación.

Los modos de un solo legajo, una repartición y todos los legajos siguen disponibles. No se agregan filtros por convenio. Los códigos y la repartición corresponden al cierre original; no se reconstruyen con el padrón actual.

Cambiar cualquiera de los cuatro límites invalida la revisión anterior. Buscar dentro del resultado sólo cambia la vista: la preparación y el PDF conservan todo el conjunto revisado. Un envío pendiente mantiene sus parámetros, cuerpo y clave; la corrección explícita restaura ambos rangos.

## Validación y alcance

Este incremento usa los seis filtros del contrato de recibos y su intersección existente en SQL142. No agrega migraciones, permisos, firmas ni reglas salariales.

Sobre la base master d6bd665, las seis pruebas causales fallaron antes del cambio y pasaron después; las 136 pruebas de Recibos pasaron sin fallos. El navegador sobre fuentes ficticias pasó 456 comprobaciones a 1366, 390 y 320 píxeles. Una fuente completa de cinco registros produjo dos en la intersección; el PDF conservó ambos aunque la búsqueda mostrara uno. La recuperación mantuvo cuerpo y clave originales con un solo evento por escenario, sin aprobación automática.

El gate de PostgreSQL 17/18 conserva los verificadores anteriores y añade cinco consultas de intersección contra SQL142 sobre los 26 registros sintéticos ya existentes. Esas consultas comprueban ambos extremos inclusivos, el rango sin coincidencias y una repartición ajena sin crear más altas, cálculos o cierres. Se exige su ejecución nativa y la reconciliación de sus artefactos con el commit exacto; su preparación no acredita que hayan pasado.

Las pruebas locales anteriores acreditan el incremento de interfaz y sus contratos sintéticos. Instalación, publicación, liquidación municipal y aceptación de Noelia requieren evidencia separada. La copia para revisión mantiene su estado de firma y pago explícito.
