# EXP-PROV-01 · Expediente digital de pago a proveedores

**Jurisdicción:** Municipalidad de Junín, Mendoza, Argentina. **Decisión de producto:** 24/09/2026, por pedido de Marcelo.
**Estado:** APROBADA SU INCORPORACIÓN AL PLAN / DESARROLLO DIFERIDO HASTA LA AUTONOMÍA DE GRH.
**Seguimiento:** [Issue #46 — EXP-PROV-01](https://github.com/inguillen87/municipio-junin-friendly/issues/46).
**Ejecución actual autorizada:** registrar la iniciativa, sus fuentes, dependencias y criterios de cierre. No desarrollar ni activar este módulo ahora.

## 1. Decisión y ubicación en el programa

La necesidad surge del recorrido de pago observado por Marcelo como proveedor: impresión de documentos, armado de carpetas, pases físicos y aprobaciones sucesivas. Se incorpora como línea estratégica futura para eliminar recargas y circulación de papel, no para reproducir cada obstáculo del circuito actual en una pantalla.

Esta aprobación es de alcance y priorización del producto. No es una ordenanza, autorización de gasto, habilitación bancaria, aceptación municipal ni certificación jurídica de la propuesta. No autoriza firmar por terceros, aprobar facturas ni ejecutar pagos.

Se vincula con el programa integral #41, la autonomía salarial #37, Jurídica y expedientes #40, emisión documental #1 y portafirmas criptográfico #42. Extiende S009–S012 de `COMPETITIVE_PRODUCT_ROADMAP.md`; no crea una secuencia competidora ni sustituye esos antecedentes.

**Orden conservado:** completar el núcleo autónomo de MuniControl y los circuitos actuales de Noelia, Hugo, Mariano y superadministración; después activar esta ampliación. No se bloquean las tareas jurídicas o de firma ya comprometidas: esta condición aplica al nuevo circuito de proveedores y a su expansión.

### Condición de arranque G-AUT-01

No pasar a implementación por una fecha de calendario, cantidad de tests o existencia de botones. Registrar el cierre de autonomía conforme al plan vigente: fuente inicial conciliada sin sobrescribir operaciones nativas; altas y cambios propios; relojes habilitados con captura, recepción y recuperación verificadas —PM10 como uno más—; reglas y aprobación de asistencia; novedades, cálculo, revisión y cierre salarial propios; permisos y aceptación de las áreas; continuidad municipal sin depender de la PC del desarrollador.

La operación diaria debe poder continuar sin importar respaldos de GRH. Esto **no elimina los respaldos propios** de MuniControl: se mantienen copias, restauración probada, monitoreo y procedimiento de contingencia. Conservar los históricos necesarios y la posibilidad de auditar el traspaso.

El acta de cierre de G-AUT-01 identificará alcance, evidencia, responsables y pendientes aceptados. Tras ese cierre se agenda el primer sprint de esta iniciativa. Hasta entonces sólo se incorporan observaciones documentales; no se reservan recursos de desarrollo del frente crítico.

## 2. Base aportada y fidelidad de la propuesta

El PDF técnico de tres páginas y las dos transcripciones adjuntas son insumos de planificación, no una especificación homologada ni prueba de integraciones disponibles. Se conserva su organización a continuación. Las precisiones del apartado 5 están separadas expresamente del material original.

### Cinco etapas de la fuente (PDF, página 1)

| Etapa original | Contenido a retomar | Condición que debe resolverse al iniciar |
|---|---|---|
| Marco legal | Ordenanza de expediente electrónico y propuesta de Autoridad de Registro (AR). | Revisar instrumentos realmente aplicables en Junín y modalidad institucional de certificados; no suponer obligatoriedad de constituir una AR propia. |
| Infraestructura | Nube o servidores locales, firma remota e integración HSM/PFX. | Elegir arquitectura y prestador con contrato técnico comprobado; no considerar HSM, PFX y PFDR intercambiables. |
| Simplificación | Eliminar fotocopias, pases manuales y firmas repetitivas. | Relevar el trámite real y acordar pasos imprescindibles con las áreas. |
| Gestión del cambio | Capacitación, acompañamiento y mesa de ayuda. | Piloto con responsables, instrucciones y soporte operativo. |
| Ventanilla única | Portal para carga de facturas y seguimiento. | Primero cerrar el circuito interno; después habilitar el acceso externo autorizado. |

Las cifras del PDF «30 días a menos de 48 horas» y «100 % de adopción» se conservan como aspiraciones de la fuente, **sin línea de base municipal validada ni compromiso de resultado**. No se publicarán como ahorros obtenidos.

### Circuito propuesto (PDF, página 1)

1. **Alta y caratulación — Mesa de Entradas / Compras:** identificar expediente e interesado y relacionar la orden de compra aprobada que corresponda. La fuente supone que la OC ya existe; eso deberá verificarse o incluirse como dependencia.
2. **Presentación de factura — proveedor o ingreso interno autorizado:** incorporar original, metadatos y evidencia de constatación fiscal; evitar recarga y duplicidad.
3. **Conformidad de recepción — Depósito / área solicitante:** certificar el bien o servicio efectivamente recibido y vincular remito o acta, con firmante facultado.
4. **Liquidación y retenciones — Contaduría:** cotejar OC, factura y conformidad; revisar imputación, reglas aplicables y orden de pago.
5. **Pago y archivo — Tesorería:** ejecución autorizada mediante el canal bancario habilitado, evidencia del resultado y cierre conforme al procedimiento municipal.

Estados base conservados de la página 2: `CARATULADO → CON_FACTURA → CONFORME → LIQUIDADO → PAGADO → ARCHIVADO`. No son una máquina lista para producción. Se especificarán observación, devolución, subsanación, rechazo, anulación, suspensión y resultados de pago pendientes o parciales, preservando el historial.

## 3. Modelo lógico y servicios futuros

Conservar como entidades candidatas las cinco solicitadas: `expedientes`, `documentos_folios`, `firmas_digitales`, `proveedores_legajo` y `pases_audit`. Antes del SQL, cotejarlas con expedientes y documentos existentes para no crear otro sistema paralelo. PostgreSQL y la arquitectura modular actual son el punto de partida del proyecto; las alternativas de lenguaje del prompt no ordenan una reescritura.

Cada referencia deberá incluir municipio/ámbito, identificadores canónicos, versión y responsables autorizados. El modelo futuro añadirá relaciones y registros necesarios para OC, conformidades, factura, evidencia fiscal, cuenta bancaria versionada, orden de pago, intentos y conciliación. No mezclar el legajo del proveedor con el laboral ni reutilizar capacidades de nómina como autorización para Tesorería.

Servicios REST a especificar, todavía sin rutas ni código: ingreso y validación de archivos; caratulación y folios; pases y transiciones; preparación de documento autorizable; solicitud de firma al adaptador de #42; recepción y validación del firmado; consulta del estado y trazabilidad. Los contratos documentarán permisos, versión esperada, idempotencia, errores y recuperación antes de habilitar comandos.

## 4. Controles de ingeniería propuestos para la futura especificación

Estos criterios amplían la propuesta como diseño a validar; no describen funciones ya implementadas.

- **Documentos:** conservar el original, su huella y cada revisión. Folio secuencial por expediente bajo control transaccional; dos cargas simultáneas no comparten número. Rectificaciones mediante actuaciones relacionadas, sin borrar ni renumerar el pasado. Separar almacenamiento privado, permisos de aplicación y auditoría; un booleano de bloqueo no cubre todos los accesos privilegiados.
- **Factura y conformidad:** identidad fiscal y duplicados por emisor, tipo, punto de venta y número, además del hash del archivo. Una recodificación del PDF no convierte la misma factura en otra obligación. Devoluciones, notas de crédito, recepciones parciales y diferencias requieren reglas explícitas, no igualdad literal de tres documentos.
- **Cuenta bancaria:** alta y sustitución de CBU mediante proceso independiente, evidencia de titularidad y revisión según facultades. Congelar la versión utilizada por la orden de pago; no editarla libremente al ejecutar. Notificar cambios y conservar la cuenta anterior en auditoría con acceso restringido.
- **Decisiones y dinero:** separación entre preparar, conformar, liquidar, aprobar y ejecutar. La cuenta técnica o superadministradora no hereda la firma ni la facultad contable de otro usuario. No usar el expediente personal de un participante del proyecto como prueba con efectos administrativos.
- **Procesamiento:** consultas parametrizadas, validación de tamaño/formato y análisis de archivos aislado; credenciales fuera del repositorio; eventos persistentes para pases y notificaciones, reintentos con la misma identidad y correlación. No transmitir documentos reservados a validadores públicos o IA por defecto.
- **Pago:** autorización documental, envío bancario, aceptación, acreditación y conciliación son hechos diferentes. Una captura o un callback aislado no basta para marcar `PAGADO`. Precisar la evidencia bancaria exigida y el tratamiento de rechazo, transferencia parcial, reversión y respuesta perdida antes de automatizar.

## 5. Precisiones de validación: no adoptar literalmente las simplificaciones de la fuente

**Firma y portafirmas.** Reutilizar #42 y DOC-01F; no construir otro firmador para proveedores. La Ley 25.506 distingue firma electrónica y digital y condiciona la validez de esta última a requisitos verificables. Un hash, un OTP de acceso o una imagen de firma no bastan por sí solos. La fuente oficial de PFDR confirma la firma remota de PDF, pero esta revisión no acredita una API ni credenciales concedidas a MuniControl. Contrato, modalidad y acceso institucional quedan por obtener [R1, R2].

**Hash de archivo y PAdES.** La receta del PDF, página 2, resume «SHA256(PDF_bytes) → firmar → inyectar CMS». No se adopta como algoritmo final: hay que distinguir la huella del original de los datos preparados para la firma, validar `/ByteRange` y `/Contents`, y conservar la relación entre revisiones. El PDF firmado tendrá su propia huella. Elegir biblioteca y política, validar certificado y cadena de confianza aplicable, revocación y múltiples firmas; no implementar la criptografía a mano [R3].

**Fecha y conservación.** Un campo `timestamp` de base de datos no constituye automáticamente la estampa de tiempo confiable que promete el PDF. Documentar por separado fecha operativa, fecha declarada por el firmante y evidencia temporal verificada. El nivel PAdES y la conservación a largo plazo se elegirán bajo política y evidencia, no por usar las etiquetas BES o LTV [R3].

**AFIP / ARCA.** Se conserva «AFIP» como terminología del material aportado. La documentación oficial consultada del servicio WSCDC utiliza ARCA y describe `ComprobanteConstatar`, constatación del comprobante y su autorización. No sustituir esa verificación por una constancia de inscripción del proveedor, ni afirmar que la consulta acredita por sí sola ausencia de notas de crédito, corrección contable, recepción o derecho al pago. La integración y sus excepciones se homologarán al activar la fase [R4].

**Marco de Junín.** No se asume que una norma provincial haga automáticamente obligatorio o válido este circuito municipal. Revisar procedimiento administrativo, competencias, instrumento municipal habilitante, archivo, reserva, rendición y reglas de contratación/retención con las áreas competentes. Este documento no fija alícuotas, plazos legales ni una ordenanza inexistente.

**«DGE» en el pedido.** Se conserva la mención sin adjudicarle otro dominio: el material adjunto desarrolla GDE, Gestión Documental Electrónica; DGE también identifica a la Dirección General de Escuelas de Mendoza. No se incorpora automáticamente un módulo educativo. La eventual interoperabilidad con GDE y cualquier alcance educativo son decisiones distintas por delimitar después [R5, R6].

## 6. Sprints futuros, todos diferidos

No se asignan fechas ni porcentajes de avance. Cada fase requiere su aceptación antes de activar la siguiente; la implementación sólo comienza después de G-AUT-01.

| Fase | Entrega futura | Evidencia mínima de cierre |
|---|---|---|
| EXP-0 · Relevamiento y simplificación | Mapa real de Compras, área receptora, Contaduría y Tesorería; excepciones, normativa y matriz de responsables. | Recorrido revisado por las áreas, pasos eliminados justificados, línea de base medida y dependencias de OC, firma y banco identificadas. |
| EXP-1 · Núcleo documental común | Carátula, documentos/folios, versiones, pases y bandejas reutilizando los módulos existentes. | Aislamiento entre municipios, recuperación del original, auditoría y concurrencia; rectificar conserva el antecedente; restauración comprobada en entorno aislado. |
| EXP-2 · Proveedor y factura | Legajo fiscal, cuenta bancaria versionada, ingreso interno de factura y constatación. | Factura duplicada rechazada, cambio de cuenta bajo revisión, servicio fiscal caído como pendiente y no como validado; evidencia de homologación del adaptador. |
| EXP-3 · Conformidad y orden de pago | Flujo de recepción, cotejo e imputación; integración al portafirmas común. | Roles reales autorizados, devoluciones, pagos parciales y retenciones bajo reglas vigentes; el firmante revisa la versión exacta y se valida cada firma exigida. |
| EXP-4 · Tesorería y piloto interno | Instrucción de pago autorizada, respuesta y conciliación bancaria, cierre y archivo. | Respuesta perdida sin doble pago, rechazo/reversión controlados, trazabilidad completa y piloto aceptado. Ninguna transferencia real usada como prueba técnica. |
| EXP-5 · Portal de proveedores | Presentación externa, subsanaciones, seguimiento y notificaciones. | Identidad/representación verificadas, acceso sólo a expedientes propios, sin acceso a notas reservadas de otras áreas; prueba de soporte y accesibilidad. |
| EXP-6 · Expansión municipal | Expedientes internos adicionales, trámites externos y portal ciudadano con tasas/impuestos y constancias. | Cada trámite y tributo tiene autoridad, reglas, fuente de deuda, pago/conciliación y aceptación propios. Integración GDE sólo con contrato y autorización comprobados. |

El orden distingue un ingreso interno de factura en EXP-2 de la presentación autónoma externa de EXP-5, para no exigir un portal completo antes del piloto interno. Mantiene el objetivo de ventanilla única de los adjuntos sin presentarla como dependencia ya resuelta.

## 7. UX, indicadores y valor del programa

Propuesta: bandejas por tarea —Mis pendientes, Para conformar, Para revisar, Para firmar, Para pagar, Devueltos y Finalizados— con responsables, antigüedad, plazos cuando existan y siguiente acción. Una ficha del expediente debe permitir leer documentos, observar, devolver, firmar o derivar según competencia sin descargar, imprimir y volver a cargar cada archivo.

Conservar búsqueda, filtros, posición y versión al volver de un detalle. Separar cargando, vacío, sin permiso, servicio externo pendiente y error. Filtros y métricas deben corresponder al mismo universo; archivos completos no limitados a la página visible. Usar móvil y teclado, advertencias de cambios sin confirmar y recuperación del intento sin duplicación. No agregar accesos aparentes a funciones no implementadas.

Medir la duración total y por área, tiempo de trabajo frente a tiempo en cola, devoluciones por causa, solicitudes vencidas, duplicados evitados, fallos de validación, documentos con todas las firmas exigidas y proporción del circuito completada sin papel. Comparar contra la línea de base relevada; no atribuir demora de disponibilidad financiera a un problema de pantalla ni prometer acreditación en 48 horas.

Para otros municipios o empresas, reutilizar documentos, flujo, auditoría y adaptadores, manteniendo separados datos, responsables, costos y reglas. Proveedores representa egresos; el futuro cobro de tasas/impuestos representa ingresos y exige otra conciliación. No mezclar ambas operaciones por compartir el portal.

## 8. Fuentes y trazabilidad

Los originales permanecen en los adjuntos de la conversación; no se publican sus bytes ni se incorpora información nominal o bancaria en Git. Huellas calculadas sobre los archivos recibidos, sin alterarlos:

| Archivo aportado | Identificación y contenido |
|---|---|
| `Plan Tecnico Expediente Digital Municontrol Junin.pdf` | 3 páginas; 309.631 bytes; SHA-256 `48b8d3440596d57936a2accb1ac07b09bf64869d61d1e54391e6c65387e6fdbc`. Página 1: etapas y circuito; página 2: entidades, firma y controles; página 3: prompt de ingeniería. |
| `Pasted markdown.md` | 19.657 bytes; SHA-256 `e0f6d069fe325acfaa83814a17bb3f27986f214cf4b5e084944a1db7bf074ffa`. Conversación de origen, flujo de proveedores y referencias. |
| `Pasted text (2).txt` | 12.763 bytes; SHA-256 `e1a83f2d81fbe40b50dd5c62e2a6a07a2f4b2a6c55e80a4fb9e60f77074517ec`. Transcripción complementaria; no aporta contratos reales de API. |

Las afirmaciones de las respuestas IA incluidas en esas transcripciones no se tratan como validaciones independientes. No se usan los documentos nominales de estructura de cargos ni los ejemplos de recibos como fuentes de obligaciones a proveedores.

### Referencias externas preliminares consultadas el 24/09/2026

Se agregan sólo para identificar precisiones y comprobaciones futuras. No son una homologación jurídica, fiscal o bancaria de Junín; deberán revalidarse cuando se active el módulo.

- **R1.** Ley 25.506, texto actualizado, distinción y requisitos de firma: https://www.argentina.gob.ar/normativa/nacional/ley-25506-70749/actualizacion
- **R2.** Plataforma de Firma Digital Remota, descripción oficial: https://www.argentina.gob.ar/node/139690 . No se obtuvieron credenciales ni contrato de integración.
- **R3.** Comisión Europea, documentación técnica DSS, PAdES, validación y evidencia temporal: https://ec.europa.eu/digital-building-blocks/DSS/webapp-demo/doc/dss-documentation.html . Referencia técnica, no certificación de cumplimiento de la ley argentina ni selección de biblioteca para MuniControl.
- **R4.** ARCA, manual oficial WSCDC, apartados 1.2 y 2.2: https://www.afip.gob.ar/ws/WSCDCV1/WSCDC_manual_desarrollador_v.2.pdf . Documenta constatación y autenticación; no acredita la disponibilidad contractual de todos los controles contables previstos.
- **R5.** GDE, descripción oficial y módulos: https://www.argentina.gob.ar/jefatura/innovacion-ciencia-y-tecnologia/innovacion/gde-sistema-de-gestion-documental-electronica
- **R6.** DGE de Mendoza, denominación oficial: https://www.mendoza.edu.ar/contactos/direccion-general-de-escuelas-dge-2/

## 9. Instrucción de continuidad para Codex u otro equipo

Leer primero este documento, el plan integral vigente y #37/#40/#41/#42. El bloque «SYSTEM PROMPT / INSTRUCCIONES DE INGENIERÍA» aportado se conserva como **brief de desarrollo futuro**, no como orden de implementar en el sprint actual. Al activarse un módulo específico, mantener español técnico, arquitectura existente, fuentes oficiales y código probado; no generar un SQL o una API supuestamente productivos a partir del boceto sin resolver sus contratos y requisitos.

**Registro de este turno:** planificación documental únicamente. No se agregan pantallas, rutas API, tablas, migraciones, roles, certificados, servicios, infraestructura ni integraciones; no se firman archivos ni se ejecutan pagos. No se modifica el estado de autonomía de GRH. La iniciativa queda vinculada al plan, aprobada en su inclusión y diferida en su ejecución.
