# Padrón operativo: activos primero, histórico explícito

## Entrega
Personas abre el padrón activo por defecto tanto en API como en interfaz. Restablecer filtros vuelve a Activos. Indicadores provenientes de la fuente certificada, sin cantidades fijas en código. Búsqueda y paginación operan sobre el grupo elegido. Tarjetas accionables: activos, incluidos en corrida, activos fuera de corrida, estados a revisar. Consultas adicionales: varios legajos de una persona, liquidados únicos del último mes cerrado e inactivos.

## Definiciones
- Activo administrativo no implica liquidable, pagado o habilitado para descuentos.
- La cantidad de personas se cuenta distinta de contratos; una persona puede tener varios legajos legítimos.
- El grupo del último mes cerrado deduplica contratos entre corridas; no suma los conteos mensuales, vacaciones y suplementarias.
- Un estado de contrato inconsistente no se clasifica como una baja normal por el snapshot importado.
- Corte de respaldo y fecha del estado laboral permanecen visibles. El respaldo no acredita altas y bajas posteriores.
- Los indicadores describen todo el padrón certificado, y la búsqueda/filtros sólo acotan la tabla; la interfaz lo explica.
- Fuentes por base/empresa se parametrizan desde la configuración del despliegue previamente comprobada por el gateway. No se toman del navegador.

## Conservación
No se borran ni deshabilitan legajos históricos; siguen disponibles para consulta, analítica, auditoría y documentos retroactivos. No se modifican sueldos, novedades, autorizaciones, firmas o GRH en operación. No se añade una tabla de personas paralela.

## Relación con el trabajo de Noelia
El reporte de escolaridad se orienta a activos con hijos y fechas de certificado, tal como solicita Reunión 09/09/2026. Las salidas por nómina deben seleccionar agentes liquidados del período, no copiar automáticamente el padrón activo completo. Esta entrega no homologa reportes bancarios ni la firma DOC-01.

## Pruebas y publicación
Pruebas unitarias de filtros, contexto certificado, integridad de estado, ausencia vs cero y lectura sin modificaciones; navegador con API sintética (teclado, móvil, errores, historial); consulta agregada de fuente sin retornar personas; build y prueba de recursos productivos. Una prueba sin sesión no es validación de la sesión municipal ni de la recepción de MFA.

## Pendientes independientes
PR #2 (detalle de conceptos y retenciones) conserva su bloqueo de incorporación privada. El colector permanente necesita instalación en infraestructura municipal. No se declara cerrado ninguno de esos trabajos por este cambio de directorio.
