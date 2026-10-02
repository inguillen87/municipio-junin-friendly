# Módulo 6 · actualización conjunta de valores propios

Noelia pidió evitar recorrer convenio por convenio al actualizar parámetros. El maestro propio permite seleccionar varias definiciones existentes, comparar sus valores y respaldos anteriores/propuestos, e incorporarlas a una única versión para revisión independiente.

## Recorrido

1. Nómina → Parámetros → Consultar maestro propio → Preparar nueva versión.
2. Abrir **Actualizar valores en varios convenios**. Elegir unidad y precisión, buscar por código/convenio/clase y seleccionar filas o el conjunto completo del filtro. La selección se acumula entre filtros y páginas; su cantidad permanece visible.
3. Declarar el valor exacto y el respaldo. **No informado** es una opción expresa y diferente de cero; una escala siempre requiere valor. La operación no cambia unidades, precisión, fechas, naturaleza o dependencias.
4. Comparar la actualización completa. Se muestran los valores y respaldos de todas las filas que cambian, junto con las seleccionadas que ya tenían esos mismos datos. Incorporar los cambios modifica solamente el borrador en memoria.
5. Revisar la versión completa y confirmar su envío. El catálogo íntegro, incluidas las filas no seleccionadas, se envía como una sola propuesta existente. Otra persona revisa y aprueba o rechaza la versión. Una respuesta incierta conserva el cuerpo y la clave del mismo intento.

No se convierte una unidad en otra ni se infiere que un código equivale a un importe, porcentaje u hora. Si una fila cambió después de seleccionarla, la comparación se invalida antes de incorporar. Una edición individual en curso se conserva y debe terminarse o limpiarse antes de usar la actualización conjunta. Empezar nuevamente desde la versión consultada elimina las selecciones anteriores.

## Alcance y aceptación

La comparación y la propuesta incluyen todas las filas seleccionadas aunque cambien búsqueda o página. La revocación o el ocultamiento retiran selección, formulario y comparación; un envío incierto conserva únicamente la recuperación del intento original bajo su ámbito. No se guardan datos en localStorage ni se usa otra API.

El límite existente del maestro es 1.000 definiciones completas; no se modifica ni se recorta silenciosamente. Es independiente del límite de 500 registros del importador TXT. SQL112, API, permisos y revisión independiente se conservan sin nueva migración.

Esta función actualiza **valores declarados y respaldos**, no copia o evalúa fórmulas. Siguen pendientes sus homologaciones por convenio, el cálculo propio y el ciclo de liquidación del módulo 7. Los códigos 550/606/607/612 se usan en fixtures sintéticos para comprobar selecciones entre convenios; no se activan como reglas municipales ni se escriben parámetros reales por una orden de desarrollar.

Pruebas de cierre: modelo, API y contrato existentes; interfaz compilada con handler real/SQL sintético; escritorio 1440 px y móvil 320/390 px; regresión PostgreSQL17/18 descartable de propuesta/revisión completa y rechazo atómico de una fila inválida. CI y publicación del mismo SHA se registran en `verification/CODEX_NATIVE_SALARY_BULK_RESULT_20261002.md`, aparte de la aceptación de Noelia con un catálogo municipal aprobado.
