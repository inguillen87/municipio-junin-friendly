# Módulo 10 · fuente histórica exacta verificada

## Estado de entrega
Preparación local reproducible; NO integración del cargo histórico en el endpoint ni en la pantalla. Base revisada: `b486f40156e90d583708edfcc23461b37df53e11`. Se conserva el trabajo de recibos del módulo 9 en su worktree, sin integrar ni modificar sus archivos.

## Hallazgo confirmado
El catálogo documental deriva del respaldo `grh_junin.backup_2026081915_plataforma.sql.gz` del 19/08, mientras los snapshots canónicos de agosto consultados se asocian al lote del 06/08. Compartir fecha, empresa, legajo o cantidad no autoriza a combinar ambos respaldos.

La tabla `histolegajo` del MISMO respaldo del catálogo sí conserva `CARGO`, `ESTRUCTURAPRESU` y `PRESUDETALLE`. La extracción actual identificó 854 registros para empresa 101, fecha 2026-08-31, período 2026, mes 8, tipo M. De ellos, 801 informan los tres campos y 53 no los informan completos. Se conservan los vacíos y nulos, sin completar cargos por semejanza ni desde el padrón actual.

## Identidad de archivo y corrida
- SHA-256 comprimido: `bced0b174aab977b085fc977723f7edd8fb9e473adcfbe237070e8ecef982aa7`.
- SHA-256 SQL lógico: `3475c581e36d62fca0cb341dd73d05b698215fe85c1825dd930a6c53723ab612`.
- Pie del respaldo: `2026-08-19 15:17:09`, hora declarada por el archivo, no convertida en UTC.
- Dataset existente de agosto M: `72363f49-e2ab-4f6d-a3a9-d4da3fb5a2e9`.
- SHA-256 de su payload: `f087bcaf62808a73b32051de6936422718fb0cbbe68b19250d97e142854cf400`.

Se volvió a ejecutar el extractor existente de detalle contra ese respaldo. La regeneración obtuvo exactamente el mismo hash de payload registrado en Neon para el dataset: 854 declaraciones y 21.649 líneas. Esto acredita la procedencia de la corrida; no sustituye la futura validación exhaustiva de pertenencia de cada registro histórico.

## Código agregado
`scripts/extract-grh-budget-positions.py` lee el archivo local sin ejecutar SQL ni usar red. Exige la huella comprimida esperada, base y empresa explícitas, descubre y valida las columnas, rechaza registros o legajos repetidos en una corrida y requiere correspondencia de la clave completa con `histocal`.

El resultado privado sólo contiene legajo, ID de registro y los tres campos históricos, con la identidad de fuente/corrida. No contiene nombres, DNI, CUIL ni importes. La salida se exige fuera del repositorio; nunca reemplaza un archivo existente diferente.

La extracción real produjo un paquete de 146.787 bytes, SHA-256 `933d6b2f7f7ff32d6d517dcd9b2f68ae87f06eda8fe2f25e194bb92cbcbce63a`. El paquete y la regeneración de nómina se conservan privados; no están en Git, CI, Vercel ni adjuntos a esta documentación.

## Pruebas ejecutadas
`python -m unittest discover -s tests -p test_grh_budget_positions.py -v`: 21 aprobadas. Incluye hash/base incorrectos, esquema y filas inválidas, repetidos, fecha imposible, texto de control, cierre desconocido, corrida no coincidente, múltiples corridas con un mismo legajo y otra empresa.

`node --test tests/budget-payroll-model.test.js tests/budget-structure.test.js`: 29 aprobadas, cero fallos u omisiones. Son regresiones del cotejo actualmente publicado, no ensayos de una nueva pantalla histórica.

## Bloqueo y límites
La plataforma bloqueó antes de guardar tanto la propuesta de migración `111-budget-historical-positions.sql` como el verificador adicional `budget-position-proof.mjs`. Ambos archivos se comprobaron ausentes. No se ejecutaron esas propuestas ni se reintentaron por otro canal.

Neon sólo recibió consultas `READ ONLY`. No se modificaron tablas, funciones, permisos, usuarios, fuente activa, staging, legajos, haberes ni cierres. No se ejecutó una sesión de Noelia ni una presentación a AMARU.

## Siguiente cierre pendiente
1. Validar exhaustivamente la igualdad del conjunto de legajos y la unicidad entre el paquete histórico y las declaraciones de la corrida exacta. No inferirla del conteo 854.
2. Incorporar evidencia histórica privada e inmutable con fuente/corrida explícitas, ensayo reversible y comprobación de capacidad. No promover ni reemplazar fuentes canónicas para resolver este reporte.
3. Extender el lector autorizado con municipio, binding y las capacidades de estructura, legajos y nómina; revalidar contexto al exportar.
4. Mostrar cargo y estructura históricos junto al documento presupuestario. Separar coincidencia de ID, diferencias, campos ausentes y referencias ambiguas, sin convertir coincidencia textual en asignación legal.
5. Acreditar cupos anuales aprobados/vigencia por separado. La fecha del PDF y su campo Cant no los sustituyen.

Módulo 10 sigue parcial. También siguen pendientes el recorrido personal de Noelia y la aceptación del TXT 638 por AMARU. Identificar y extraer la fuente no cierra esos tres pendientes.
