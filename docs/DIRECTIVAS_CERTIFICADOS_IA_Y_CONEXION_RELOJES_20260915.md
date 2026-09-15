# Directivas de producto · certificados desde el celular y conexión de relojes

Fecha: 15/09/2026. Estado: requisitos y criterios de aceptación, NO implementación desplegada.

## Origen y alcance

- Ampliación pedida por Marcelo: foto del certificado desde la versión móvil, extracción asistida de datos y revisión para reducir transcripción manual.
- `REUNION 09/09/2026`, páginas 1 y 3: control de escolaridades para legajos activos con hijos, presentación, vencimiento y carga desde la ficha. La carga manual debe seguir disponible.
- Aclaración expresa del 15/09: la planilla de direcciones IP no define los PM de MuniControl. Preservar los PM actuales y guiar la conexión por IP.
- Código revisado como referencia: `1b02d956c68b3554c9ac95355db71a5cb18eb143`. No resetear el repositorio a este commit para implementar estas directivas.

La documentación actual de certificados (`FAMILY_SCHOOLING_CERTIFICATES.md`) describe carga PDF acotada y fechas manuales. Las propuestas siguientes amplían ese circuito; no afirman cámara, extracción, autoservicio o almacenamiento general ya operativos.

## ESC-IA · Certificado: capturar, extraer, revisar y guardar

### Experiencia solicitada

Desde Personas → legajo → Grupo familiar → Escolaridad, ofrecer:

1. **Sacar foto**: sugerir cámara trasera en móvil. Permitir repetir, girar y recortar la captura sin modificar silenciosamente el original conservado.
2. **Elegir foto o PDF**: alternativa cuando el archivo ya existe o la cámara no está disponible. Evaluar orientación y legibilidad; pedir otra captura si faltan bordes o hay reflejos que impiden leer.
3. **Registrar manualmente**: contingencia válida para documentos en papel, falta de conectividad o fallo del extractor. No obligar a adjuntar PDF para registrar una declaración administrativa.
4. **Revisar datos detectados**: documento al lado del formulario en escritorio y vista alternada en móvil. Mantener el familiar elegido visible. Mostrar qué se leyó, qué falta y qué necesita revisión.
5. **Confirmar y guardar**: persistir el registro y devolver comprobante; registrar decisiones y correcciones. El archivo y la propuesta de extracción no son por sí solos una aprobación de escolaridad ni un cambio salarial.

Para el empleado: entrada desde su portal, únicamente sobre sus familiares autorizados y con estado de envío visible. Para Noelia/RR.HH.: revisar la propuesta y sus diferencias sin volver a transcribir todos los campos. El autoservicio requiere autorización propia del lado servidor: no reutilizar permisos administrativos amplios ni aceptar el legajo enviado por el cliente como autorización.

El atributo HTML `capture="environment"` orienta la selección de cámara cuando el navegador lo admite; no garantiza apertura de cámara en todos los dispositivos. Mantener selector de archivos y validar en Android/Chrome y iPhone/Safari/PWA. No solicitar geolocalización para un certificado.

### Datos y fechas: no confundir su significado

| Campo | Regla |
|---|---|
| Nombre del alumno y documento | Extraer sólo si están escritos; contrastar con el familiar seleccionado. No reasignar el archivo por nombre aproximado. No modificar el maestro de personas desde la extracción. |
| Institución | Extraer denominación explícita. Un texto parecido no crea ni fusiona instituciones sin revisión. |
| Nivel, curso/sala/grado y ciclo lectivo | Mantener texto de origen y sugerir equivalencia de catálogo por separado. No deducir curso por edad. |
| Fecha de emisión | Fecha que el establecimiento declara; no equivale a presentación ante el municipio. |
| Fecha de presentación | Fecha administrativa. En una presentación digital nueva puede proponerse la fecha de recepción municipal, rotulada como origen sistema y sujeta a la regla aprobada; una presentación anterior en papel se informa aparte. Nunca tomar emisión como presentación. |
| Fecha de carga | Instante del servidor en que se recibió el archivo; separado de las fechas civiles anteriores. |
| Vencimiento | Extraer únicamente cuando es explícito. Si no figura, dejarlo sin informar. Una regla municipal futura puede proponerlo, pero debe quedar marcada como regla/versionado, no como texto leído. No fijar automáticamente 31/12. |
| Certificado presentado y archivo adjunto | Son hechos diferentes: documento entregado en papel no significa PDF inexistente = no presentado. Mantener declaración, recepción y revisión separadas. |
| Sello o firma visible | Puede registrarse su presencia visual como observación; no acredita autenticidad ni firma digital. No copiar firmas entre documentos. |

