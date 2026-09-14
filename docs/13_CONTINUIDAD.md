# Continuidad MuniControl — 14/09/2026

## Alcance y baseline

Integrador único: tarea Codex iniciada con el handoff del 14/09. El repositorio rector es `inguillen87/municipio-junin-friendly`. No se creó otra aplicación ni base operativa.

- Carpeta original: `municipio-junin-friendly`, rama `codex/identity-gateway-benchmark`, HEAD `fc03daf9a124b125f75ca67773400ef72c6160ac`. Su enlace local sin seguimiento se preservó.
- `origin/master` revalidado: `06bf2792083f9af0edd6ecc45432e5bbf814ef25`.
- Carpeta de integración: `municipio-junin-friendly-pm10-continuity`, rama `codex/municontrol-pm10-continuity-20260914`, creada desde ese master.
- Se preservaron las otras cuatro carpetas existentes, incluidos los cambios sin confirmar de nómina en `municipio-junin-friendly-civitas-automation`. No se hizo reset, eliminación ni reasignación de ramas existentes.
- No hay un AGENTS.md efectivo en el árbol ni en sus directorios superiores inspeccionados. Rigen las instrucciones entregadas por el usuario. `AGENTS_PROPUESTO.md` del paquete permanece como propuesta.

## Responsabilidades

Integrador: arquitectura, receptor/backend, datos, resguardo y publicación. Subagente de relojes: comparación de candidatos y remitente con acuses. Subagente frontend: consulta continua, exportación coherente, accesibilidad y pruebas de navegador. Subagente de nómina/contabilidad: fuentes exactas de Noelia e inventario de fórmulas. QA se contrasta con código, SQL y resultados; ningún subagente sustituye aprobaciones municipales.

## Fuentes y decisiones

Se leyeron el arranque, estado, plan, matriz de Noelia, arquitectura, PM-10, tarea inicial, UX, QA, seguridad y precedencia del handoff. Los paquetes y sus originales se extrajeron en Descargas fuera de Git y del área de publicación. Los documentos son requisitos/evidencias con fecha, no prueba de ejecución actual.

La candidata `feat/pm10-reception-0592` contiene código legible reutilizable. Las otras candidatas contienen segmentos codificados incompletos o un archivo de referencias; no se ejecutaron ni fusionaron sus workflows. Se recuperaron archivos explícitos, preservando el lector y la protección de ruta de master. La recepción se reforzó con verificación del delta completo, tenant activo y exclusión con revocaciones; el remitente conserva el acuse antes de avanzar y el tablero agrega un corte continuo coherente.

## Evidencia ejecutada en esta tarea

- Git: status, rama, HEAD, remotos, worktrees, fetch y comparación no destructivos.
- `npm ci --ignore-scripts`: 25 paquetes instalados, auditoría de instalación sin vulnerabilidades informadas. No equivale a auditoría integral de seguridad.
- Preflight del handoff: repositorio correcto, baseline verificado, sin acceso al reloj ni datos escritos.
- Vercel: deployment canónico `dpl_Fv5beMqg5qAWhMfpWw3UrNk66w4y`, READY, commit `06bf279…`, confirmado por API autenticada local. El conector MCP no tenía permisos del equipo; la CLI sí.
- Neon: lectura agregada a las 03:47 UTC: una captura, 11.111 filas de origen, 11.091 canónicos; conector suspendido y sin `last_accepted_at`. Estos son datos históricos, no recepción automática.
- El deployment de auditoría sin dominio `dpl_2qYjXRuyUUmC2HhGnTqDQM1uMgkB` terminó READY y confirmó que ambas conexiones productivas usan `br-plain-dust-acpjgebb`; el rol de escritura limitada es `municontrol_actions_runtime_app`. La rama tiene un nombre histórico de QA, pero es operativa. No eliminarla. El diagnóstico no cambió el alias público.
- QA SQL inicial con rollback: compatibilidad HMAC/event-key en todas las filas históricas; replay de las 11.111 sin inflación; datos imposibles observados; partes, hashes y ordinales rechazados cuando no corresponden; rol runtime sin SELECT a datos privados. Baseline intacto tras rollback. La extensión con 056 detectó un alias SQL inválido y se corrigió; su repetición está en curso.
- Aplicación: 2.169 pruebas aprobadas, cero fallos/omitidas en Windows. Contrato remitente/receptor: 10 casos aprobados. Build local generado. Navegador sintético: 17 comprobaciones nuevas, 15 del tablero previo y 22 de recepción, escritorio/móvil, sin errores JS.
- Resguardo: dump completo privado de la rama operativa, 71.673.537 bytes, SHA-256 `6ddefbbf84c7217dc42b9a4e05e8a778dc6c3c6e567121a3e3101780641f1e64`. Restauración local aislada comprobada el 14/09 a las 04:16:55 UTC: mismos conteos y huella de captura. El restore requirió fijar localmente `search_path` de `is_valid_cuil(text)` antes de COPY; no se modificó esa función productiva. Es una copia independiente de Neon en esta PC, no un respaldo externo en otra ubicación.
- Seis IP documentadas respondieron al saludo del protocolo y exigieron CommKey. No se probaron claves ni se descargaron nuevas fichadas; los cinco equipos adicionales siguen sin modelo/serie confirmados. El inventario documental registra 13 puntos, con sus modelos declarados y método de descarga.
- MC-P02A: inventario privado de fórmulas producido desde S11 sin ejecutar SQL ni fórmulas; 2.740 definiciones, 547 auxiliares, 294 conceptos y 94 registros auxiliares de cálculo. Pruebas de inventario y linter: 25 aprobadas. Se preservan diferencias entre documentos y no se consideran reglas salariales autorizadas.

