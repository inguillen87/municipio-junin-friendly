# Volver al importador con acceso comprobado

Cuando el operador cambiaba de pestaña, la importación retiraba los datos pero quedaba bloqueada hasta abrir otra página. Además, retiraba la clave y el contenido de un guardado pendiente aunque el servidor pudiera haber guardado el lote. La captura de Noelia muestra ese bloqueo después de una revisión del concepto 614.

Ahora aparece **Comprobar acceso y continuar**. La acción consulta únicamente el bootstrap existente y exige los cuatro permisos del importador. Volver a la pestaña no ejecuta esa consulta ni guarda novedades automáticamente.

- Sin guardado pendiente: se habilita elegir nuevamente el TXT y revisarlo completo. La previa, sus filas, el hash visible, los importes, el reporte y su enlace temporal se retiran. No se recuperan al comprobar acceso.
- Con guardado pendiente: se conserva el intento original y la evidencia necesaria para verificar su recibo, sólo en memoria mientras la página siga abierta. Los campos permanecen bloqueados. El operador puede consultar los lotes o reintentar el mismo envío con exactamente el mismo cuerpo y clave.
- Si cambia municipio, membresía o vínculo de la sesión, se bloquea el reenvío. Una revocación o una respuesta inicial tardía tampoco recuperan la previa ni habilitan un envío. El reintento vuelve a comprobar acceso antes de enviarse.
- Una respuesta no verificable, una interrupción después de enviar o una negativa posterior a un intento incierto no liberan su clave para una nueva importación. Un rechazo determinista del primer envío exige revisar nuevamente antes de un nuevo guardado.

No se utiliza almacenamiento del navegador ni otra API. Cerrar o recargar la página termina esa conservación en memoria; ante un resultado incierto, el operador debe consultar los lotes antes de iniciar otra carga. El recibo sólo ofrece el lote exacto después de verificar el contenido completo.

El control mantiene etiqueta, ayuda accesible, estado de espera, foco de teclado y altura mínima de 44 px. Se verifica en escritorio y en 390 y 320 px, junto con las regresiones previas de CSV, revisión íntegra de lotes y preparte.

Las operaciones de escritura de las pruebas usan exclusivamente fixtures sintéticos o PostgreSQL descartable de CI. La mejora no calcula, anula, confirma ni paga liquidaciones, no agrega formatos y no supera el límite de 500 registros. Tampoco prueba autonomía del padrón, del motor de haberes ni de los relojes. Los parches de rutas y las continuaciones rechazadas siguen aplazados.

## Incidencias locales del TXT · incremento del 24/10/2026

Antes de consultar los vínculos, el lector puede rechazar el archivo completo por filas incorrectas. La pantalla ahora conserva el número de fila y su motivo: ancho incorrecto, documento inválido, valor incompatible o documento repetido. Se muestran todas las incidencias, hasta las 2.000 filas que admite el lector, en una lista con desplazamiento y acceso por teclado. No se muestran documentos, nombres, importes, registros originales ni el nombre del archivo en esa lista. Un error HTTP no se interpreta como un informe local.

Cambiar archivo o selección, iniciar otra revisión, cancelar, ocultar la página o perder permisos retira las incidencias. Un buffer que termina de leerse después se borra antes de adoptarse; una preparación local tardía tampoco continúa hacia la previa. Ninguno de esos recorridos guarda novedades.

Validación de este incremento: 13 pruebas focales del panel y modelo reales con DOM y HTTP sintéticos, incluidos 2.000 errores y las carreras de cancelación. No se ejecutaron PostgreSQL, el harness anterior de importación, navegador ni publicación. Los formatos por entidad, sus escalas y el guardado independiente del padrón importado siguen pendientes de su circuito completo. El límite de guardado no se deduce del texto histórico anterior: la previa lo recibe del bootstrap y lo verifica como 500 o 2.000.