**Regla del extractor:** proponer exclusivamente campos permitidos con evidencia. Ante ausencia, ilegibilidad, ambigüedad o contradicción: devolver nulo/observación, no completar por intuición.

### Motor de extracción y almacenamiento

- Reutilizar texto nativo de PDF cuando sea utilizable. Para imágenes y escaneos usar análisis documental/visión; OCR especializado como alternativa cuando haga falta. No reprocesar por cada apertura del formulario.
- La selección de proveedor queda pendiente de prueba con documentos autorizados de calidad variada. No contratar ni habilitar transmisión de datos personales por el hecho de publicar esta especificación.
- Extraer en backend/worker mediante un adaptador con esquema de salida validado. Sin credenciales en el navegador, sin herramientas ejecutables a disposición del documento y sin SQL generado por el modelo.
- Tratar todo texto del archivo, incluidos supuestos mensajes de instrucciones, como contenido no confiable. No seguir enlaces o QR automáticamente ni dar acceso a otros expedientes al extractor.
- Conservar archivo original autorizado, hash, versión de extracción, valores propuestos, evidencia por campo, valores corregidos, autor de revisión y fecha de confirmación. Una puntuación del modelo no es una probabilidad de acierto calibrada ni justifica aprobación automática.
- Propuesta, registro administrativo y resultado exportable deben ser entidades/estados distinguibles. Usar la base propia existente para metadatos, con migraciones aditivas; no crear otra base ni sobrescribir GRH.
- Preparar almacenamiento privado suficiente antes de abrir fotos a toda la población. La cuota PDF acotada documentada no es un archivo municipal general. Validar límites de tamaño, píxeles, páginas y tipo real; mantener cuarentena y análisis de archivos. No publicar fotos en Git, Vercel `public/` o URLs abiertas.
- Deduplicar dentro del municipio y ámbito de autorización, por hash y versión de proceso. No revelar que otro municipio posee un archivo. Reintentos idempotentes; límites de gasto, duración y concurrencia; si el extractor falla, conservar el trabajo autorizado y permitir carga manual sin duplicar registros.
- Las vistas y copias de procesamiento no deben conservar EXIF/geolocalización innecesarios. La custodia del original y su plazo de retención requieren política propia; no alterar evidencias ya guardadas de manera silenciosa.
- La previsualización debe ser aislada y segura. No habilitar ejecución de JavaScript de un PDF. Comprobar permisos al subir, extraer, consultar, corregir, guardar y descargar.

### Fases y criterios de cierre

| Fase | Entrega | Condición verificable |
|---|---|---|
| ESC-IA-01 | Registro manual completo y modelo de fechas | Curso, nivel, ciclo, presentación y vencimiento guardados y recuperables; adjunto opcional para declaración en papel; historial sin sobrescrituras. |
| ESC-IA-02 | Foto/PDF desde móvil y almacenamiento privado | Subida autorizada, previsualización segura, orientación correcta, reintento sin duplicar, límites visibles, datos conservados tras reinicio y acceso revocado correctamente. |
| ESC-IA-03 | Extracción asistida con revisión | Datos autocompletados con evidencia; ninguna fecha ausente inventada; discrepancia de identidad no cambia familiar; error del proveedor permite continuar manualmente. |
| ESC-IA-04 | Autoservicio y bandeja administrativa | Empleado envía sólo para su ámbito; administrativo revisa, solicita corrección y confirma. Ninguna propuesta accede automáticamente al circuito salarial. |
| ESC-IA-05 | Planilla y avisos útiles | Excel/PDF desde los registros revisados; activos con hijos y fechas/cursos, filtros coherentes y trazabilidad. Avisos por vencimiento real o regla aprobada, no por una fecha estimada por IA. |