## Estado actual y siguiente acción

MC-H00 cerrado en alcance local. MC-H02: comparación y recuperación realizadas. MC-H01: conexión operativa comprobada y copia restaurada. MC-C01/02/03 implementados, validados y publicados técnicamente. El remitente sigue sin instalación municipal; no se activó el conector ni se modificó nómina.

Siguiente acción: avanzar MC-D01/MC-D02 por dependencias, preservando los campos de certificados que omitía el extractor y diseñando el dominio propio sin ejecutar importaciones globales. La prueba física MC-C04 necesita host municipal permanente y CommKey por canal privado. La computadora identificada es Marcelo y no tiene el colector instalado. No se comprobó una fichada con la PC personal apagada.

## Cierre de validación — 04:27 UTC

- Commit de implementación: `8f43aaf0755431267b71a4695827604c18a45394`, publicado en la rama de integración. CI GitHub `34805842106`: aplicación 2.168 aprobadas/1 omitida; colector Linux 197/197; Windows 192 aprobadas/5 omitidas; navegador 17+15+22 y contrato entre procesos 11/11. Cero fallos.
- SQL real en QA con rollback: 15 grupos aprobados. Fuente histórica, datos, usuarios, membresías, sesiones y funciones de autenticación conservados. La respuesta SQL056 pasó además por el contrato JavaScript real.
- Copia local restaurada: suspensión, revocación en ambos órdenes de bloqueo, exclusión de recepción, rollback y replay después de COMMIT aprobados. Quedó un único evento sintético comprometido sólo en esa copia local; nunca en Neon. Verificador con 10 rechazos de destinos no autorizados.
- Migraciones operativas aplicadas y registradas en `schema_migrations` a las 04:26:49 UTC: 055 SHA-256 `440cd16d80b31f96446b85850b9e42a4ac1db93661ca46197e12dcc31fa363eb`; 056 `71b77fd44b397bb1f43fc176023ab89f1e0caf590e088bb25c0f74f72e3067b9`. Conteos 11.091 canónicos/11.111 históricos/5.853 vínculos y estado del conector sin cambios. Runtime ejecuta las funciones sin SELECT directo a crudos o clave HMAC.
- Candidato `dpl_ESuYyBca9Vo9DpXZswu5mfXNrmHY`: READY, sin cambiar el alias público. Seis archivos servidos coinciden por SHA-256; API GET 405, envío sin credencial 401 y consulta anónima 401. No se promoverá este candidato porque su configuración de función se incorporó después del primer commit; se reconstruirá desde árbol limpio.
- Reversión técnica: promover el deployment anterior `dpl_Fv5beMqg5qAWhMfpWw3UrNk66w4y`. Las migraciones son aditivas y el código anterior sigue disponible; no eliminar tablas de acuses ni restaurar toda la base para una reversión de interfaz. La copia privada restaurable queda como resguardo adicional.

## Publicación comprobada — 04:33 UTC

