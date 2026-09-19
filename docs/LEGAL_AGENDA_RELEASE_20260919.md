# Agenda municipal de seguimientos juridicos - 19/09/2026

## Circuito entregado

Juridica incorpora el acceso Agenda de seguimientos. Reutiliza la pagina existente internal-legal-followups.html: sin parametros muestra la agenda del municipio; con norma/version conserva el circuito previo. Un enlace con seguimiento abre el historial de esa tarea concreta, desde donde puede gestionarse una revision con los permisos y confirmacion existentes. La navegacion de regreso queda visible tambien en el contenido principal para movil.

La agenda reune hasta 1.000 seguimientos existentes, limite del modelo de escritura actual, en una sola consulta acotada. No hace una llamada por norma. Renderiza 25 tarjetas por pagina, con conteos del conjunto completo: todos, fecha objetivo pasada, para hoy, futuros, sin fecha, resueltos y cancelados. Las seis categorias distintas de Todos forman una particion; una tarea cerrada no aparece como vencida. Las fechas usan el dia de Mendoza suministrado por el servidor, no el reloj del navegador, y no son plazos legales calculados.

Se puede buscar por tarea o identificacion/titulo de norma y consultar solo referencias a versiones documentales historicas. Los conteos respetan esos filtros antes de seleccionar categoria. Se mantiene la ultima revision de cada seguimiento, pero su norma y titulo de referencia pertenecen a la version original vinculada, no se reemplazan por una correccion posterior.

## Exportacion y acceso

CSV del filtro completo, no solo de la pagina visible. Incluye estado, fecha objetivo, norma y versiones, referencia interna, fecha/corte consultado y filtros aplicados. Antes de descargar se vuelve a consultar la agenda y se compara revision, fecha, permiso y filas completas; no basta repetir el mismo token. Cambios de contenido bloquean el archivo viejo y muestran la informacion actualizada para revisar. Un texto escrito pero no aplicado no modifica el archivo.

La consulta global omite notas, fundamentos libres y correos de actores; esos detalles se consultan al abrir el seguimiento con su control de acceso. Los titulos siguen siendo texto de usuario y deben respetar el circuito institucional. El CSV neutraliza prefijos de formulas y numeros largos; no es un archivo bancario ni una aprobacion. Sin datos reales se conserva un estado vacio, sin ejemplos municipales ficticios.

Una revocacion descarta filas, categorias y busqueda local. La pagina usa el control compartido de capacidades y la API vuelve a exigir membresia y legal.norm.read. Gestionar sigue exigiendo legal.norm.register, validacion de servidor, motivo, revision esperada y clave de idempotencia. No se alteran los comandos de alta, resolucion, cancelacion o reapertura ni se agrega aprobacion automatica.

## Base de datos y conservacion

Migracion aditiva 080: una funcion nueva legal_followup_agenda_v1(jsonb), sin tablas, indices o relaciones nuevas. Aplicada en el origen operativo PostgreSQL 17.11 y en la copia aislada PostgreSQL 18.6 para conservar el incremento durante el futuro corte. La huella de pg_get_functiondef coincide en ambos destinos: 3bcc95a921eff8c3dc6d381e2f5e3bacc4182f1d978af617114d9d4dca168d91.

El contexto de sesion/MFA/membresia se verifica mediante legal_norm_context_v1 existente. La funcion no escribe datos de negocio; el guard existente toma bloqueos de lectura de identidad/sesion. Se verifico que el rol aplicativo no pueda crear objetos en public, que PUBLIC no tenga EXECUTE y que el rol existente solo reciba EXECUTE sobre la nueva fachada. No se habilito el login del destino aislado ni se modificaron usuarios o capacidades asignadas.

Una invocacion sin contexto fue rechazada por LEGAL_SESSION_INVALID en ambos destinos. Las lecturas de control mantuvieron cero normas/seguimientos/eventos reales; por ello, inicialmente la agenda real debe mostrarse vacia hasta registrar el trabajo institucional. No se escribieron datos de prueba en tablas municipales.

## Verificacion de la entrega

Regresion local completa con Node 24.21.0: 3.829 pruebas aprobadas, cero fallos/omisiones, compilacion correcta. Hay 19 pruebas nuevas de contrato, filtros, conteos, precision del alcance, entradas malformadas, descarga y API. El bundle principal juridico ocupa 98.209 bytes gzip y conserva el presupuesto existente de 100.000 bytes. No se agregaron dependencias.

En navegador se ejecutaron 49 comprobaciones locales: ocho de la nueva agenda de solo lectura; once del circuito de seguimientos, incluida la apertura directa del historial y formulario; ocho de revision documental; 22 del Registro normativo. Se examino la captura de categorias a 390 px y se verifico ausencia de desborde a 1440/390/320 px. Los titulos, tareas, sesiones y respuestas de pruebas fueron sinteticos. Las APIs privadas del navegador permanecieron interceptadas: no se guardaron actuaciones municipales ni se usaron cuentas reales de Mariano.

El nuevo ensayo SQL integral y otro verificador combinado de navegador no pudieron guardarse por bloqueo de la herramienta; no se publican ni se presentan como ejecutados. La evidencia SQL nueva ejecutada fue una consulta SELECT con datos sinteticos en CTE, sin esquemas ni cambios persistentes, que reprodujo las uniones y agregacion de la agenda para tres municipios y 64 tareas con dos revisiones. Sus ocho comprobaciones pasaron: poblacion por municipio, unicidad, ultima revision, titulo original, version historica, omision de notas/actores, vacio real y conteo superior a una pagina. Este ensayo no equivale a iniciar sesion como un funcionario real. La denegacion de contexto y los permisos de la funcion instalada se comprobaron separadamente en ambas bases.

La publicacion web se condiciona a resultado READY, SHA correcto en el alias, igualdad de los archivos publicados con el build, rechazo de acceso anonimo y recorridos publicados. El estado final se comprueba despues del commit; las pruebas locales por si solas no lo certifican.

## Limites y siguientes fases

Este cierre agrega una agenda funcional y su acceso directo a la gestion existente, no el expediente o registro contractual completo. No asigna responsables, no envia correo/WhatsApp, no genera plazos legales y no cambia estados automaticamente. Sigue pendiente la bandeja de asuntos con asignacion/revision/devolucion/respuesta, obligaciones contractuales y motor juridico con citas.

Se conservan el preparte de Hugo, los paquetes de Noelia y los seguimientos ya publicados. No se modificaron relojes, VPN, servidores municipales, claves, planes, cuotas, conexiones Vercel/Neon ni fuentes GRH activas. Septiembre y la separacion historica siguen sus propios controles de migracion. La instalacion municipal del colector sigue pendiente del acceso administrativo de Computos.

Referencias tecnicas consultadas: https://www.postgresql.org/docs/18/sql-createfunction.html y https://www.w3.org/WAI/ARIA/apg/patterns/button/. Explican los mecanismos generales; los resultados y cifras anteriores proceden de la ejecucion del proyecto.
