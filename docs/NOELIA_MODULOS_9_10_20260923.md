# Noelia: módulos 9 y 10 — recibos y estructura presupuestaria de cargos

Relevamiento del 23/09/2026 sobre la base `7285166dea8400e755982a720b2056d7f3fa87b6` y la implementación candidata 104. Amplía el [plan integral](PROYECTO_INTEGRAL_JUNIN_20260919.md) y la [matriz de Noelia](MATRIZ_ACEPTACION_NOELIA.md); no declara completo ninguno de los dos módulos. Se revisaron archivos y código local, sin consultar bases, importar datos, emitir documentos ni modificar GRH. El estado de producción citado proviene del [estado integral existente](ESTADO_INTEGRAL_NOELIA_HUGO_MARIANO_20260921.md), no de una nueva comprobación remota.

## Fuentes y límites de lectura

| Referencia | Archivo entregado | Páginas / bytes | SHA-256 |
| --- | --- | --- | --- |
| M9 | `9º MODULO RECIBOS DE HABERES.pdf` | 1 / 613957 | `329cc8f9ad59c0e16c9c5d73a686b4551a92f49903c4b46a876936e98c0b8249` |
| M10 | `10º MODULO ESTRUCTURA PRESUPUESTARIA DE CARGOS.pdf` | 2 / 472864 | `425ec77eb4430ca445c6cfe962177758d3ce9b92acd5db2d693cc1bfd644626d` |
| E10 | `ESTRUCTURA PRESUPUESTARIA DE CARGOS AL 23.09.2026.pdf` | 51 / 146439 | `b6cff5ce5986b7436b80c2323c50636560d40a9f4444e831afc59d1e2fad25dd` |

Se extrajo el texto de todas las páginas. Se revisaron visualmente M9 completo, M10 completo y E10 páginas 1, 2, 25, 49, 50 y 51, incluyendo cabeceras, grupos y continuaciones. No se certificó fila por fila la nómina de 51 páginas. Originales, texto nominal e imágenes quedan en custodia local privada, fuera de Git. Este documento sólo conserva requisitos, estructura y referencias.

E10 indica impresión el **23/09/2026 a las 12:20 PM**. Es fecha del informe; no demuestra que las liquidaciones o el padrón importados en MuniControl tengan ese corte. El estado integral conserva fuente S11 del **10/09/2026 a las 15:17:30, sin zona declarada**, agosto como último mes cerrado y septiembre abierto. El detalle de haberes puede tener una procedencia distinta al resumen: se debe mostrar la suya, sin atribuirle automáticamente el corte S11.

## 9. Recibos de haberes

M9 p. 1 enumera ocho pedidos. La captura agrega controles de GRH que se distinguen de esos pedidos explícitos.

| ID | Pedido / página | Base comprobada en código | Brecha para completar el pedido |
| --- | --- | --- | --- |
| M9-01 | Desde/hasta legajo — M9 p. 1 | Ficha individual por UUID y biblioteca de liquidaciones por contrato | Selección de rango, población completa y vista previa del lote; no limitar una exportación a la página visible ni resolver una identidad sólo por número de legajo |
| M9-02 | Desde/hasta repartición — M9 p. 1 | El snapshot de liquidación conserva repartición de origen; existen consultas por corrida | Filtro histórico documentado, con el código de repartición de esa liquidación. No usar la repartición actual, incluida una rectificación 104, para reinterpretar el pasado |
| M9-03 | Período de consulta — M9 p. 1 | Biblioteca con año/mes/tipo y detalle por fecha, período y tipo | Integrar estos criterios en consulta de recibos; distinguir período de origen, fecha de liquidación y versiones de una misma corrida |
| M9-04 | Fecha de acreditación o pago — M9 p. 1 | Los documentos actuales muestran fecha de liquidación y dicen que no certifican pago | Incorporar sólo un dato de pago/acreditación respaldado o una declaración administrativa identificada. No copiar fecha de liquidación ni fecha de descarga como pago real |
| M9-05 | Tipos de liquidación — M9 p. 1 | Biblioteca con F/M/O/P/S/V; informes del módulo 8 rotulan Mes, SAC y otros tipos documentados, conservando códigos desconocidos | Mantener el mismo criterio en selección, vista previa y PDF; «Todos» es alcance de consulta, no una liquidación adicional |
| M9-06 | PDF — M9 p. 1 | PDF y Excel del detalle, decimales exactos, conceptos y procedencia; reautorización antes de descargar | El archivo actual es **informativo y sin firma**. Falta plantilla de recibo autorizada y emisión congelada/recuperable; este manual no aporta un ejemplar final de recibo que homologue esa plantilla |
| M9-07 | Firma digital — M9 p. 1 | [DOC-01](FEATURE_FIRMA_EMISION_DOCUMENTAL_20260910.md) especifica emisión, custodia y fases; diferencia firma gráfica de integración criptográfica posterior | Implementación y aceptación del circuito de firma correspondiente. Una imagen, un hash o un QR no completan este pedido; la aprobación prevista para el 22/09 no equivale a aprobación recibida |
| M9-08 | Cómo descarga cada agente — M9 p. 1 | Biblioteca interna con permisos `workforce.employee.read` y `payroll.read` | Autoservicio con vínculo servidor cuenta→persona→contrato y acceso exclusivo a documentos propios emitidos. La biblioteca administrativa actual no es ese portal |

