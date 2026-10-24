# Presentaciones familiares desde la cuenta del empleado

Fuente conciliada de la PR #228, commit `daa7391cf94a8d89583a3e5d7a1b181b4ddbb9b0`, sobre la rama de integración propia. Este documento describe el producto y sus límites; no acredita instalación, publicación ni disponibilidad municipal.

En el Centro de acciones, **Mi familia y escolaridad** permite presentar un hijo o hija, o un certificado escolar de un familiar propio. La cuenta debe tener un vínculo verificado con un contrato creado en MuniControl. El navegador no elige otro empleado ni envía un contrato administrativo.

Personal dispone de **Solicitudes familiares de empleados**, con documento e historial por versión. Puede pedir una corrección, aceptar o rechazar con motivo y confirmación expresa. La aceptación exige un revisor distinto del presentador y crea el registro administrativo mediante los procedimientos familiares existentes. Una solicitud que necesita corrección también puede terminar rechazada. Ninguna de estas decisiones concede prestaciones ni modifica haberes.

Los permisos de presentación propia y revisión son independientes. La integración requiere capacidades específicas; no las asigna a roles o cuentas y no utiliza permisos de licencias o recibos como sustituto.

Las fechas de emisión, presentación y vencimiento se conservan separadas. Lo desconocido sigue siendo nulo. Un original PDF conserva sus bytes y su nombre; la descarga usa un nombre HTTP seguro. La constancia en papel es una declaración explícita, sin adjunto inventado. La bandeja conserva el total y utiliza páginas explícitas de 50 solicitudes.

## Reintentos y cambio de cuenta

El intento conserva su cuerpo, clave, huella y ámbito originales. Un envío sin comprobante requiere consultar esa misma clave antes de repetirlo; un fallo de red no autoriza a descartarlo. La caché sólo se enlaza después de verificar el ámbito devuelto por el servidor y distingue sesión, cuenta, municipio, vista y membresía. Una respuesta tardía de un intento anterior no puede retirar otro envío pendiente.

El cliente envía `X-Native-Family-Membership` tanto al escribir como al consultar el comprobante. Es una precondición del ámbito original, no una fuente de autoridad: el handler la compara con el contexto autenticado antes de procesar el cuerpo, el PDF o SQL. También se exige en una búsqueda que devuelve 404, porque esa ausencia puede habilitar un reintento o la revisión de una preparación rechazada. El contrato público de autenticación no incorpora un campo de membresía ficticio.

## Validación pendiente

SQL195 se conserva como fuente exacta de la PR #228. Sus comandos exigen `READ COMMITTED`, fuentes predecesoras fijadas y controles de conservación. No se adoptan ni ejecutan por esta integración el instalador, los constructores, el runner durable o su workflow. No se modifican los controles de recibos ni el trabajo rechazado de acceso a recibos.

Las pruebas locales del modelo, cliente, handler con SQL/validador inyectados y DOM sintético no sustituyen PostgreSQL, un navegador real con sesión municipal, la publicación o la aceptación de Noelia. La prueba del parser PDF real y la prueba HTTP durable quedan separadas. El circuito sigue pendiente de esas validaciones antes de anunciarlo como disponible.
