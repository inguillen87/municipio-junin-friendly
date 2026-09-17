# FirmAR · continuidad de autorización y retorno

## Alcance ejecutado
Continúa el conector y el componente `5a8f16f`. No instala SIU-Araí completo ni imita su interfaz de credenciales. Reutiliza el contrato de integración documentado para que MuniControl conserve el documento y la solicitud mientras el titular autoriza en FirmAR. PDF exclusivamente, una operación por documento.

Esta entrega añade recuperación de intentos inciertos, reabrir la misma autorización, retorno contextual y controles contra estados tardíos. El host del componente debe aportar las operaciones persistentes/autorizadas: `begin`, `readStatus`, `recoverAttempt` y `resolveReturn`. **No hay nuevas rutas de firma, solicitudes productivas, callback público activado, migración ni validación criptográfica en esta entrega.** El éxito de las pruebas sintéticas no acredita firma legal o habilitación de la aplicación.

## Decisión UX
La pestaña de MuniControl se conserva. El botón abre una ventana oficial sin acceso a `opener`; documento y contexto viajan a través del backend, no por descargas/cargas manuales. Una ventana cerrada puede reabrirse con la misma URL de autorización. Si el navegador bloquea ventanas, se ofrece continuación en la pestaña actual con regreso a la misma solicitud, no un nuevo proceso.

La autorización externa no se oculta: usuario, contraseña, PIN y OTP permanecen en FirmAR. No usar iframe, proxy visual, scraping ni pedir secretos del funcionario para aparentar que el certificado se usa dentro de MuniControl.

## Cambios de este corte
- El enlace alternativo no desaparece tras la siguiente consulta de estado.
- El cierre accidental del firmador no provoca otro envío del PDF.
- Una respuesta perdida o malformada bloquea otro comienzo hasta consultar el intento guardado. Sólo un resultado de servidor que acredite `FIRMAR_NOT_SUBMITTED` permite empezar nuevamente; no deducirlo de un timeout.
- Recuperación por solicitud con exclusión de consultas simultáneas. No abrir automáticamente nuevas ventanas al recuperar o cargar la página.
- Un archivo recibido deja de mostrar un acceso a una autorización vieja; respuestas anteriores no degradan el estado de ese mismo intento.
- El hash del PDF preparado, además de ID y versión, invalida la revisión visual cuando cambia la fuente. Sesión/capacidad retiradas limpian documento, progreso y autorización anterior.
- Retorno: se retira inmediatamente el state de la dirección; se consulta al servidor; se envía a la pestaña original únicamente un aviso para consultar. No hay dato de éxito, PDF, identidad del firmante ni secreto de callback en el aviso.
- Retorno y callback son distintos. El regreso del usuario no verifica ni emite un documento. No hay resultados «aprobado» derivados de un parámetro de URL.
- Polling visible y acotado; errores repetidos pausan; tres reintentos de resolución como máximo. La consulta manual no sube otro PDF.

## Contratos que faltan cerrar en el backend
1. Reserva atómica por municipio/solicitud/versión/firmante. Fuente congelada, identidad de firma verificada, facultad administrativa vigente y consentimiento sobre esa fuente antes de enviar.
2. Identificador idempotente estable y lookup `recoverAttempt`. No liberar la reserva al perder la respuesta del proveedor. Resolver retorno para la misma sesión/identidad autorizada; reintentos seguros del mismo retorno (incluido React StrictMode) no crean solicitudes.
3. Callback institucional registrado. Coincidencia de token opaco con el intento, expiración, tamaño, origen/protocolo conforme al contrato homologado y evidencia en cuarentena. El indicador `status.success` del proveedor no es autenticación ni prueba de firma.
4. Validador independiente: integridad, confianza argentina, revocación/evidencia temporal, firmante esperado, versión autorizada y firmas exigidas. Conservar el original recibido y el informe. Emisión administrativa aparte.
5. Persistencia y consulta autorizadas para retomar desde otra pestaña/dispositivo. Este controlador no guarda PDFs o búsquedas en almacenamiento persistente del navegador.

## Habilitación institucional
Los certificados personales tramitados por MXM no equivalen a credenciales de API para MuniControl. Gestionar con el prestador el esquema admitido para Junín (propio o mediante la autoridad provincial): ambiente de ensayo, key/secret de aplicación, callback HTTPS registrado, URL de retorno, identidad CUIL y procedimiento de pase a producción. Las credenciales se instalan por canal privado de servidor; nunca en este repositorio o en una conversación pública.

La documentación de SIU describe el alta institucional y un recorrido universitario/AR; confirmar su aplicación a Junín, sin asumir que deba instalarse toda la suite SIU o constituirse otra autoridad si la provincia ya presta ese servicio. No se envió ninguna solicitud en nombre del municipio en este corte.

Fuentes técnicas oficiales verificadas el 17/09/2026:
- https://documentacion.siu.edu.ar/documentos/docs/firma-digital-firmar/
- https://documentacion.siu.edu.ar/documentos/docs/firmar-implementacion/
- https://expedientes.siu.edu.ar/docs/1.5.12/firma-digital-remota
- https://informacionoficial.mendoza.gob.ar/gobiernoinfraestructura/firma-digital/

## Pruebas y continuidad
`node --test tests/firmar-*.test.js` y los recorridos `verify-firmar-journey-browser.mjs` / `verify-firmar-continuity-browser.mjs`. Todas las APIs, personas y documentos de estos recorridos son sintéticos; no hay firmas ni logins reales de PFDR. Verificar la evidencia del pipeline antes de promover.

#42 conserva la implementación del portafirmas, #1 la emisión y firma, #41 la aceptación enterprise. #37 (relojes, asistencia y liquidación autónoma) y #40 (Jurídica/Legislativa) no se reabren como terminados ni se reemplazan por este trabajo. Integrar documentos de esos módulos cuando sus versiones/autoridades estén aprobadas.
