# Noelia · carga95 y ciclo de liquidación · 01/10/2026

Feedback aportado por el usuario: Noelia no encuentra anular/liquidar por legajo ni obtener un recibo, informe o planilla nuevos de sus novedades; al intentar cargar full time95, recibió un rechazo de legajo y no se habilitó crear el lote. Es un bloqueo comunicado en uso real. Las capturas originales permanecen privadas; no se incorporan identidades, montos o documentos municipales a Git/CI.

## Reproducción y mejora acotada

Con los archivos actualmente publicados y todas las APIs privadas interceptadas, un legajo numérico sintético, concepto95, período mensual, mes de ajuste y unidades explícitas validaron sin importe manual. Esa prueba no homologa la regla de full time, no reproduce todavía la causa del rechazo sobre el contrato real y no acredita que Noelia haya podido guardarlo.

Sí se reprodujo otra falla: el error “legajo inválido” seguía visible después de editar ese campo. La prueba falló antes del cambio y ahora verifica que editar retire el error anterior y exija una previa nueva. El campo inválido queda identificado para lectores de pantalla y recibe foco; el número no se modifica ni se convierte automáticamente en otra identidad.

El botón Crear lote trazable conserva su bloqueo y explica qué falta: revisar la previa, confirmar la comparación nativa cuando corresponda, actualizar el vínculo/acceso o recuperar un intento incierto. Crear sólo guarda un borrador administrativo. Una prueba adicional verifica una escritura voluntaria interceptada de95 con los valores exactos y un importe ausente; no ejecuta ni valora salarios. Las regresiones mantienen cantidades completas, filtros, idempotencia, revocación y recepción del comprobante original.

El analizador de archivos también se corrigió para dejar completar una solicitud cuya respuesta ya fue leída y verificada, conservando cancelación por cambios/revocación/plazo. No se altera el evaluador rechazado.

## Dependencia que bloquea el resultado solicitado

El circuito necesario es novedad → revisión/aprobación → cálculo por contrato/población/período/tipo → diferencias → confirmar/cerrar o anular/recalcular con versiones → recibo/planilla/informe de la misma corrida. Actualmente el registro administrativo/exportación conserva `payrollCalculated:false`; no permite sustituir el paso de cálculo con un botón o un PDF armado con importes inventados.

Las páginas25–27 y37 del [registro de39 páginas](NOELIA_39_PAGINAS_20261001.md) cubren exactamente anular/liquidar por legajo, convenio, repartición y todos, cada tipo y sus salidas. El paso siguiente es homologar reglas/vigencias y cerrar un cálculo propio reproducible antes de emitir esos resultados. Los borradores/evaluador rechazados permanecen detenidos; esta revisión no los reconstruye mediante otro nombre o ejecutor.

La rectificación del padrón sigue preparada en PR #75 y necesita instalación específica de SQL104, verificación y publicación antes de su aceptación municipal. Este arreglo de carga es independiente de esa migración: no instala SQL104 ni cambia datos/permisos productivos.

## Evidencia para aceptar el cierre

1. Con APIs sintéticas, campo incorrecto señalado/foco y cero POST; edición conserva los datos, retira la advertencia anterior y exige nueva previa.
2. Código95 numérico revisado; una única creación voluntaria del borrador, unidades exactas e importe ausente; no valoración ni homologación de fórmula por este ejemplo.
3. Carga nativa mantiene revisión expresa y recuperación del mismo cuerpo/clave ante revocación, cambio de identidad o respuesta incierta.
4. Escritorio y320/390px: guía y controles accesibles, sin desbordamiento; el lote completo no depende del filtro de pantalla.
5. Publicación por SHA/CI/bytes y navegador con APIs interceptadas. La aceptación del intento real de Noelia se registra aparte; si vuelve a fallar después de la previa vigente, conservar el mensaje y el paso exactos sin reintentar una escritura incierta.
