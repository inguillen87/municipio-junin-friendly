# Transferencias varias desde recibos propios

Este adaptador prepara el diseño observado de 167 posiciones a partir de una emisión propia aprobada y vigente, sus cierres originales completos y las cuentas propias aprobadas. No consulta GRH ni usa cuentas históricas como motor. En el panel de Salida bancaria, la opción **Transferencias varias · revisión TXT de 167 posiciones** permite revisar y descargar TXT, Excel y CSV con el mismo circuito de autoridad y revalidación de fuentes.

La descarga se identifica como **revisión**. El diseño fue contrastado localmente campo por campo; falta acreditar el servicio receptor y su admisión. No se habilita el generador bancario oficial anterior, no se completa el significado del «tipo 1», no hay transmisión y no se ejecutan pagos.

## Conjunto y datos conservados

Se incluyen todos los recibos de la emisión cuya cuenta vigente tiene el canal `credicoop_transfers` declarado y aprobado. El banco del CBU y el rótulo de la cuenta no eligen ese canal. Una cuenta faltante o un canal sin declarar en cualquier fila impiden asegurar la selección completa. Los otros canales se conservan en Excel/CSV con su motivo; no se eliminan del control.

La emisión conserva sus rangos de legajo, repartición y tipos de liquidación. La preparación no agrega un filtro oculto por jurisdicción: el formato observado es no segmentado. Búsqueda y páginas sólo cambian la presentación de filas. Se conserva cada recibo, incluidos dos destinos iguales; los CBU repetidos requieren una decisión expresa y nunca se suman ni deduplican los importes.

| Posiciones | Fuente y representación |
|---|---|
| 1–22 | CBU de la cuenta propia aprobada y vigente. |
| 23–32 | Neto original del recibo expresado exactamente en centavos, diez dígitos. Sin redondeo ni conversión de moneda. |
| 33–54 | CUIL conservado del recibo: once dígitos y once espacios. |
| 55–94 | Nombre original exacto en Windows-1252 imprimible y espacios hasta 40 bytes. Los nombres largos o no representables se observan; no se recortan, transliteran ni abrevian. |
| 95–104 | Legajo propio numérico, conservando sus dígitos y completando sólo el ancho observado con ceros iniciales. Nunca se sustituye por DNI o UUID. |
| 105–164 | `HABERES mes-año`, con mes de 1 a 12 sin cero inicial, y espacios finales. El período proviene de la misma emisión. |
| 165–167 | Literal `VAR`. |

Todas las filas terminan en CRLF, incluida la última. No hay BOM. El archivo se vuelve a leer con el validador independiente existente de los siete campos; cantidad, período y suma de centavos deben coincidir con todos los recibos seleccionados antes de devolver los bytes.

El TXT no codifica moneda ni fecha de acreditación. Ambas son declaraciones de preparación para comprobar la moneda y vigencia de cada cuenta; una fecha de pago conservada debe coincidir. No se inferirán convenciones bancarias por ese motivo. Neto nulo, cero, negativo, fracción menor que un centavo o exceso de diez posiciones bloquean la salida completa. El límite de 10.000 registros es global, sin división automática.

## API del adaptador

- `prepareTransfersVarOutput(batch, accounts, profile, closes)`: comprueba los modelos canónicos de recibos, cuentas y todos los cierres; devuelve revisión inmutable con procedencia y huella.
- `createTransfersVarReviewTxt(review)`: devuelve una promesa con bytes completos y controles reconciliados. La salida declara `officialGenerationAllowed:false`, `officialSubmissionAllowed:false`, `bankSubmitted:false` y `paymentExecuted:false`.
- `createTransfersVarCsv(review)` y `createTransfersVarXlsx(review)`: conservan la emisión completa, selección expresa y observaciones. Son archivos privados de nómina; el CSV neutraliza fórmulas y el Excel mantiene valores literales.
- `transfersVarPage` y `sameTransfersVarOutput`: paginación sólo visual y comparación exacta de revisión, perfil y todas las fuentes conservadas.

El panel conserva la revalidación existente de acceso, emisión, cierres y cuentas antes y después de generar cada descarga; ocultar la página o cambiar de tarea/permisos retira los datos. Si cambia la cuenta autenticada, la aprobación bancaria o una fuente mientras se crean los bytes, el archivo se descarta y los buffers se limpian. La descarga requiere un gesto y confirmación expresos. Este adaptador puro no afirma haber hecho una consulta nueva de sesión por sí solo.

## Evidencia y pendientes

Contrato local: `docs/TRANSFERENCIAS_VAR_CONTROL_20261009.md`, `docs/NOELIA_CANAL_ACREDITACION_20261010.md`, `docs/NOELIA_REPORT_REQUIREMENTS_20260903.md` y el validador `assets/payroll-transfers-var-review.js`. Los originales nominales, audios, respaldos y archivos municipales no se incorporan a Git ni a las pruebas.

Los ensayos usan sólo fixtures sintéticos. Incluyen 855 recibos propios cerrados con 570 destinados al canal explícito, revisión completa de ambas páginas y de la fila final, límite de nombre por byte, importes exactos, cuenta/canal ausentes, destinos repetidos, identidad/cierre/aprobación cambiados, reintentos deterministas y exportaciones literales.

Santander sigue sin generador propio: un rótulo compartido `GT_PAGOS` no demuestra que su servicio use el convenio BNA. La plantilla documental muestra otra estructura con pagos/beneficiarios/liquidaciones/retenciones; no se inventan campos o posiciones. Faltan su especificación admitida y una muestra de conformidad del servicio exacto.

La prueba del panel usa Chrome con respuestas GET sintéticas etiquetadas. Comprueba las tres descargas reales desde los módulos y CSS candidatos, sus alcances completos pese a búsqueda/páginas, y la cancelación por cuenta, permisos, fuente, visibilidad y respuesta tardía. Incluye controles móviles a 320/390 y escritorio a 1280 píxeles. El panel anterior falla en el control causal porque carece de esa opción; la lista de copias del shell incluye explícitamente el módulo nuevo.

No se ejecutó SQL, no se modificó una base, no se publicó este incremento y no existe aceptación municipal ni bancaria. La prueba de navegador no usa handlers reales ni una sesión municipal. Los siguientes pasos verificables son ejecutar la integración de autoridad/SQL con la fuente final admitida y publicar el mismo commit, además de homologar el receptor antes de tratar la salida como archivo bancario admitido.
