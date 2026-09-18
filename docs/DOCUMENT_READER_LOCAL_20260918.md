# Lector documental municipal: OCR local y extractos verificables

## Alcance de esta entrega

En Jurídica se incorpora un lector dentro de la plataforma, separado del guardado del Registro Normativo. Acceso directo: `/juridica#lector`; desde Asistente se ofrece el acceso a quienes tienen `legal.norm.read`. Se reutiliza la sesión y el bootstrap autorizado del registro. No se amplían roles ni se crean endpoints públicos para documentos.

Acepta PDF estáticos y PNG/JPG, hasta 8 MiB y 30 páginas. La capa de texto nativa es prioritaria. Sólo ante una página sin texto y una acción expresa del usuario se inicia el OCR de esa página. No se hace reconocimiento automático de todas las páginas ni se envían archivos a un servidor de OCR.

Tesseract.js 7.0.0 y el modelo español se sirven desde los assets del mismo sitio, bajo demanda. Se evita CDN en tiempo de lectura y se desactiva el almacenamiento del motor en IndexedDB. El coste de procesamiento no depende de una API por página; sí utiliza el dispositivo y la distribución normal de assets. No se promete OCR infalible ni soporte homologado de manuscritos.

El resultado OCR requiere revisión explícita antes de entrar en los extractos. El número de confianza del motor no es una probabilidad de exactitud. Cambiar texto revoca esa revisión local. No se borra ni altera el PDF recibido. Las citas de los extractos conservan página y offsets y se verifican literalmente sobre el texto disponible.

Los extractos son una selección algorítmica, **no un resumen generativo ni un dictamen**. Identifican páginas representadas y páginas no utilizables; pueden omitir pasajes relevantes. Se puede volver a la página original y descargar la lectura como TXT. Cerrar el lector elimina los resultados de memoria; descargar es una acción explícita del usuario.

## Coste y proveedores

No se crearon claves de Hugging Face, no se reutilizaron claves de ObraSaaS y no se modificaron sus repositorios. Hugging Face Inference Providers publica créditos gratuitos limitados; no constituye una garantía de servicio gratuito ilimitado. Para este OCR una credencial externa es innecesaria.

Se preparó y probó de forma sintética `lib/document-summary-provider.js`: modelo económico fijado, límite de entrada/salida, `store:false`, sin herramientas, llamadas ni archivos adjuntos, y verificación literal de citas. **No está conectado a una ruta HTTP ni a un botón productivo.** No se utilizaron claves reales ni se hicieron llamadas de pago. La conexión generativa necesita autorización de contenido por solicitud, presupuesto duradero y la operación del servidor completa antes de activarse. `store:false` por sí solo no certifica cero retención por el prestador.

## Controles

Tiempo máximo por OCR: 90 segundos; imagen de trabajo hasta aproximadamente 4 megapíxeles; texto por página hasta 50.000 caracteres; total hasta 300.000. Cancelación y cambio de archivo invalidan respuestas anteriores, terminan los trabajadores y conservan el original. Se rechazan imágenes enormes, archivos no compatibles, PDF cifrados y contenido activo/adjuntos/formularios fuera del alcance estático inicial.

La ventana modal utiliza teclado, Escape, devolución del foco y limpieza ante pérdida de acceso. La vista móvil compacta las opciones después de cargar para priorizar original/texto. No modifica fichas jurídicas, archivos firmados, haberes, marcaciones ni datos nativos.

## Cierre de validación antes de publicación

El cierre repitió las 3.610 pruebas de aplicación y la compilación. Aprobaron 17 grupos del Registro Normativo y ocho grupos del lector, incluida una llamada OCR real sobre una imagen de ensayo (sin datos municipales). Se comprobó texto nativo sin cargar el motor OCR, citas y navegación a páginas, revisión obligatoria del OCR, teclado/móvil y retirada de contenido al perder acceso. No hubo requests externos ni uploads del documento en ese recorrido.

Se reforzó la separación del texto nativo: la operación OCR no puede reemplazarlo incluso si se llama directamente al modelo de actualización. El comienzo del OCR tiene un cerrojo local contra la doble invocación mientras React actualiza el estado. Al volver a la pestaña se revalida el acceso del registro y al cerrar se cancela el procesamiento.

La evidencia de publicación se registrará por separado cuando GitHub/Vercel y la comprobación de assets productivos confirmen la versión. Este registro local de pruebas no declara actualización del maestro salarial, migración aplicada, recepción adicional de relojes ni activación generativa.

## Continuidad de datos

Consulta de Neon del 18/09/2026 a las 01:13:48 UTC: `source_import_batch` mantiene GRH del 06/08/2026, importación 3, y el conjunto de bases ocupa 516.833.280 bytes. La comprobación siguiente confirma que las capas de versionado GRH 061–063 no están instaladas y no hay funciones `grh ... source/revision/publish` en el esquema público. Los módulos 064–070 actuales sí están presentes. La aplicación del respaldo de septiembre no ocurrió durante este corte.

El trabajo de fuente diferencial debe integrarse contra este estado, conservar los legajos y operaciones nativos, verificar archivo/restauración y capacidad real, y publicar una sola selección coherente. No ejecutar la carpeta histórica de ensayos como si fuera una migración ya certificada del esquema actual. No se removieron tablas de respaldo ni históricos para aparentar espacio libre.
