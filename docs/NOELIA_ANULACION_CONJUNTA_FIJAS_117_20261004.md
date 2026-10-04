# Revisión conjunta de anulaciones de novedades fijas

Incremento de M5.5: permite seleccionar varias novedades fijas aprobadas, revisar todos sus valores y proponer su anulación administrativa con un motivo común. La búsqueda y las páginas no recortan la selección. Incluye fichas propias de MuniControl y contratos históricos verificados, conservando su origen.

El operador elige filas o todos los registros disponibles del filtro, abre la revisión completa y confirma que revisó el conjunto. Se comparan los diez campos de cada novedad contra la propuesta. Pendientes, identidades no verificadas y registros con límite de historial conservan su explicación y no pueden seleccionarse. Hasta 500 novedades por conjunto; superar ese límite nunca produce un conjunto parcial.

Antes del envío se vuelven a consultar sesión, permisos y todo el registro. Si cambia una versión, identidad, valor o autoridad, no se envía ninguna propuesta. El motivo queda disponible. Ocultar la página, cerrar el panel, cambiar período o retirar el permiso de preparación invalida la revisión. No se persiste en localStorage.

La escritura llama al escritor 092/093 existente dentro de una única transacción. Un conflicto en cualquier fila revierte todas las propuestas y el comprobante del conjunto. Repetir el contenido y la clave originales recupera el mismo comprobante; no permite cambiar filas, orden ni motivo. Si se pierde la respuesta, el formulario queda bloqueado y puede consultarse el intento exacto, también después de una revocación temporal y con la misma membresía original.

Cada propuesta requiere después una decisión individual de otra persona con el permiso vigente. Se conserva el historial y la última versión aprobada. Este incremento no anula liquidaciones salariales, no corrige masivamente valores, no calcula importes ni modifica archivos entregados. No cierra M5 ni M7, no homologa el concepto 95 y no amplía la importación/OSEP.

## Instalación y validación

SQL 117 agrega una tabla privada vacía de comprobantes y tres funciones, con dos fachadas autorizadas. No cambia funciones 092/093, fuentes, empleados ni decisiones aprobadas. El instalador verifica las dos bases existentes, ocho funciones previas, código exacto, estructura, restricciones, permisos y conservación de todo el estado previo; la durabilidad se contrasta en otra transacción de lectura.

Se verifican API y modelo, el navegador con fixtures sintéticos, PostgreSQL 17/18 aislados y los consumidores existentes. La instalación y publicación se acreditan con el commit, CI y despliegue concretos del resultado; la aceptación de Noelia sigue separada.

Fuentes: apartado 5.5 del módulo 5, [matriz de aceptación](MATRIZ_ACEPTACION_NOELIA.md), [registro092](NOELIA_NOVEDADES_FIJAS_092.md) y [contratos propios093](NOELIA_NATIVE_FIXED_093.md).
