# Coordinacion juridica: editor verificado en aislamiento - 19/09/2026

## Estado real

Este incremento completa el componente de interfaz que faltaba sobre el backend candidato 6e24b0b. No esta conectado a una pagina productiva ni fusionado a master. La version productiva de referencia permanece en 424b13c.

Archivos nuevos: assets/legal-coordination-ui.js, assets/legal-coordination.css y scripts/verify-coordination-ui.mjs. El componente utiliza el contrato y el adaptador API ya implementados en la rama candidata, sin modificar sus permisos, migracion o reglas.

La preparacion de la pagina de entrada y su integracion con navegacion, constructor y control compartido de acceso fueron bloqueadas por la herramienta. Esos cambios no se aplicaron. Tambien fue bloqueada la lectura del estado de Neon en esta sesion, por lo que no se verifico de nuevo el destino ni se aplico la migracion. No se sustituyeron esas operaciones por otra ruta de ejecucion.

## Interfaz implementada

La pantalla de coordinacion permite consultar responsable, proxima actuacion e historial; preparar una asignacion o retirarla; comparar Antes/Propuesto con el motivo; y confirmar solo despues de revalidar acceso y versiones. No elige una persona por defecto ni crea cuentas, permisos, notificaciones o efectos salariales.

El editor utiliza las membresias elegibles devueltas por el servidor, no nombres o correos libres. Si desaparece la elegibilidad de la persona seleccionada se muestra como no habilitada y se exige otra seleccion o retirar la asignacion. Una propuesta no disponible no se etiqueta con el nombre de otra persona que haya sido asignada concurrentemente.

El historial conserva revisiones de coordinacion separadas de la revision del seguimiento. Cada cambio mantiene persona, actuacion, fundamento, actor y fecha. Un seguimiento cerrado solo permite consulta; la interfaz no lo reabre para forzar una asignacion.

La revision completa soporta Escape y Volver a editar sin perder texto. Los controles y la comparacion se adaptan a escritorio, 390 y 320 px; se revisaron capturas con datos sinteticos. Se hicieron explicitos tipografia, foco y botones para que el componente sea legible tambien fuera de la plantilla principal.

## Cambios concurrentes y respuestas perdidas

Antes de confirmar se vuelve a solicitar la coordinacion. Si cambiaron sus revisiones, la membresia elegible o el seguimiento, no se envia POST: se conserva la propuesta y se muestra la informacion actual. Usar version actual y conservar propuesta es una decision explicita; solo entonces se prepara otra comparacion. No hay rebase ni guardado silencioso.

Una respuesta perdida conserva propuesta y clave de idempotencia en memoria de esa pagina. Consultar este intento recupera el recibo sin un segundo POST; Reenviar mismo intento mantiene exactamente cuerpo y clave. Los bloqueos temporales tampoco originan una clave nueva. No se implementa persistencia del borrador/clave en almacenamiento del navegador: la pantalla advierte que no se cierre mientras la confirmacion esta pendiente y protege la salida con el evento de cambios no guardados.

Al refrescar una consulta se retira la coordinacion anterior antes de esperar la respuesta. La revocacion de acceso descarta propuesta, candidatos, responsable e historial. Las respuestas tardias se descartan mediante version de la operacion y cancelacion. La referencia de entrada exige un unico UUID de seguimiento, sin parametros de municipio o autoridad del cliente.

## Evidencia ejecutada en este incremento

Se repitieron las 16 pruebas de contrato/API y la regresion completa del proyecto con Node 24.21.0: **3.858 aprobadas, cero fallos, omisiones o cancelaciones**, compilacion correcta. El build existente todavia no incluye este componente, porque la integracion no se pudo aplicar; esos resultados acreditan regresion de lo existente, no publicacion de la nueva pagina.

El componente nuevo se valido por separado con comprobacion de sintaxis y **12 recorridos de navegador** usando Playwright, la interfaz real y el adaptador API real. Se montaron en una pagina de ensayo aislada con un control de acceso de entrada simulado; todas las sesiones, membresias y respuestas SQL fueron sinteticas. Las solicitudes privadas se interceptaron y nunca se enviaron al municipio. No se probo una pagina productiva ni las cuentas reales de los funcionarios.

Los recorridos cubrieron vacio real, seleccion sin asignacion automatica, revision completa sin escrituras, foco/Escape/movil, confirmacion, historial, motivo sin cambios, concurrencia con cambio de responsable y revocacion de elegibilidad, recuperacion de respuesta, reintento con misma clave, retiro de responsable, cierre concurrente, lectura sin edicion, revocacion y URL invalida. El resultado final reporto 12 controles aprobados y cero escrituras municipales.

Durante la prueba se detecto y corrigio una visualizacion transitoria de los datos anteriores al actualizar. Tambien se corrigio la etiqueta de una persona propuesta que dejaba de estar disponible despues de un cambio concurrente. Se preservaron las aserciones de contenido; la comparacion de etiquetas Antes/Propuesto se hizo sin distinguir mayusculas porque el estilo original las presenta en mayusculas.

La evidencia de los 51 controles SQL con rollback pertenece al sprint anterior, documentado en COORDINATION_BACKEND_CANDIDATE_20260919.md; no se presenta como reejecutada en esta sesion. Capturas y resultados nuevos permanecen en verification/coordination-ui-local, excluido del repositorio.

## Cierre pendiente

Falta conectar el componente a su pagina y navegacion reales, incluir los assets y la pagina en el build, verificar sus controles en esa superficie y comprobar/aplicar la migracion aditiva en los destinos autorizados. Despues corresponde publicar API e interfaz juntas y verificar el despliegue efectivo y una prueba autorizada por los usuarios.

No se modifico master, no se ejecuto un despliegue productivo ni se afirmo que una VM, cron o colector estuviera instalado. La VPN, el servidor municipal, las fuentes activas de GRH, la liquidacion, los reportes de Noelia, las jornadas de Hugo y los planes permanecen sin cambios por este incremento.