- Release de producto `a7266ccb1ed62075d8fcf546cd7f4ddc2f3f0eec`, integrado por avance directo de `master`; PR13 figura MERGED. CI exacta `34806144139`, todos los trabajos aprobados.
- Se promovió el artefacto limpio `dpl_HiQJmngLwZxXezYCQfm9Hhtiuwcr`. La integración Git de Vercel generó después `dpl_8WfU1gSSrbBWErXAxSRadVHHgq5M` con el mismo SHA `a7266cc…`; es el deployment efectivo del dominio `municipio-junin-friendly.vercel.app`, READY, proyecto existente `prj_AoxjtYZS3aqVUKqlOaXbYkPhneTT`.
- Dominio público verificado de nuevo después de ese cambio: HTML y assets coinciden por SHA-256; receptor GET405, POST sin token401, consulta privada401. Pantalla publicada: 22 comprobaciones de navegador sin errores, con respuestas sintéticas interceptadas. Esto no acredita una sesión municipal real ni una fichada física.
- Paquete de código instalable fuera de Git: `MuniControl_PM10_Software_20260914_a7266cc.zip`, SHA-256 `c0ad6f3399e5e5818959dca7b2644a8b45af67c6a20b40e55691d1a3e76c558b`. Incluye código, licencia, huellas y guía; no fuentes, claves ni configuración privada.
- La copia PostgreSQL de ensayo se apagó después de QA. Dump y restauración se conservan privados. MC-O01 sigue parcial: falta destino fuera de esta PC, retención y alarmas; la copia puntual no implica un servicio periódico de backups.
- Continuación de esta tarea programada cada hora hasta las 08:00 de Argentina del 14/09: automatización `municontrol-avance-nocturno`. Priorizar el reloj si aparece acceso efectivo; mientras tanto, avanzar datos y pedidos exactos de Noelia. No contactar a terceros ni declarar autorizados sueldos/firmas/pagos/cierres.
- La carpeta original sigue en `fc03daf…`, rama `codex/identity-gateway-benchmark`, con su enlace sin seguimiento intacto. Las fuentes privadas permanecen en Descargas. El backlog privado conserva los pedidos originales y añade únicamente estados/evidencia de ejecución, sin aceptación municipal ficticia.

## Límite de aceptación

Código, pruebas sintéticas, SQL real aislado, publicación, sesión municipal y prueba física se registran por separado. Sueldos, firmas, pagos y cierres requieren su autoridad específica. Un reloj dado de alta o un refresco de pantalla no acredita autonomía.

## MC-D01 — preservación de fechas de escolaridad

El extractor ahora conserva `familia.PRES_14` y `VENC_14` en `sourceFields`, con tabla y clave de origen. Se comprobó sólo el DDL de ambos respaldos: `PRIMARY KEY (CODI_14)`, ambas columnas de tipo date nullable. Se distinguen columna ausente, NULL, vacío y valor inválido; el parser conserva además espacios dentro de cadenas SQL entre comillas. El mapeo del importador retiene ese objeto dentro del `source_payload` existente y puede probarse sin iniciar `main()` ni abrir una conexión.

Validación: 7 pruebas Python de familia, 8 de crosswalk, 4 del mapeo Node, self-test del extractor y contención aprobados. Suite de aplicación: 2.173 aprobadas en Windows. Se añadió esta regresión Python a CI. No se ejecutó una importación, no se cambió el esquema y no se actualizó la población operativa. MC-D01 permanece parcial y MC-E02 pendiente: esto evita perder evidencia en futuras extracciones, no crea un certificado adjunto ni un reporte completo de escolaridad.

## Continuación — recuperación y diagnóstico PM-10

La publicación efectiva al retomar es `10f139a09a0aecd94a3c90b72a49e2ca130b19fa`, deployment `dpl_DKLx6QcZKbWn7iY7WYsLh5XDdKqv` del mismo proyecto. Se retomó el pedido de elegir un host permanente e identificar otros relojes, sin contactar a terceros. La consulta operativa de Neon del 14/09 a las 05:43 UTC confirmó 11.091 canónicos, cero acuses PM10 y conector suspendido; no se ejecutó ninguna ingesta.

El colector 0.1.2 corrige el bloqueo persistente que provocaba una parada ordenada durante la captura. Recupera también cortes de TCP prolongados cuando el lector acredita que no se abrió la conexión ni se intentó autenticar: conserva la cola y espera hasta 15 minutos entre intentos. Los bloqueos previos y de autenticación no se levantan; los errores de protocolo sin evidencia suficiente conservan su límite. La revisión 4.1.1 del lector agrega el código exacto de error de limpieza al informe, sin cambiar comandos, pausas, validaciones ni bytes; el original 4.1.0 queda preservado. Detalle: `docs/PM10_SERVICE_RECOVERY.md`.

