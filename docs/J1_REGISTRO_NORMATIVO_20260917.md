# J1 · Registro normativo dentro del portal

## Circuito de trabajo
Inicio del portal → tarjeta Jurídica y Legislativa, o menú Jurídica y Legislativa → Registro normativo. Ruta canónica `/juridica`; aliases antiguos/nuevos redirigen sin perder consulta. No es una aplicación externa ni otro usuario.

Registrar norma → identificación/documento → fechas/artículos → motivo → revisar → confirmar → ficha. Buscar por texto incorporado, tipo y año; abrir el PDF fuente; preparar una nueva versión; consultar versiones anteriores y el motivo/autor de cada una. Los artículos incorporados tienen referencia a norma, versión y página; no se extraen automáticamente del PDF.

## Datos y controles
Cuatro tablas propias: `legal_norm`, `legal_norm_document`, `legal_norm_revision`, `legal_norm_attempt`. El documento es privado, se conserva exactamente como fue recibido y la descarga verifica SHA-256. Se registra quién, cuándo y por qué cambió la ficha. Las correcciones son nuevas revisiones; originales e historial no admiten UPDATE/DELETE/TRUNCATE por el circuito.

La identidad de norma incluye municipio, tipo, órgano HCD/Ejecutivo, número y año. No se pueden alterar esos identificadores mediante una corrección de metadatos. Las fechas admiten historia desde1700; la fecha de incorporación no reemplaza a emisión/publicación/efectos. La vigencia permanece **no determinada**: este registro no verifica firmas, promulga, deroga ni produce efectos sobre contratos o sueldos.

Límites iniciales: PDF de2MiB y30páginas, hasta150artículos y180KB de metadatos por revisión,128MiB de originales por municipio,5000normas y1000versiones por norma. El almacenamiento binario inicial en PostgreSQL mantiene atomicidad; la ampliación a objetos privados/migración histórica masiva debe preservar hashes, versiones y permisos. No es un archivo masivo terminado ni un motor de IA.

## Acceso
Capacidades `legal.norm.read` y `legal.norm.register`, ambas municipales. La API y PostgreSQL comprueban cuenta/membresía activas, sesión MFA, versión de identidad, vencimiento y facultades efectivas. No requieren legajo ni conexión GRH para operar normas propias. La API utiliza el rol aislado existente; éste sólo puede ejecutar la fachada acotada y no leer/escribir directamente las cuatro tablas ni las funciones auxiliares.

Las capacidades se incorporan a los perfiles municipales integrales ya existentes; no se convierten en administración global ni dan acceso a otros municipios. El primer registro es de normativa compartida dentro del área: **no admite expedientes reservados ni documentos personales**. El alcance por expediente/órgano reservado corresponde a las siguientes etapas. No se envían archivos a IA ni proveedores externos.

## Pruebas y procedencia
La migración069 fue ensayada en una rama QA y en un esquema sintético separado; se comprobaron52 casos en PostgreSQL y se revirtieron todos los registros de ensayo. Incluyen versiones, fuentes originales, paginación, búsquedas, idempotencia, concurrencia por versión, denegación intermunicipal y MFA. Las funciones nuevas fueron comprobadas realmente; el helper general de incompatibilidades IAM del esquema sintético es un stub de pruebas, no una nueva certificación de todo IAM.

SHA-256 de `scripts/migrations/069-native-legal-registry.sql`: `bd24c37794a98c66369d5bf9e8f48cc764e0ff9a22bc9f9433961a9432b779e2`.

Los57tests JavaScript del registro verifican formularios, contrato de respuesta, autenticación antes de analizar documentos, límites y parser PDF real, claves repetidas JSON, origen, recuperación y descarga. El navegador prueba la página completa desde Inicio, pero autenticación y SQL están interceptados con fixtures: no equivale a crear una norma con una sesión municipal real.

## Publicación y continuidad
Publicar como un incremento agrupado después de verificar esquema, suite, compilación y navegador. Reutiliza el runner productivo existente de Novedades: compara recursos del registro y del portal, exige401/no-store para una consulta anónima y ejecuta el flujo con archivos publicados y API sintéticas. No agrega otro workflow ni previews por ajuste.

El archivo fuente de migración está versionado; registrar su checksum y verificar que las funciones productivas coinciden con los cuerpos ensayados. Antes de modificar las asignaciones, preservar el catálogo y relaciones IAM en un respaldo privado de alcance limitado. El esquema legal nuevo debe iniciar vacío: no sembrar leyes ficticias en producción para una demostración.

Reversión: antes de cualquier registro real, puede revertirse sólo la publicación de código conservando el esquema y auditoría. Una vez cargados documentos, no eliminar tablas para volver atrás: preservar originales/versiones y migrar con control. No resetear master ni tocar bases GRH/payroll por una reversión jurídica.

#40 continúa con contratos, expedientes, trámite legislativo, decisiones motivadas de vigencia, alertas y análisis con citas. #37 mantiene topes oficiales/versionados, horarios/justificaciones homologados y cálculo propio conciliado. Registrar un documento no es aprobar una regla salarial. La cuenta de Mariano, su MFA y los accesos existentes no se recrean ni se vinculan con empleados.
