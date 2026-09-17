# FirmAR · habilitación institucional y cierre de integración

Este documento complementa #42, #1 y #41. La modalidad elegida por el propietario es PDF, firma remota obtenida mediante MXM, sin token físico y una solicitud por operación. Los certificados personales no acreditan habilitación de la aplicación municipal para consumir la API.

## Experiencia que se implementa
MuniControl conserva la tarea, contexto y versión del PDF. La autorización personal se realiza en la interfaz de FirmAR, mediante ventana oficial; en móvil o con ventanas bloqueadas se ofrece navegación en la misma pestaña con retorno. Se busca evitar la gestión manual de archivos, no ocultar el dominio del prestador ni suplantar su interfaz.

El contrato documentado distingue POST del PDF firmado al servidor de origen y redirección del navegador. No son el mismo evento ni pueden suponerse ordenados o equivalentes a una firma válida. Volver a MuniControl sólo recupera el contexto; el estado firmado requiere archivo recibido, validación técnica y controles de identidad y versión. La emisión administrativa sigue siendo independiente.

SIU-Araí es una referencia técnica de integración, no una habilitación municipal automática ni una obligación de instalar toda su plataforma. Se propone adaptar el protocolo oficial documentado a los componentes de MuniControl, conservando su identidad y autorización existentes.

## Solicitud técnica preparada para tramitar por el municipio
**No enviada por el asistente. No constituye una solicitud oficial presentada.**

Asunto: Consulta de habilitación institucional PFDR/FirmAR para MuniControl — Municipalidad de Junín, Mendoza.

Solicitamos confirmar el procedimiento aplicable a una municipalidad para integrar su plataforma de gestión documental con el firmador remoto oficial. El equipo está tramitando certificados personales a través de Mendoza por Mí. La primera etapa comprende PDF y una firma por operación, con intervención exclusiva del titular en la interfaz oficial.

Se requiere confirmar:
- Elegibilidad y trámite institucional correspondientes al municipio: no inferir los requisitos universitarios de SIU como trámite ya autorizado para Junín.
- Acceso a ambiente de ensayo y luego producción, documentación y versión de API, dominios permitidos y credenciales de aplicación por canal seguro.
- Callback de recepción de documentos y URL de retorno del usuario; procedimiento de registro, autenticación y correlación, tamaños, tiempos, reintentos, consulta de un intento y tratamiento de una respuesta perdida.
- Contrato exacto del callback: estructura de metadata/status, tamaño máximo del PDF firmado, mecanismo de autenticidad del emisor, modo de confirmar recepción y política de reenvío.
- Compatibilidad con certificados remotos personales obtenidos mediante MXM y alcance de los procedimientos de prueba.

Las URLs de producción se comunicarán cuando existan las rutas, controles, persistencia y ensayos: no registrar como operativo un endpoint que hoy no está desplegado. Las credenciales institucionales deben configurarse exclusivamente del lado del servidor, sin adjuntarlas a GitHub, al correo de usuarios ni al chat.

## Prerrequisitos de activación que aún no están cerrados
1. Persistencia de solicitudes e intentos en el servidor: documento/versiones congelados, facultad del firmante, reserva antes del POST, reintentos idempotentes y consulta recuperable después de una desconexión. La API nunca resubmite por el mero hecho de recuperar un intento.
2. Resolver autenticado del retorno, ligado a usuario, municipio, solicitud e intento, con expiración y tratamiento idempotente. El token de retorno no se confunde con el secreto del callback. La URL se limpia antes de consultas; sin analítica ni recursos externos en el retorno.
3. Callback registrado y receptor limitado, autenticidad conforme al proveedor, cuarentena del PDF recibido, control de duplicados y conflictos. No confiar en una bandera success.
4. Validador criptográfico independiente, confianza argentina, revocación/evidencia temporal, firmante esperado y continuidad con el PDF aprobado. Ausencia de evidencia: pendiente/indeterminado, no emisión oficial. Conservar los bytes y el informe de validación.
5. Habilitación institucional y piloto real por su titular fuera de CI. Verificación cruzada y descarga del mismo original; controlar cancelación, alteración, firmante equivocado, red caída, llegada tardía y varias pestañas.

## Estado del desarrollo
Ya existe código de transporte, interfaz React y pruebas sintéticas de inicio, autorización y retorno. Las correcciones de continuidad se mantienen en la misma rama de desarrollo; no se duplica el colector ni se modifica el trabajo de nómina/legajos/Mariano. No están activadas las rutas de firma ni se han firmado documentos oficiales desde esta implementación. Esta condición debe permanecer visible al informar disponibilidad.

Referencias oficiales consultadas el 17/09/2026:
- https://documentacion.siu.edu.ar/documentos/docs/firma-digital-firmar/
- https://documentacion.siu.edu.ar/documentos/docs/firmar-implementacion/