El diagnóstico de host ahora separa disponibilidad de ruta/Node, ubicación del ejecutable, privilegios y metadatos de instalación. Ninguno acredita por sí mismo propiedad municipal, permanencia o acceso de la cuenta de servicio. Las rutas remotas se rechazan antes de consultar archivos o ejecutar auxiliares. Se preserva el alcance del código de salida usado por los instaladores: Node y ruta, sin certificación de autonomía.

La cabecera del tablero ya no describe `hardwareConnected` como conexión física: ese indicador puede provenir de una captura antigua recién enviada. Informa el acuse observado en la última consulta, separado de captura, cola y autonomía. La regresión se reprodujo contra el HTML anterior y se probó con una captura anterior al acuse, estados sin datos y vistas de escritorio/móvil.

Relevamiento adicional: 254 direcciones del otro rango documentado para relojes, sólo TCP4370 y hasta cuatro conexiones simultáneas. Las 508 comprobaciones de ruta municipal fueron estables; no hubo un puerto abierto observado. Sin respuesta en 600 ms significa desconocido. El inventario detallado queda privado fuera de Git; el resto de la red no se considera relevado. Continúan seis equipos con protocolo comprobado que requieren autenticación, y cinco de ellos sin modelo/serie actuales confirmados.

Validación local del incremento: aplicación 2.176 pruebas aprobadas; colector 237 casos, 232 aprobados y 5 omitidos por plataforma Windows; contrato remitente/receptor 11 comprobaciones; navegador 26 de recepción y 17 de tablero continuo, sin errores JS. Catorce casos nuevos de recuperación incluyen sockets reales exclusivamente de loopback, transferencia parcial, EXIT, error de transporte anterior a una parada, reinicios simulados por recarga del estado y preservación de bytes. CI y despliegue se incorporan al cierre privado con sus identificadores comprobados. No se tocó la base ni se instaló un servicio en la PC personal.

La exploración de escolaridad produjo un contrato y perfil agregado privados: el vínculo HIJO se distingue por ID2, sin asumir que toda letra H lo sea. La correspondencia de las fechas GRH con el formulario necesita homologación; el modelo propio debe conservar evidencia al refrescar fuentes. No se importaron datos ni se implementó todavía la carga de certificados. Siguiente acción física: host municipal administrable y CommKey validada, instalación única, token HTTPS propio, prueba de fichada en Neon/pantalla con la PC personal apagada. MC-C04 permanece pendiente; la publicación técnica no autoriza sueldos, firmas, pagos ni cierres.

## Certificados escolares — validación del 14/09/2026, 07:25 UTC

Se retoma desde `e0bad5f1abd0722d3f7c4bdf4d2a8b84f28c4042`, deployment efectivo `dpl_Ebga3zhsbDk2nKpUF7ZtaUobm33G` del mismo proyecto Vercel. La carpeta original y los demás worktrees siguen preservados. Un único integrador reúne SQL/datos, API/seguridad y frontend/QA; los pedidos de Noelia y sus criterios de aceptación permanecen textuales en el backlog privado.

MC-D02/MC-E02 tienen un primer incremento implementado: registro manual de un PDF en la ficha del hijo y reporte de contratos administrativamente activos con hijos, presentación y vencimiento explícitos. La pantalla pagina 50 filas y el Excel incluye todo el filtro; no exige reconstruir un archivo externo. No se homologaron las fechas históricas de GRH ni se importó un padrón nuevo. Ausencia de registro no significa certificado no presentado. No se infiere elegibilidad salarial ni vencimiento. Detalle de contrato, acceso y conservación: `docs/FAMILY_SCHOOLING_CERTIFICATES.md`.

La prueba con el DTO real detectó que el importador existente produce UUID de contrato sin restringir versión/variante RFC. Se corrigieron sólo los identificadores de contrato, manteniendo controles estrictos sobre sesiones, membresías, documentos y claves de reintento. En la copia restaurada, 1.057 filas de 529 contratos (incluyen un hijo y contrato sintéticos temporales) pasan SQL, API, modelo de pantalla y lectura del Excel generado de 1.057 filas. Las fixtures se revierten; no se publican datos ni archivos nominales.