**Controles adicionales observados, no decisiones nuevas asumidas:** desde/hasta convenio, fecha de liquidación, mes/año, fecha de pago, leyenda opcional, fecha/período del último depósito, observación, número del último ingreso y emisión por legajo. La captura ofrece Liquidación final, Mes, Otros conceptos, Primera quincena, SAC y Vacaciones. Antes de reproducir campos financieros adicionales se debe identificar su fuente y propósito; no rellenarlos con valores supuestos.

### Evidencia de implementación reutilizable

- [Biblioteca y filtros](../assets/payroll-document-library.js), [contrato](../assets/payroll-document-library-model.js), [adaptador API](../lib/internal-payroll-documents.js) y [fachada 051](../scripts/migrations/051-payroll-document-library.sql): `employeepayrolldocuments`, por UUID. Máximo 1.000 períodos recientes con indicación de truncamiento; los filtros de esa pantalla no cubren automáticamente el archivo completo. El contrato exige `officialReceipt:false` y `signatureApplied:false`.
- [Detalle autorizado](../lib/internal-payroll-detail.js), [panel](../assets/payroll-detail-panel.js) y [exportador](../assets/payroll-detail-export.js): `employeepayrolldetail`, conceptos conservados, comparación de fuentes y huellas al descargar. El PDF dice que no acredita pago, emisión oficial ni firma digital.
- [Ficha de Personas](../internal-dashboard.html): biblioteca e historial dentro del legajo. No se encontró en este checkout una pantalla autónoma `recibos-sueldo.html`; las referencias antiguas a esa ruta no deben usarse para afirmar una función actual.
- [Entrega privada de fuente](../api/payroll-source-delivery.js) y migraciones 049/050 transportan insumos autorizados de haberes; no entregan recibos oficiales a empleados. «Signed source location» no significa documento firmado por una autoridad municipal.
- Las fachadas de biblioteca/detalle existentes se apoyan en contratos y fuentes GRH. Alta nativa, novedades nativas `export_only` y revisión administrativa no generan por sí mismas una liquidación ni un recibo para contratos propios.

### Circuito de uso propuesto

**Personal/Nómina:** elegir período y tipo → acotar legajos/reparticiones → ver cantidad, fuentes, faltantes y estado de cierre → revisar documentos → descargar control o, cuando exista autoridad y emisión implementadas, emitir la versión autorizada → recuperar el mismo archivo e historial. La acción de emitir debe estar separada de consultar y descargar.

**Agente:** entrar con su cuenta → consultar sus documentos emitidos por período/tipo → descargar el original autorizado. El servidor deriva el alcance; no se pide al empleado que escriba otro legajo para obtener su recibo. Las sustituciones conservan el original y la relación con su nueva versión.

## 10. Estructura presupuestaria de cargos

M10 p. 1 pide el reporte para controlar cargos liquidados contra los presupuestados de cada año, con el mismo detalle y salida PDF. M10 p. 2 muestra opciones de presentación; E10 permite precisar el formato, pero no define por sí solo un algoritmo de conciliación.

