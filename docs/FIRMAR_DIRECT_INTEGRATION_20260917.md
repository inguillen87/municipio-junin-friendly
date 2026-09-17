# Firma remota integrada · FD-01A — 17/09/2026

## Decisión de producto
MuniControl envía el PDF al firmador y recibe automáticamente el resultado. No exigir descarga, búsqueda de archivo, recarga ni cambio al gestor universitario. El funcionario revisa en MuniControl, autoriza personalmente en la ventana oficial y vuelve al mismo trabajo. Mantener preparado el fallback de regreso en la misma pestaña para móviles o bloqueos de ventanas.

No cargar la página de firma dentro de un iframe, replicar su formulario ni capturar PIN, OTP o contraseña. El manual exige intervención del firmante en la interfaz de FirmAR. Que el seguimiento permanezca en MuniControl no equivale a ejecutar esa autorización desde nuestro dominio.

No se instala toda la pila SIU-Araí/Huarpe/Nuxeo para este corte. Se implementa un adaptador Node propio sobre el protocolo de integración documentado para aplicaciones terceras. Mantener abierta la opción de interoperar con Araí si el municipio adopta esa plataforma en el futuro.

## Lo implementado en este incremento
- `lib/firmar-direct-provider.js`: configuración cerrada por entorno/municipio; preparación de correlaciones separadas; obtención de token de aplicación; envío de un PDF; comprobación de la URL del firmador; normalización del callback sin declarar firma válida. Transporte con timeouts y cuerpos acotados. No reintentar automáticamente una entrega con resultado desconocido.
- `assets/firmar-journey.js`: coordinación de ventana, retorno como señal de consulta, recuperación de un intento existente, pausado de consultas en pestaña oculta y presupuesto finito de comprobaciones. Pérdida de acceso, mensajes de otra procedencia y respuestas tardías no reactivan información anterior.
- `src/islands/firmar-journey-panel.tsx` y CSS: componente React para vista previa, revisión, autorización y recuperación, una acción principal por etapa, mensajes accesibles y reflow móvil. El documento y la autorización deben venir del backend del módulo anfitrión, no de un token almacenado en el navegador.
- Ensayos: transporte simulado, adversariales de URL/callback, control de estados, doble clic, respuesta perdida, sesión revocada y proveedor no habilitado; recorrido visual con todas las redes interceptadas.

**Alcance exacto:** componentes de integración y experiencia, NO una bandeja persistente operativa ni un endpoint público de recepción. No se incorporan a la navegación productiva ni se activa la firma por escribir estos archivos. No se instalaron certificados, no se enviaron PDFs a FirmAR y no hay documentos oficiales firmados en este corte. El componente no declara «oficialmente emitido» aunque reciba una validación técnica favorable.

## Contrato de integración revisado
Fuentes primarias consultadas:
- https://documentacion.siu.edu.ar/documentos/docs/firmar-implementacion/
- https://documentacion.siu.edu.ar/documentos/docs/firmar-config/
- https://documentacion.siu.edu.ar/documentos/docs/firma-digital-firmar/
- https://documentacion.siu.edu.ar/documentos/docs/assets/PDFRIntegracionFirmaV13.pdf
- https://www.argentina.gob.ar/jefatura/innovacion-ciencia-y-tecnologia/innovacion/firma-digital/pfdr

La documentación indica intercambio de credenciales de aplicación por AccessToken, envío PDF/CUIL/metadata/retorno, URL de autorización y POST de resultado. Los ejemplos de callback difieren: metadata objeto en el manual V1.3, arreglo de un elemento en SIU. La implementación exige elegir un perfil, no adivinar estructuras. Su compatibilidad real debe validarse contra el ambiente asignado por el organismo.

Las referencias describen trámites institucionales para universidades/autoridades de registro. Corresponde confirmar el canal y las condiciones aplicables al municipio; NO afirmar que un trámite individual MXM otorga una API ni que el municipio está obligado automáticamente a instalar Araí o constituirse en AR.

