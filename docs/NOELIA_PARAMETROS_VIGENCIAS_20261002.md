# Módulo6 · nuevos valores con vigencia e historia propias

La actualización de un valor desde otro mes debe conservar el período anterior. El maestro SQL112 ya permite definiciones por mes, vigencias inclusivas y dependencias del mismo convenio. Esta herramienta prepara una versión completa con esas reglas existentes; no agrega fórmulas, evaluación, migraciones o permisos.

## Recorrido

1. Nómina → Parámetros → Consultar maestro propio → Preparar nueva versión → Actualizar valores en varios convenios.
2. En **Cómo aplicar la actualización**, elegir **Iniciar vigencia desde otro mes**. Informar el mes, unidad, precisión, valor exacto y respaldo. No se deduce la fecha del documento o nombre de archivo.
3. Seleccionar definiciones. Los filtros muestran las compatibles con el mes; una selección previa sigue conservándose y se verifica completa. Buscar por el mes también permite distinguir definiciones históricas de las nuevas.
4. Comparar la actualización completa. Cada definición seleccionada se conserva con su valor/respaldo anterior y fin al mes previo. Se crea otra desde el mes indicado, con el valor/respaldo declarado y la fecha final anterior si existía.
5. Revisar también las definiciones dependientes mostradas. Si abarcan ambos períodos, se conservan las anteriores y se crean las nuevas con iguales valores, unidades, precisión y respaldo; sus referencias se vinculan al tramo nuevo. Si una dependiente ya estaba prevista desde ese mes o uno posterior, conserva sus fechas y datos y sólo se actualizan las referencias necesarias. Estas filas adicionales se cuentan y comparan expresamente.
6. Incorporar al borrador, revisar la versión completa y confirmar su envío. La aprobación independiente adopta toda la versión. Antes de aprobar, no cambia el maestro vigente.

Una dependencia no genera un importe calculado: conserva su valor declarado. Tampoco se convierte una unidad en otra. Fechas incompatibles, una selección cambiada, escalas sin valor, referencias que no cubren el intervalo o capacidad mayor de1.000 invalidan el conjunto; no se recorta ni se divide. El límite incluye todos los antecedentes y tramos nuevos y es distinto del límite500 del importador TXT.

Cambiar el mes o los datos retira la comparación anterior. Reiniciar descarta selecciones/formularios. Ocultar o retirar permisos borra la vista; una confirmación incierta conserva cuerpo y clave del mismo intento para recuperación voluntaria. No hay localStorage, API nueva ni guardado automático.

## Alcance y evidencia

Este cierre conserva la actualización directa anterior para rectificar una definición elegida. El modo con mes nuevo distingue corrección de vigencia y creación temporal. La herramienta aplica metadatos declarados, sin reconstruir el evaluador rechazado ni afirmar cálculo de sueldos.

Pruebas: historia decimal exacta y nulo distinto de cero, cadena de dependencias con diferentes unidades, futuro ya previsto, cambio de año, capacidad íntegra, selección de90 filas entre páginas/filtros y envío180 completo, recuperación del intento, móvil320/390 y teclado. PostgreSQL17/18 descartables verifican compatibilidad del plan JavaScript con SQL112, rechazo atómico de un intervalo superpuesto y propuesta/revisión182 sin perder valores previos. Resultados y publicación del mismo commit se registran en `verification/CODEX_NATIVE_SALARY_EFFECTIVE_RESULT_20261002.md`; aceptación de Noelia y homologación de reglas municipales permanecen separadas.