| ID | Requisito / página | Base existente | Brecha concreta |
| --- | --- | --- | --- |
| M10-01 | Control presupuestados/liquidados por ejercicio — M10 p. 1 | Hay datos históricos de asignación presupuestaria en `payroll_snapshot_assignment` y cantidades agregadas de la ordenanza 2026 | No se encontró un circuito completo de presupuesto anual de cargos, modificaciones, asignaciones y comparación contra una corrida exacta |
| M10-02 | Misma información y PDF — M10 p. 1; E10 pp. 1, 49–50 | La ficha expone estructura/detalle presupuestarios de la asignación observada | Falta reporte específico con Id, JUR, REG, AGR, TRAM, SUBT, CARGO, Denominación, Cant, Clas, Estado, Vacante y detalle LEGAJO/NOMBRE autorizado |
| M10-03 | Simple o Detallada — M10 p. 2 | No se encontró selector equivalente para este dominio | Vista simple por renglón presupuestario y detallada con las personas vinculadas, sin alterar el alcance ni los totales al expandir |
| M10-04 | Legajos activos Sí/No/Todos — M10 p. 2 | Estado laboral y snapshots consultables | Definir activo **a qué fecha y fuente**; conservar No y Todos. No equiparar activo, liquidado, plaza ocupada y vínculo vigente |
| M10-05 | Orden por número de legajo o alfabético — M10 p. 2 | Hay ordenamientos y exportadores reutilizables | Aplicar el orden al conjunto completo y al PDF; orden numérico natural, no `1,10,2`; conservar grupos y continuaciones |

### Lo que el adjunto sí demuestra y lo que no

- E10 agrupa personas bajo renglones presupuestarios. Hay continuaciones entre páginas: pp. 2, 25 y 51 muestran personas cuyo encabezado de grupo comenzó antes. Un extractor no puede crear cargos nuevos por salto de página ni perder esa asociación.
- E10 pp. 49–50 contiene filas con `Cant=0` junto a `Estado=Ocupado` y `Vacante=Titular`. No corresponde traducir cero como vacante ni ese texto como cantidad ocupada. `Clas` se conserva como código/texto, sin tratarlo automáticamente como un importe.
- Aparecen denominaciones de horas cátedra. Se debe documentar la unidad de cada renglón: cargo, persona, contrato u horas. No sumar unidades distintas ni deducir disponibilidad con una resta no validada.
- El formato observado no presenta dos columnas separadas «Presupuestados» y «Liquidados» con una diferencia calculada. Para demostrar el control solicitado hace falta identificar qué significa `Cant`, la versión anual aprobada y sus modificaciones, y el vínculo verificable de cada liquidación con cada renglón.
- Los códigos JUR/REG/AGR/TRAM/SUBT/CARGO son una clasificación propia del reporte. No equiparar automáticamente JUR con 42/55 del alta nativa, AGR con convenio, ni CARGO con un cargo escrito en texto. La nomenclatura necesita su correspondencia documentada.

### Fuentes del código que conviene reutilizar

[Extracción GRH](../scripts/extract_grh_core.py) conserva desde `histolegajo` los campos `ESTRUCTURAPRESU`, `PRESUDETALLE`, `CARGO`, convenio y repartición. [Importación canónica](../scripts/import-grh-core-canonical.mjs) los lleva al snapshot de una liquidación concreta; [esquema 002](../scripts/migrations/002-canonical-integration.sql) y [API de ficha](../api/internal-data.js) preservan `budget_structure`/`budget_detail` y sus coordenadas. Son insumos; no constituyen todavía el catálogo anual completo ni prueban la relación con los identificadores E10. El snapshot importado actual tampoco cubre automáticamente todas las corridas históricas.

[Presupuesto 2026](../assets/junin-budget-2026.js) ya conserva la planta agregada del artículo 7 de la Ordenanza 1.021/2025, distingue unidades y declara `additive:false`. Su fuente de nueve páginas no incluye las planillas anexas: `annexSheetsPresent:false`. No hay que duplicar ese trabajo ni presentar sus cantidades agregadas como el detalle anual aprobado de E10.

### Relación con 103 y 104

El [catálogo 103](NOELIA_NATIVE_EMPLOYMENT_CATALOG_103.md) contiene convenios, categorías, sectores y reparticiones. La [rectificación 104](NOELIA_NATIVE_EMPLOYMENT_CHANGES_104.md) cambia, tras revisión independiente, esos cuatro códigos y el texto del cargo del contrato **nativo actual**. Conserva identidad, jurisdicción, fechas, registro original y nómina histórica.

