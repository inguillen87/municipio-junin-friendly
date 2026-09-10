# DOC-01 — Firma y emisión de documentos por usuario

**Fecha:** 10/09/2026. **Estado:** especificación incorporada al plan; implementación, vinculación de la firma y activación productiva pendientes.

**Seguimiento:** [Issue #1](https://github.com/inguillen87/municipio-junin-friendly/issues/1).

Extensión de la [hoja de ruta competitiva](./COMPETITIVE_PRODUCT_ROADMAP.md), los [principios UX](./PRODUCT_UX_PRINCIPLES.md) y el [handoff general](../CODEX_HANDOFF_JUNIN_ENTERPRISE.md). No sustituye los sprints de jornadas, licencias, conceptos, liquidación y colector permanente. No marca ninguno de ellos como terminado.

## 1. Resultado solicitado

Noelia podrá emitir, con su usuario municipal y las facultades correspondientes, documentos PDF y Excel que incorporen su firma gráfica genuina y su identificación profesional. El circuito será reutilizable para otros responsables y municipios, sin compartir firmas ni atribuciones.

El archivo aportado en la conversación es material privado de referencia para este feature. Conservar el original sin alteración y registrar hash y versión en custodia privada. Cualquier ajuste de contraste, recorte o escala debe conservar el trazo y proporciones, tener una vista previa y no sustituir el original. No redibujar/imitar una firma ni generar trazos nuevos. La conformidad sobre la versión a utilizar corresponde a la titular autorizada.

**No incorporar la imagen en Git, archivos públicos, pruebas, fixtures, logs, HTML estático o bundles de Vercel.** No se activa la firma por el solo hecho de haberla recibido en el chat.

## 2. UX: configurar una vez, emitir desde el trabajo diario

### Mi cuenta → Mi firma institucional

Presentar firma, nombre profesional, cargo, organismo, vigencia y estado: pendiente de activar / activa / suspendida / reemplazada. Permitir vista previa, activación por la titular habilitada, reemplazo versionado y suspensión. Una nueva firma no cambia documentos emitidos antes.

Resolver titular y municipio mediante IDs canónicos de identidad, membresía y tenant. No identificar a la firmante comparando un nombre visible o un correo escrito en el navegador. Un administrador técnico puede preparar la configuración según permisos, pero no hereda automáticamente la capacidad de firmar como otra persona.

### Desde Legajo, Liquidaciones, Novedades y Certificaciones

Conservar persona, período, tipo de documento y filtros al pasar entre módulos. Botones grandes y explícitos: **Ver detalle**, **Vista previa**, **Descargar borrador**, **Emitir con mi firma y exportar**, **Descargar documento emitido** y **Ver historial**.

La vista previa debe mostrar documento, alcance, páginas/filas, firmante y estado. Al confirmar, emitir una versión congelada del contenido. Un lote debe mostrar cantidad de documentos, período, totales y excepciones antes de la confirmación; nunca incluir registros ocultos por paginación.

La firma se aplica al emitir, no a cada consulta ni por iniciar sesión. Después de la emisión, la descarga de un usuario autorizado entrega el mismo archivo: no lo vuelve a firmar ni cambia al responsable. Los borradores llevan identificación visible de borrador y no incluyen la firma final. No se muestran botones sin implementación funcional.

## 3. Alcance por documento y formato

| Documento | Entrega prevista | Condición de emisión |
|---|---|---|
| Recibo de haberes individual | PDF con todos los conceptos; detalle Excel asociado cuando corresponda | Liquidación cerrada, conceptos completos, conciliación e intervención del responsable autorizado |
| Resumen de liquidación | PDF y Excel con período, alcance, subtotales y responsable | Indicar si es preliquidación o información final; no atribuir pago por el solo hecho de emitir |
| Informe de novedades | PDF y Excel por persona/período o lote completo | Conservar estado y aprobaciones del lote; no confundir novedades con haberes calculados |
| Certificación habilitada | PDF, con Excel de soporte si el tipo lo requiere | Plantilla, evidencia, estado y autoridad propios del tipo documental; no habilitar todas las certificaciones por defecto |
| Listados administrativos | Excel y PDF para revisión o emisión según política | Datos fuente y filtros explícitos; firma sólo en tipos habilitados y al confirmar emisión |
| TXT/CSV bancarios o fiscales | Archivo técnico original + constancia separada cuando corresponda | No insertar firma, sello, QR, cabecera ni bytes extra en el formato receptor |

### PDF

Plantilla institucional legible, títulos, período, columnas alineadas, saltos de página controlados y numeración. El bloque de firma incluye imagen autorizada, nombre, cargo y fecha/hora de emisión. El sello visual sólo puede usar elementos institucionales aprobados: no inventar sellos, matrículas ni facultades. El PDF final es la versión documental de referencia.

### Excel

Conservar importes y cantidades numéricos, códigos/identificadores sin pérdida de ceros, filtros, paneles inmovilizados, encabezados repetidos y área de impresión. Incorporar firma y responsable en el bloque documental o la hoja **Emisión**, sin tapar datos. Separar **Detalle**, **Totales** y **Emisión**; adaptar hojas a cada reporte.

Excel sigue siendo editable: una imagen o protección de hoja no prueba integridad. Guardar los bytes originales emitidos y su hash externo. Una modificación local no debe presentarse como nueva versión emitida por MuniControl. No afirmar que se puede impedir la extracción de una firma gráfica incluida en un archivo descargable.

## 4. Descuentos comprensibles y conciliados

Mostrar **cada retención** con código, descripción completa de origen, importe y período. Agregar entidad/destino, base, alícuota, cantidad o cuota únicamente cuando existan en una fuente validada. No deducir un porcentaje legal dividiendo descuento por bruto ni completar faltantes con cero.

Preservar denominación de origen y, si se necesita una explicación amigable, guardarla como campo separado y aprobado. No agrupar conceptos diferentes bajo un único rótulo «Otros descuentos». Los conceptos todavía sin descripción deben quedar identificados para revisión.

Controlar con aritmética decimal exacta:

- suma de retenciones detalladas contra total de retenciones;
- haberes remunerativos + no remunerativos + asignaciones − retenciones contra neto;
- mismo conjunto de datos, documento y versión en PDF y Excel;
- contribuciones patronales separadas, sin descontarlas nuevamente del neto del empleado.

Los totales mensuales por sí solos no permiten reconstruir el detalle. Si falta una línea, denominación o correspondencia de fuente, permitir únicamente un resumen claramente identificado y bloquear el recibo final detallado. No insertar descuentos del ejemplo de un empleado en los recibos de los demás.

## 5. Emisión y autorización en servidor

Modelo propuesto, no migración aplicada: **perfil de firma**, **versión privada del recurso**, **documento emitido**, **artefacto por formato** y **evento documental**. Extender Neon y la capa de acceso existente; no crear una base paralela.

Guardar tenant, identidad responsable, membresía, tipo documental, período, referencias a fuentes y cierre/lote, versión de plantilla, versión de firma, estado, instante de emisión e identificador opaco. Almacenar el hash de cada archivo terminado en un manifiesto externo; no intentar incrustar en el propio archivo su hash final autocontenido.

Antes de generar: verificar sesión activa, facultad documental, vigencia de firma y estado de fuente. Resolver esos valores en servidor, no confiar en un `signerId`, nombre o indicador de aprobación enviado por el cliente. Aplicar separación de funciones donde el proceso ya la exige. Un empleado sólo obtiene sus documentos emitidos; funcionarios reciben el alcance autorizado.

Usar clave de idempotencia y versión esperada. Un reintento no duplica emisión. Si cambia fuente, firma o plantilla durante la preparación, cancelar la emisión y regenerar la vista previa. Publicar la versión como emitida sólo después de generar, guardar y verificar todos los formatos requeridos. No publicar un PDF sin su Excel requerido ni un lote parcialmente exitoso como lote completo.

Custodia privada: reutilizar R2 u otro almacenamiento privado ya aprobado únicamente tras comprobar escritura, lectura y hash. No afirmar que R2 está operativo antes de verificarlo. No exponer endpoints que entreguen la firma original por sí sola a lectores de recibos.

Revocación: registrar causa y autor, conservar la versión histórica y emitir una sustitución relacionada; nunca modificar silenciosamente un documento ya emitido. La suspensión futura de la firma no revoca automáticamente documentos anteriores. La consulta por QR/identificador no expone nómina, datos personales ni archivos sin la autorización correspondiente.

## 6. Firma gráfica y firma digital

La fase inicial usa **firma gráfica aportada y emisión trazable**. No rotularla «firma digital certificada», «firma ARCA» ni prometer validez probatoria de una firma criptográfica. El dibujo realizado con un lápiz digital no equivale por sí solo a un certificado digital.

Preparar una integración posterior con certificado válido y verificación criptográfica, manteniendo separados estado documental, firma visual y resultado de validación. El QR o el hash de MuniControl no sustituyen esa firma.

Referencia pública para la distinción: [Argentina.gob.ar — firma electrónica y firma digital](https://www.argentina.gob.ar/node/414436). Esta especificación no acredita emisión oficial, pago ni facultades de certificación.

## 7. Fases y aceptación

1. **DOC-01A — Perfil y custodia:** original privado, versión visual confirmada por la titular, permisos y vista previa. Salida: perfil activado sin exposición pública del recurso.
2. **DOC-01B — Emisor común:** estados, validación de sesión/facultades, fuente congelada, idempotencia y auditoría. Salida: documento sintético completo emitido y recuperable en QA.
3. **DOC-01C — Detalle y exportadores:** PDF/XLSX consistentes, descuentos completos, control exacto y plantillas de impresión. Salida: casos de referencia conciliados sin completar datos por conjetura.
4. **DOC-01D — Accesos y operación:** rutas desde legajo, liquidación, novedades y tipos de certificación habilitados. Salida: recorrido completo con roles reales de prueba, errores útiles y acciones efectivas.
5. **DOC-01E — Entrega y ciclo de vida:** descarga autorizada, revocación/sustitución, concurrencia, recuperación y publicación verificable. Salida: pruebas y despliegue registrados; piloto con la titular habilitada.
6. **DOC-01F — Firma digital criptográfica:** integración específica posterior. No bloquea preparar lo anterior, pero no se declara implementada por incluir una imagen.

### Pruebas obligatorias antes de activar

Denegar otra cuenta/municipio, sesión revocada, firma inactiva y manipulación de firmante; no firmar borradores; no emitir recibos sin detalle o con diferencias; preservar conceptos y cantidades; evitar inyección de fórmulas en textos de Excel; mantener idénticos datos en PDF y Excel; no alterar TXT/CSV; impedir duplicación por reintentos; probar descarga del original, revocación y sustitución; comprobar documentos extensos, impresión A4, teclado y móvil. Usar datos y firmas sintéticos en CI, nunca la firma genuina ni nóminas nominales.

## 8. Límites de esta actualización

Este commit incorpora el feature al plan y su seguimiento. No sube la firma genuina a Git, no modifica las cuentas de Noelia, no concede permisos, no emite certificaciones y no activa botones de firma en producción. Los trabajos de jornadas, colector automático y cálculo salarial conservan su propio estado pendiente y sus criterios de cierre.
