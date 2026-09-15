# Feedback incorporado al plan

Recibido el 14/09/2026 por la noche de Argentina (15/09 UTC). El usuario indicó mantener el orden por dependencias y conservar los pedidos exactos de Noelia. Este registro amplía las tareas existentes; no las sustituye ni declara aceptación municipal.

### Avance comprobado — 15/09/2026, 03:55 UTC

PR31, commit `e05c3359f8a3a42fe1a8fae13e88733617b692c8`, ya sirve en el sitio principal. Se aplicaron 064/065 en la base existente: alta de hijos propios, certificados asociados e integración de recepciones continuas en «Jornadas y tiempos». Los 35 recorridos familiares y 14 de jornadas aprobaron usando los archivos publicados y APIs sintéticas. Las rutas consultadas sin sesión respondieron 401. No se realizó un alta municipal real ni se homologaron códigos del reloj, reglas laborales o horas pagables. El estado inicial descrito abajo se conserva como diagnóstico de origen; [13_CONTINUIDAD.md](13_CONTINUIDAD.md) registra los límites y la evidencia actuales.

El feedback se agrega a las tareas existentes. Continúa primero la verificación de publicación y después el ensayo de septiembre; no se abandona un incremento en curso cada vez que llega una observación.

## Hijos y certificados — MC-E02 / MC-D02

Noelia pide poder cargar hijos y sus certificados desde el recorrido de trabajo. La captura entregada corresponde a Control de nómina.

La implementación actual permite registrar un PDF y sus fechas para un hijo que ya figura en la ficha del legajo, con historial, permisos y almacenamiento privado. No permite dar de alta desde ese componente un hijo ausente del respaldo. Tampoco existe allí un acceso evidente desde Control de nómina. No se ha comprobado una carga real de Noelia.

La ampliación debe incluir acceso claro desde Nómina y Personas, alta de vínculo familiar propio con identidad y vigencia, prevención de duplicados, certificado asociado al hijo seleccionado y persistencia frente a nuevas importaciones. Registrar documentación no modifica automáticamente asignaciones familiares ni autoriza haberes. El reporte debe actualizarse desde los datos guardados y entregar sus exportables.

El alta familiar depende del dominio propio y de su convivencia con cortes GRH (MC-D02); no se resolverá escribiendo sobre el respaldo importado ni inventando vínculos.

## Mapa de relojes — MC-C03

La captura muestra imágenes cartográficas con respuesta 403 de OpenStreetMap. Es un fallo del mapa, no evidencia de un bloqueo municipal del reloj. Se corrige la integración con la política del proveedor, preservando ubicaciones documentadas, atribución y alternativa accesible si el mapa falla.

## Entradas, salidas, pausas y tiempo extra — MC-A01 a MC-A04

El usuario requiere comprobar entradas/salidas, recreos, mayor dedicación y entrada/salida de horas extra, con resultados comprensibles.

Estado verificado en código: el motor reconstruye intervalos declarados 0–5 para el perfil clásico K20, descuenta pausas cerradas y observa secuencias incompletas o contradictorias. El lector de jornadas sigue limitado a la captura histórica. La recepción continua presenta eventos; sus nuevas marcas todavía no se incorporan al cálculo de jornadas. La referencia documental de códigos no acredita la configuración física ni las reglas laborales de ese equipo.

Orden de cierre: homologación por equipo (MC-A01), turnos/calendarios vigentes (MC-A02), evaluación reproducible sobre fuentes completas y recepciones continuas (MC-A03), y propuestas/autorizaciones de mayor dedicación y Full Time (MC-A04). No se deducen conceptos 44/95 de un código de fichada; tiempo registrado, autorizado y pagable conservan significados distintos.

## Entregas que continúan

Se mantiene el cierre de mutuales desde datos propios, recuperación del colector provisional y ensayo compacto del respaldo de septiembre. El mapa se atiende como regresión visible. Ningún feedback nuevo convierte tareas pendientes en funciones terminadas.