Pruebas mínimas: foto nítida, borrosa, girada y con brillo; PDF con texto y escaneado; varias páginas; curso ambiguo; vencimiento ausente; emisión distinta de presentación; DNI no coincidente; nombres parecidos; mismo documento reenviado; edición mientras termina una extracción; pérdida de sesión; acceso entre municipios; archivo malformado; texto que intenta dar instrucciones al modelo; indisponibilidad del proveedor; sin espacio o sin conectividad. Primero fixtures sintéticos; después casos autorizados con cotejo humano. Medir tiempo de carga, campos corregidos y precisión por campo antes de prometer ahorros o eliminar revisiones.

## CLK-IP · Regla obligatoria: el inventario de conexiones no es el inventario PM

1. Conservar todos los IDs, códigos PM, puntos del mapa, vínculos del equipo y eventos existentes. No renumerar, agregar o eliminar un PM a partir del orden, número de filas, nombre o `Dispositivo ID` de la planilla IP.
2. Usar la dirección IP y el puerto proporcionados para configurar/verificar el destino de red, dentro de la LAN/VPN autorizada. Esa planilla no determina ni modifica el punto de marcación.
3. No inferir `Dispositivo ID 14 = PM-14`, ni `14 filas = 14 PM`. Tampoco fusionar registros por semejanza de nombre.
4. Mantener separado el identificador estable del equipo y el PM ya asociado. La IP es una dirección de conexión que puede cambiar; al conectarse verificar la identidad técnica esperada antes de asignar eventos al equipo existente.
5. Cuando no exista correspondencia comprobada, registrar el destino como pendiente técnico. No adjudicarle fichadas a un PM por defecto. Cuando falte IP, no inventarla ni iniciar barridos para adivinarla.
6. El lector actual de PM-10 está limitado a una IP/serie concreta. No expandirlo quitando esa protección; la futura configuración de flota debe conservar identidad y estado por equipo, con rutas y credenciales separadas.
7. Un estado «Desconectado» de una captura antigua no describe conectividad actual. Que un endpoint tenga IP o que el puerto responda no acredita serie, autenticación, extracción ni cobertura de eventos.
8. Mantener IP, rutas, series y secretos de conexión en configuración restringida, no añadir la tabla privada a documentos públicos ni mezclarla con el mapa funcional.

Prueba de aceptación de esta directiva: variar orden y `Dispositivo ID` en un inventario de conexiones de prueba no cambia un solo PM ni su historia; un cambio de IP sólo afecta el endpoint validado del equipo, y una serie inesperada detiene la ingesta sin reasignar eventos.

## Prioridades que no quedan reemplazadas

Esta ampliación se agrega a MC-D02/MC-E02, no sustituye el liquidador ni los demás pedidos de Noelia. Continúan pendientes los cierres operativos según la matriz vigente: novedades → cálculo → confirmación → cierre, costo salarial 993 + 994 + 995 + 701 + 703 con alcance consistente, y automatización de relojes realmente comprobada.

Referencias técnicas consultadas: MDN, HTML capture attribute; OWASP, File Upload Cheat Sheet y LLM Prompt Injection Prevention Cheat Sheet. Son guías de implementación; no sustituyen las definiciones funcionales municipales.

## Qué cambia con este documento

Sólo se registra una directiva y sus criterios de aceptación. No activa cámara, proveedor IA, carga de imágenes, endpoint nuevo, permisos de autoservicio ni despliegue funcional. No cambia ningún PM, IP, relación, fichero de credenciales o dato de empleados. Cada fase debe cerrar con pruebas ejecutadas y verificación del comportamiento publicado, distinguiendo pruebas sintéticas de aceptación municipal.