**No se detecta contradicción de alcance:** 104 no crea plazas presupuestarias, reserva cupos, cambia un presupuesto ni asigna importes. Tampoco satisface M10. La interfaz futura debe separar «Encuadre del legajo» de «Asignación a un cargo presupuestario». Una aprobación 104 no debe interpretarse como disponibilidad presupuestaria, autorización de gasto o actualización de liquidaciones pasadas. El vínculo presupuestario futuro tendrá su propia identidad, vigencia, evidencia y revisión; no se construye comparando nombres.

## Próximos incrementos seguros

1. **Consulta completa de recibos de control, reutilizando el detalle existente.** Incorporar selección explícita de período/tipo y rangos con población verificable, previsualización y PDF del conjunto revisado. Mantener el estado informativo mientras falte emisión autorizada. La etapa por repartición requiere su dimensión histórica exacta; los datos ausentes deben aparecer como excepciones. No extender filtros locales de 1.000 elementos haciéndolos pasar por búsqueda completa. Reutilizar los adaptadores de biblioteca/detalle y sumar paginación/versión de consulta en servidor donde haga falta.
2. **Fuente versionada de estructura de cargos y consulta Simple/Detallada.** Conservar E10 como referencia privada y preparar un extractor de revisión, sin importación automática. Confirmar cabeceras, unidades, identidad de renglones, fuente anual e instrumento antes de publicar una proyección. Luego construir el reporte de cargos con filtros/orden/PDF y vínculos explícitos; dejar «comparación no disponible» hasta tener ambas poblaciones conciliables. Una nueva migración, si se necesita, será aditiva y no cambiará el snapshot ni el contrato de alta 067/095/104.
3. **Emisión y acceso individual bajo DOC-01.** Reutilizar sus fases, no crear un segundo sistema de firma. Falta evidencia de facultades y aprobación efectiva, plantilla, custodia verificada, vínculo de cuenta con empleado y definición de firma requerida por M9. Puede desarrollarse y probarse con identidades sintéticas; la activación y aceptación reales requieren esos hechos. El emisor conservará bytes/huella, reintentos idempotentes y sustituciones trazables; no marcará pago por emitir un documento.

La prioridad de M10 fue expresada por Noelia. Antes de programar su conciliación debe cerrarse una revisión breve con ejemplos del propio adjunto: significado/unidad de `Cant`, `Clas`, `Estado` y `Vacante`; fuente anual y modificaciones; identificación de la corrida a contrastar y criterio de activo. No se necesita volver a pedir estos tres PDF: ya están recibidos y verificados.

## Pruebas y aceptación pendientes

- **Recibos:** misma identidad/tenant/contrato; otro legajo con número coincidente; empleado sin vínculo; revocación durante vista previa/descarga; rango y paginación completos; dos corridas del mismo mes; tipo desconocido; fuente desactualizada; faltantes sin convertirlos a cero; PDF y Excel con el mismo conjunto. Separar aprobación, cierre, firma, emisión, descarga y pago.
- **Cargos:** grupo continuado entre páginas, ceros y nulos distintos, códigos con ceros iniciales, clases textuales, unidades heterogéneas, asignaciones repetidas y ambiguas, contrato nativo sin referencia GRH, distintas versiones presupuestarias y cambios de encuadre posteriores a una liquidación. Nada de correspondencias por parecido de nombre.
- **Interfaz:** escritorio 1440 y móviles 390/320, Simple/Detallada, Sí/No/Todos, orden natural, filtros y fuente visibles en cada archivo, errores que retiren resultados obsoletos, ausencia de fugas nominales en reportes públicos o logs.
- **Release:** CI y PostgreSQL 17/18 cuando haya migración; preservación de datos/ACL; commit y recursos publicados exactos. Las pruebas sintéticas no equivalen a un recibo municipal firmado, una descarga real del agente ni aprobación humana del control presupuestario.

Este relevamiento no crea importaciones, plazas, asignaciones, reglas salariales, firmas, pagos ni permisos. Los dos módulos quedan incorporados como requisitos trazables y trabajo pendiente, con sus bases existentes identificadas.