Validación ejecutada: aplicación 2.233/2.233 en Windows; API nueva 24/24, modelo/Excel 33/33; 18 escenarios de navegador de escritorio/móvil con datos sintéticos y cero errores JS. SQL real sobre copia restaurada: acceso y revocación, coherencia de fuente, sustitución de staging, identidad, acuses, duplicados, conservación y límites, con rollback verificado. Tres carreras reales con COMMIT de fixtures mínimas exclusivamente locales prueban cuota global, deduplicación y rechazo de snapshots obsoletos; fixtures eliminadas y política restaurada.

El proyecto Neon existente tiene límite comprobado de 512 MiB; no dispone de almacenamiento de objetos en su región. Por ello la carga inicial se limita a 8 MiB globales de PDF deduplicados, con margen de 16 MiB para el cluster, comprobación serializada y costo conservador por alta. El espacio disponible puede ser menor. Lectura, descarga y Excel continúan con cupo agotado; el formulario conserva archivo, fechas y clave al fallar. La carga general depende de ampliar almacenamiento privado verificado. No se contrató otro plan ni se creó otra base operacional.

Antes de publicar se generó una copia privada de la rama operativa y se restauró completa: archivo de 71.720.978 bytes, SHA-256 `b95555cd7e51c47181e432b9e6da82cacb491c9140a63fc00dcf703feaa89538`. La migración 057, SHA-256 `22ac3e3f444a64736303f9c0aa58368dbae20c1a6e58aa669c8570a9604c5b11`, pasó ensayo con ROLLBACK en la rama operacional existente: permisos mínimos y datos anteriores sin cambios. Este checkpoint aún no acredita COMMIT de esquema, CI ni despliegue del incremento.

Reversión prevista: volver al deployment `dpl_Ebga3zhsbDk2nKpUF7ZtaUobm33G`, conservando las tablas aditivas y cualquier evidencia cargada. No se borra documentación ni se restaura toda la base para revertir interfaz. La sesión municipal real y una carga documental real no se ensayaron. A las 07:20 UTC continúan 11.091 fichadas canónicas, cero acuses PM10 y conector suspendido; MC-C04 sigue pendiente de host permanente, clave validada y prueba física con la PC personal apagada. Ninguna publicación autoriza sueldos, firmas, pagos ni cierres.

## Publicación de escolaridad comprobada — 07:37 UTC

El incremento de producto `8eb318b6af81e4f6725dee38d40efba3a6943bbc` quedó integrado en master; PR16 MERGED a las 07:30:57 UTC. CI `34817921730` del mismo commit terminó sin fallos: aplicación 2.232 aprobadas y una omitida en Linux, colector 237/237 Linux y 232 aprobadas / cinco omitidas Windows, contrato 11 por plataforma y 76 comprobaciones de navegador. La suite local Windows aprobó 2.233/2.233.

La migración 057 se aplicó con COMMIT a las 07:30:22.510 UTC en la rama operacional existente, con el checksum documentado arriba. Permisos y medición de espacio verificados; datos anteriores sin cambios. Al aplicar había 6.635.520 bytes admisibles para nuevas cargas; no se garantiza que permanezcan disponibles. La lectura de las 07:37 UTC confirmó cero certificados, blobs y eventos escolares, además de 11.091 fichadas canónicas, cero acuses PM10 y conector suspendido. No se insertó una fixture productiva.

Deployment efectivo comprobado: `dpl_Gany1Poxy54HWAKsxzDLK73XPqQW`, READY, SHA `8eb318b6`, proyecto existente y alias `municipio-junin-friendly.vercel.app`. A las 07:31:39 UTC, ocho archivos principales coincidieron y reporte/descarga/carga anónimos respondieron 401 con no-store. Después, 18 escenarios de escritorio y móvil pasaron cotejando los 40 assets publicados utilizados. Todas las APIs de ese recorrido fueron sintéticas: no acredita una sesión municipal ni carga documental real. La función figura en el artefacto; su ZIP final no pudo inspeccionarse por esa API de Vercel. El parser sí pasó en Windows y Linux CI.

El resguardo privado y su restauración se conservan fuera de Git/CI/Vercel; el servidor PostgreSQL de ensayo se detuvo al cerrar QA. El handoff privado `13_CONTINUIDAD.md` y `backlog.json` contienen la evidencia de cierre, conservan los pedidos originales y mantienen aceptación municipal NULL. MC-D02/MC-E02 siguen parciales por almacenamiento general y validación municipal; MC-C04 permanece bloqueado por host permanente y CommKey. La continuación nocturna existente está activa hasta las 08:00 de Argentina. Siguiente acción: resolver esas dependencias y continuar incrementos sustentados por los datos de Noelia, sin afirmar automatización ni autorizaciones administrativas.
