# FD-P2 · Recorrido conectado de firma: HTTP, interfaz y persistencia

Continúa #42, #1 y #41. No reemplaza los frentes salarial (#37) y jurídico (#40).

## Entrega

Se agregan adaptadores HTTP de consulta de fuente, inicio, recuperación, estado, retorno y recepción; un cliente de primera parte; y dos componentes React conectados a ese cliente. El servidor obtiene cuenta, sesión y membresía del gateway de identidad, nunca del JSON del navegador. La facultad documental y su vigencia continúan comprobándose dentro del diario PostgreSQL del incremento anterior.

La interfaz confirma la misma solicitud, versión y SHA-256 mostrados antes de habilitar la acción. Al abrir de nuevo consulta el intento existente; abrir o recargar NO envía el PDF a FirmAR. Al iniciar, la huella revisada se compara con la fuente almacenada antes de reservar. El CUIL, PDF y aprobación vienen del repositorio autorizado.

El retorno usa POST para resolver el secreto retirado del fragmento URL; no lo incluye en búsquedas, analytics, logs o enlaces posteriores. El callback del prestador es otro endpoint: no admite sesión de navegador ni una marca `success` como validación de firma. La respuesta no devuelve identidad, bytes, hash documental, token o identificadores internos del recibo.

Se corrigió un caso real de integración: si el PDF llega antes de que el servidor termine de responder al inicio, el coordinador antes trataba el estado avanzado como error de inicio. Ahora adopta directamente el estado persistido, cierra la ventana de preparación y conserva el mismo intento. No pide que se vuelva a enviar o se recupere innecesariamente.

## Frontera de seguridad

- `/api/internal-firmar`: GET prepared/recover/status; POST begin/return. Sin comandos para crear facultades, aprobar fuentes o emitir documentos. Exige origen exacto para POST y cabecera de intención de primera parte; parámetros, claves y cabeceras ambiguas se rechazan. Los campos de sesión/municipio no se admiten en el cuerpo.
- `/api/firmar-callback`: sólo POST JSON, sin query, cookies ni cabeceras de navegador. La correlación criptográficamente aleatoria se comprueba en el repositorio; no equivale a autenticación del prestador. Se conserva el resultado como no verificado.
- Parseo sin body parser previo, UTF-8 estricto, sin compresión, límites de bytes reales y plazo total de lectura. No confiar sólo en Content-Length. Presupuestos de frecuencia persistentes mediante el limitador ya existente: usuario municipal para interacción y un bucket fijo por municipio para el ingreso de callback. Una caída del limitador bloquea la operación, no elimina el control.
- El callback global de 60/min es protección de piloto, no garantía frente a denegación de servicio. Debe complementarse con política de borde, cuotas y contrato del prestador antes de apertura institucional.
- Respuestas no-store y no-referrer; errores con texto fijo y traceId aleatorio. Ningún error incorpora el cuerpo del proveedor, PDF, claves o SQL. No se añaden CORS permisivos ni redirecciones arbitrarias.
- El runtime exige ACTIONS_DATABASE_URL y comprueba el rol restringido del gateway; no cae al owner del repositorio por ausencia de configuración. No se consulta GRH para autorizar al firmante.

## Activación: todavía no es producción oficial

Las dos rutas están **deshabilitadas por defecto**, requieren `FIRMAR_HTTP_PILOT_ENABLED=true`, las condiciones previas del adaptador y `FIRMAR_ENVIRONMENT=test`. El proveedor production se rechaza deliberadamente en esta etapa incluso si se configura el flag. No se agregó un atajo para firmar documentos reales sin cerrar la validación.

Los componentes son reutilizables para el host documental. Este corte no añade un menú público operativo ni una bandeja real de fuentes aprobadas; falta conectar la preparación autorizada de documentos de los módulos municipales. El host entrega la vista previa que corresponde a la misma fuente y el servidor verifica versión y huella.

No se aplicó el diario 071 en Neon, no se crearon facultades reales, no se importaron certificados y no se enviaron PDFs a FirmAR. La integración institucional, el validador criptográfico, la conservación a largo plazo, las facultades documentales y el piloto con titular real siguen siendo cierres necesarios. `officialEmissionEnabled=false` permanece en todas las respuestas.

## Pruebas

- Tests de la frontera HTTP y del cliente: sesión, otro municipio, revisión de huella, CSRF, rutas, duplicados, límites de cuerpo, tiempo de lectura, budgets, respuesta perdida, errores seguros y estados avanzados.
- Runner `verify-firmar-http-browser.mjs --http-only`: transacción de usuario/servidor de prueba por loopback real, con repositorio en memoria; no acredita PostgreSQL.
- Runner `--postgres`: reutiliza el PostgreSQL 16 descartable del workflow existente, crea una base exclusiva y la elimina al finalizar. Interfaz React → cliente real → endpoints HTTP → orquestación → repositorio SQL → proveedor sintético → callback HTTP → retorno React → misma solicitud. Verifica una reserva, un recibo y eventos de regreso/conflicto por consulta SQL.
- El host del navegador es ficticio (`municontrol.test`), proxy de test a loopback. Nunca resuelve hosts municipales o del prestador. Se ensaya la alternativa de ventana bloqueada; los ensayos previos de ventanas/retorno siguen ejecutándose. El gateway de cookie y el budget del recorrido visual son inyectados sintéticamente; la identidad SQL usa el contrato mínimo documentado en FD-P1, no una copia de la identidad municipal completa.
- Vista previa y PDFs de prueba son sintéticos; el ensayo NO valida firmas digitales ni interpreta PDFs municipales. Persistencia y criptografía tienen aceptaciones distintas.
- En el entorno local se pudo inspeccionar la composición estática a 1440/390/320 px. La navegación del navegador local fue bloqueada por su política; no se alteró dicha política. La ejecución navegable queda acreditada sólo por el resultado efectivo de CI.

Una aprobación de CI no acredita habilitación institucional. Antes de promover al portal se debe probar el gateway real, revisar el procedimiento municipal y completar validación/archivo/emisión. No cambiar un estado a «firmado válido» para cumplir una fecha.
