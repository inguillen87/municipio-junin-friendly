# Seguimientos internos por norma — 19/09/2026

## Circuito funcional

Jurídica → Revisión documental → Seguimientos internos, en una ficha registrada. El circuito permite crear un seguimiento con asunto, nota, fecha objetivo interna y motivo; consultar todos los seguimientos de la norma; filtrar por estado; registrar nuevas revisiones y consultar el historial. Los estados son Pendiente, Resuelto y Cancelado. Una reapertura también conserva el motivo y las revisiones anteriores.

La referencia está vinculada a una versión documental existente. No cambia cuando posteriormente se corrige la norma. La pantalla identifica referencias históricas y compara la fecha objetivo con la fecha de Mendoza devuelta por el servidor, no con el reloj del navegador. No calcula plazos legales, vigencia, caducidades ni firma documentos. Tampoco envía notificaciones ni modifica liquidaciones.

## Persistencia y autorización

Migración aditiva 079-native-legal-followups.sql: tablas legal_followup y legal_followup_event, un índice por municipio/norma y funciones de consulta/operación. Las tablas tienen RLS y no admiten acceso directo del rol aplicativo. Los eventos y la referencia de origen rechazan modificación y eliminación; las correcciones se registran mediante nuevas filas. La norma, sus versiones y PDF originales no se alteran.

La API exige contexto municipal gestionado, MFA y membresía vigente a través de la autorización existente. Consulta: legal.norm.read. Alta, revisión y recuperación de intentos de escritura: legal.norm.read y legal.norm.register. No se añaden capacidades a usuarios, no se confía en el nombre del rol mostrado y no se permite que el cliente elija otro tenant o actor.

Cada escritura exige UUID v4 de idempotencia, versión esperada y motivo. La misma solicitud recupera su recibo; un contenido diferente con la misma clave se rechaza. Las versiones desactualizadas no sobrescriben cambios ajenos. Un bloqueo por municipio serializa las escrituras bajo READ COMMITTED. No se declara una prueba de carrera con dos conexiones simultáneas: sí se prueban reenvíos y versiones desactualizadas.

Límites iniciales: 1.000 seguimientos por municipio, 100 por norma y 100 revisiones por seguimiento. Las listas no cargan el historial; se consulta al abrirlo. La interfaz no guarda información privada en localStorage ni sessionStorage. Antes de salir con un borrador cambiado o un intento pendiente solicita confirmación del navegador. La pérdida de una respuesta se consulta con la clave original antes de repetir un POST.

## Verificación disponible antes del despliegue

Se instaló y probó el esquema en el destino aislado PostgreSQL 18.6, sin habilitar su rol NOLOGIN ni conectarlo a la aplicación. El ensayo SQL ejecutó 27 comprobaciones en un esquema sintético: alta, reenvío, recibo, cambio de contenido, lector sin escritura, aislamiento de municipio, sesión/MFA, fechas inválidas, motivo, revisión desactualizada, referencia inmutable, resolución/cancelación/reapertura, historial, límites y prohibición de acceso directo. Todo el esquema de prueba se revirtió; no se crearon normas ni tareas municipales de ejemplo.

El contexto de sesión utiliza la función real clonada al esquema de prueba. La resolución de capacidades y el control previo de separación de funciones se sustituyen únicamente dentro del esquema sintético por fixtures. La prueba no acredita el acceso de Mariano, Noelia, Hugo o el propietario con sus sesiones reales.

Se ejecutaron también 14 pruebas puras de contrato en el entorno de trabajo disponible (Node 22); eso no sustituye la compilación y regresión completa con la versión 24 fijada por el proyecto. El workflow de PR exige instalación reproducible, compilación completa, nuevo recorrido de navegador y regresiones del Registro normativo y Revisión documental. No usa secretos ni credenciales de bases municipales; todas las respuestas privadas del navegador son sintéticas.

## Puesta en producción y límites

No se mueve la rama master antes de verificar la entrega. La migración productiva debe aplicarse en una transacción con proyecto/rama y prerrequisitos comprobados; no habilita el acceso de la copia aislada ni cambia conexiones, planes o cuotas. El resultado de CI y de Vercel se registra por commit y se comprueba separadamente: publicar un archivo no equivale a desplegarlo.

La pantalla nueva usa una ruta con prefijo /internal, que queda fuera de la interceptación del service worker existente. El empaquetado conserva las exclusiones de respaldos y SQL privado; únicamente agrega la página y el contrato de esquema revisados. No se agregan dependencias.

El cambio de base, la incorporación del candidato GRH de septiembre, la separación histórica, una agenda global entre normas y avisos automáticos no forman parte de este corte. La base operativa consultada antes de implementarlo no tenía normas: los usuarios deben registrar documentación real para utilizar estos seguimientos, sin que una demo se presente como información municipal.
