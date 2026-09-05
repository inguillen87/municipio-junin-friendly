# Noelia: Entorno y asignación contable de sueldos

## Evidencia y alcance

Se procesaron completos los once archivos de audio nuevos de las 20:43–20:49 del 04/09/2026: diez grabaciones distintas, aproximadamente 126 segundos en total. Las dos copias de `20.46.41` son idénticas por SHA-256 y se transcribieron una sola vez. Se usó reconocimiento local con el modelo ya disponible, sin nuevas descargas ni envío a un servicio externo. Las transcripciones automáticas se contrastan con las capturas; no se tratan como fórmulas contables certificadas.

Los tres audios anteriores de las 20:23, 20:25 y 20:28 ya estaban procesados y se documentan en `NOELIA_FEEDBACK_20260904_EVENING.md`.

## Lo que Noelia utiliza

- **Entorno:** datos del municipio, reportes, formatos/importación de novedades y asignaciones para la integración GRH–GAF. El cambio de contraseña depende de privilegios y no es una función exclusiva del circuito salarial.
- **ImsuTaco:** correlación de conceptos salariales por período anual y repartición con su clasificación/partida y demás parámetros contables.
- **ImsuLega:** asociación adicional del legajo con la unidad institucional/presupuestaria y el nomenclador, con fechas de vigencia. Dar de alta al empleado en GRH no resuelve por sí solo esta asociación.
- Noelia indica que utiliza principalmente el primero y el tercero de los cuatro submenús de integración. No se prioriza ImsuArea ni Legajos Configurados sólo por aparecer en el menú.

## Campos confirmados en las capturas

### Correlación de conceptos (ImsuTaco)

Filtros: período anual, repartición y concepto; buscador por concepto y paginado. La repartición debe verse como **número + nombre**, no sólo como descripción.

El formulario muestra: período, repartición, concepto, tipo de concepto, partida, proveedor, cuenta contable, concepto bancario, movimiento bancario, acreedor neto e indicador de neto. La grilla también muestra acreedor. Esto acredita campos de configuración, no que exista transmisión a GAF o al banco.

Los códigos específicos de Junín visibles en los ejemplos no deben convertirse en valores predeterminados para otros municipios. Tampoco se asignará una partida contable basándose únicamente en el nombre parecido de un concepto.

### Asignación por legajo (ImsuLega)

El formulario muestra: legajo, concepto (incluye TODOS), institucional PT, nomenclador, fecha desde y fecha hasta. El ejemplo utiliza datos de la propia contadora; no se copian identificadores personales a las pruebas ni a la documentación.

## Riesgo reportado: fin de vigencia accidental

En `20.49.03` Noelia explica que el sistema completa **Fecha hasta** con el día actual y guardar puede finalizar la asignación. Las capturas muestran el mismo formulario con esa fecha completada y, después, vacía. No se presionó Guardar ni se reprodujo una baja en el sistema municipal.

No se confunde el fin de una asignación contable con la baja laboral del empleado: el efecto exacto en GAF requiere comprobación adicional. El reporte de Noelia sí fundamenta una mejora preventiva de diseño.

Requisitos para MuniControl:

1. Una asignación activa se crea sin fecha de fin predeterminada.
2. Editar sus otros datos conserva su vigencia; abrir el formulario no la modifica.
3. **Finalizar asignación** es una acción separada, con fecha elegida expresamente y explicación del efecto.
4. Cancelar no escribe cambios. Un error conserva los datos ingresados.
5. Validar que la fecha final no sea anterior al inicio y comprobar superposiciones para el mismo alcance.
6. Mostrar la diferencia antes de confirmar y conservar autor, fecha y versión de cada cambio.
7. No generar una baja laboral, una imputación o un asiento al editar esta asociación.

## Incrementos propuestos, aún no implementados por este relevamiento

1. **Preparación contable de sueldos:** una vista de asignaciones por año y repartición, código + nombre, buscador y lista de faltantes. Alta/edición breve, sin extender la pantalla principal de Nómina.
2. **Alta completa del empleado:** incluir o dejar explícitamente pendiente la asignación institucional; no obligar a recargar el mismo legajo en varias pantallas. Mantener la exclusividad del alta en Marcelo según el requerimiento del propietario.
3. **Comprobación antes de imputar:** señalar conceptos sin partida, asignaciones vencidas/superpuestas y legajos sin asociación vigente. Una advertencia no autoriza cambiar haberes.
4. **Intercambio con GAF:** sólo después del acceso y la validación de catálogo, versión, reglas de imputación, formato de envío, idempotencia y respuesta. No presentar una pantalla de configuración como integración conectada.

## Trazabilidad de las grabaciones

| Hora | Duración aprox. | Referencia SHA-256 |
|---|---:|---|
| 20.43.02 | 12 s | 95bda1bca1642c9dfbec2b64956f215f6bb731f02d06f4667f71d706097177ad |
| 20.43.23 | 5 s | 6e4ab1636897c20d21779af8d50fcac21ac00e161b49a87ad43c21eb9179cdd2 |
| 20.43.55 | 20 s | 4523866a5e95e3710fe3917f4cc71adb420d1974446faaf89f738454c95353d2 |
| 20.46.41 (dos copias) | 20 s | 7ca24d54c023992cf05fef48db67cf247f4ed8eb1b5b3caa6999f0829853ff0f |
| 20.47.30 | 17 s | 9d3bd66a80164a97c9db5b1af4420aa7f87c874096b0aa163312f040344a0b69 |
| 20.48.27 | 19 s | 5c46f8e64a4febc24e7d064caed82a8e0092e349f9e2547d8449315c417f6347 |
| 20.49.03 | 16 s | edd988cc231799a2f94a2fc61d3938f13cc2c1a396fefc8334426d85ec04884b |
| 20.49.17 | 3 s | bd17e3cd272186e0e83903ff51067ef5467d56831195f1e860e1bd88a891a222 |
| 20.49.46 | 14 s | 1195eaa50fb8fb0911cfc3b0e82507a2fca9ca8bc9dc9ee545cdb232dfdb78e6 |
| 20.49.51 | 1 s | 9a49b9a51e837dedddc733fdb69ffeecf9cdbd8a5ed9385229bd1966b6b1fac3 |

La última grabación es muy breve y su transcripción no es concluyente; no se deriva un requisito de ella. La grabación 20.49.46 anuncia un documento consolidado posterior. Este registro no presume que ese documento ya haya sido recibido.