## FD-01B — Persistencia y seguridad antes de conectar el componente
1. Request/attempt propio con municipio, versión exacta de documento aprobado, firmante individual verificado, facultad documental, caducidad, hash, estado y clave de idempotencia. CUIL verificado vinculado a cuenta, no a un legajo obligatorio ni a una coincidencia de nombre/correo.
2. Reservar atómicamente el intento ANTES de enviar. Guardar callbackToken cifrado sólo si debe recuperarse para envío; buscar por hash. ReturnState y callbackToken son secretos distintos de 256 bits. No poner el callbackToken en la URL del navegador, localStorage, logs o respuestas cliente.
3. Ante respuesta perdida después del envío: estado incierto y reconciliación. El protocolo público no documenta idempotencia del alta del proveedor; repetir el POST ciegamente podría crear otra operación. Confirmar mecanismo oficial de consulta/cancelación antes de automatizar ese caso.
4. Callback: endpoint público de HTTPS con entrada limitada y configuración activada sólo después de registro institucional. Buscar token fuerte de una solicitud existente, no confiar en tenantId, CUIL o «success» recibidos. Verificar caducidad, cancelación, versión y replay atómicamente; conservar bytes en cuarentena privada. Mismo resultado repetido no duplica; resultado diferente no reemplaza el primero.
5. La documentación no acredita un webhook firmado por HMAC/mTLS. Solicitar su mecanismo vigente; no inventar encabezados supuestamente oficiales ni convertir la correlación por token en una validación criptográfica. El parseador de este corte marca siempre `providerAuthenticated:false` y `received_unverified`.
6. Retorno navegador: página propia que elimina el fragmento después de leerlo, canjea estado de un solo uso mediante sesión autenticada y recupera el intento. `success=true`, window.postMessage o BroadcastChannel sólo pueden motivar otra consulta; nunca aprobar una firma.
7. Verificador independiente: integridad/cobertura, cadena de confianza argentina, revocación, evidencia temporal, firmante esperado, correspondencia con la versión aprobada y conjunto de firmas requerido. Fallo/indeterminación bloquean emisión; no usar IA, extensión .pdf, estampa o igualación de hash de original y firmado como prueba.
8. Guardar documento firmado sin regenerar, junto a la evidencia de validación. Cambios jurídicos/contables y emisión permanecen separados; no habilitar actuar como otra persona ni modificar liquidaciones al firmar.

## Configuración propuesta (sólo servidor, no valores reales)
`FIRMAR_DIRECT_ENABLED=false` por defecto. Al habilitar: `FIRMAR_ENVIRONMENT=test|production`, `FIRMAR_API_USER`, `FIRMAR_API_SECRET`, `FIRMAR_INTEGRATION_APPROVAL_REF`, `FIRMAR_TENANT_ID`, `FIRMAR_CALLBACK_PROFILE=pfdr-v13-object|siu-array-single`, `FIRMAR_APP_ORIGIN` y `FIRMAR_CALLBACK_REGISTERED=true`.

El indicador de configuración sólo acredita campos presentes, NO habilitación oficial o pruebas aprobadas. Mantenerlo apagado hasta completar FD-01B y la prueba institucional. Orígenes del proveedor restringidos a firmar.gob.ar/tst.firmar.gob.ar, HTTPS, sin redirecciones intermedias ni destinos suministrados por el navegador. El endpoint callback y la ruta `/firmas/retorno` son propuestas de arquitectura: **no están publicados por este incremento**.

Límite inicial técnico: 2 MiB por PDF, independiente de lo que admita el proveedor. La validación sintáctica completa y de seguridad del PDF debe completarse antes del transporte; el chequeo de cabecera del adaptador no la reemplaza. No admite Excel, anexos externos o HASH en este corte.

## Solicitud técnica para el organismo (borrador, no enviada)
Asunto: Integración institucional de MuniControl / Municipalidad de Junín con PFDR-FirmAR.

Solicitamos confirmar requisitos para integrar una aplicación municipal propia con el firmador remoto, incluyendo ambiente de homologación, credenciales de aplicación, registro del callback HTTPS y retorno al sistema de origen. El caso inicial es un PDF por autorización personal, sin token físico; los funcionarios tramitan sus certificados mediante MXM.

Necesitamos contrato vigente de OAuth, envío, URL autorizadora, estructura y autenticación del callback, timeouts/reintentos, consulta y cancelación de operaciones, evidencia de firma/tiempo y límites. También compatibilidad con ventana separada y retorno automático. No solicitamos acceso a PIN, OTP, contraseñas ni claves privadas de los titulares. La propuesta de direcciones se comunicará como operativa después de implementarla y verificarla.

## Continuidad
Mantener #1 y #41 como seguimiento de firma; #40 para Jurídica/Legislativa; #37 para relojes y autonomía salarial. FD-01A no certifica el motor salarial, la vigencia normativa, el pago ni la recepción por otro organismo. La firma integrada sigue pendiente de habilitación institucional y aceptación real aunque estén emitidos los certificados personales.
