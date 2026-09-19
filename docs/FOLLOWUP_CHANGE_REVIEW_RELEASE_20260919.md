# Revision explicita de cambios en seguimientos - 19/09/2026

## Entrega funcional

Juridica > Agenda > Abrir seguimiento > Gestionar > Revisar y confirmar ahora presenta una pantalla de revision completa. Reemplaza la confirmacion nativa de guardado del navegador; no sustituye el contrato ni el historial del seguimiento.

El alta expone tarea, estado, fecha objetivo, nota y motivo. Una modificacion muestra Antes y Propuesto por cada campo, identifica los que cambian y conserva los que no cambian. Incluye la revision original, revision propuesta y version documental de origen. Las notas se muestran completas hasta el limite vigente de 2.000 caracteres; no se resumen, cortan ni reinterpretan. Cancelar o reabrir siguen siendo estados de trabajo interno, no actos de derogacion ni dictamen.

El usuario puede Volver a editar o presionar Escape sin perder su propuesta; Descartar propuesta conserva el aviso existente de cambios sin guardar. Confirmar y guardar es una accion separada. Solo escribir un motivo sin modificar tarea, fecha, estado o nota no genera una revision vacia.

Antes de enviar la mutacion, se reconsulta el permiso y, en las modificaciones, el registro completo y su historial. Si otra persona cambio el seguimiento o la referencia documental, se conserva el texto propuesto en el editor pero no se envia POST ni se cambia silenciosamente su version esperada. La persona debe consultar el historial vigente antes de preparar una nueva modificacion. Si se revoca el permiso, se descarta la informacion privada.

La condicion de carrera que pudiera ocurrir despues de revalidar sigue protegida por la version esperada y transaccion de la API existente. Confirmar no habilita una excepcion: el backend conserva sus comprobaciones de sesion, membresia, permisos, fundamento, version e idempotencia. Una respuesta perdida conserva el circuito previo Consultar este intento/Reenviar mismo intento, sin crear otra clave para duplicar la operacion.

## UX y preservacion

En escritorio los valores anteriores y propuestos se disponen en columnas; en movil se apilan y los botones tienen altura y ancho accesibles. El foco entra en el titulo de revision y vuelve al campo de tarea al editar. No depende de una ventana confirm() que recorte el contenido o mezcle el motivo con el mensaje del navegador. El descarte de una edicion conserva su confirmacion anterior.

Se utilizan los mismos campos, estados y endpoint publicados, sin nuevas dependencias. El modulo nuevo de revision es una funcion pura que valida la fuente original y produce una copia inmutable de la propuesta; el render usa textContent y no ejecuta HTML procedente de documentos.

## Pruebas

Regresion completa y compilacion local con Node 24.21.0: **3.842 pruebas aprobadas, cero fallos, omisiones o cancelaciones**, frente a las 3.829 anteriores. Trece nuevas pruebas verifican alta, antes/despues, cancelacion/reapertura, notas completas, eliminacion expresa de fecha/nota, cambio solo de motivo, discrepancias de identidad/version, historial no verificable y no mutacion de los argumentos.

Navegador local: **53 comprobaciones**. Quince del circuito de seguimientos, ocho de Agenda, ocho de Revision documental y 22 del Registro normativo. Se conservan las aserciones de guardado, rechazo por version, historial y recuperacion de acuse. Se agregan revision sin POST, Escape conservando texto, 320/390 px, actualizacion concurrente detectada antes de POST, cambio vacio rechazado y permiso revocado entre revision y confirmacion. Se inspecciono visualmente la captura movil de la revision.

Las interfaces y el adaptador API se ejecutaron realmente, pero las sesiones y respuestas SQL de navegador fueron sinteticas e interceptadas. No se guardaron tareas, se aprobaron normas ni se ingresaron datos municipales reales. El test con datos sinteticos no certifica la cuenta real de Mariano.

## Alcance y pendientes

El objetivo inicial adicional era asignar responsable y proxima actuacion. El contrato de validacion de esa funcion no pudo completarse por bloqueos de la herramienta. No se aplico su migracion ni se publico su borrador SQL: se conservo fuera del repositorio en evidencia privada para retomarlo. La lectura de la copia PG18 confirmo ausencia de la tabla y funcion propuestas. No se presenta la pantalla de revision de este release como si asignara responsables.

La revision antes de guardar es una mejora independiente sobre el circuito existente que si quedo implementada y probada. Siguen pendientes asignacion de responsables, bandeja de asuntos con devolver/responder, registro contractual, integracion salarial propia e instalacion del colector en el servidor municipal cuando llegue el acceso de Computos.

No se modificaron APIs, roles, credenciales, esquemas de las bases, conexiones, planes, cuotas, normas, relojes ni el corte GRH. El archivo de migracion 081 no forma parte de este commit. La nueva revision no aprueba una norma, no asigna atribuciones a un usuario y no genera avisos.

El pase a produccion se verifica aparte: estado del despliegue en GitHub/Vercel, coincidencia de archivos publicados con el build y rechazo de acceso anonimo, seguido de los recorridos sobre assets publicados con APIs privadas interceptadas. Ninguna prueba local equivale por si sola a ese pase.
