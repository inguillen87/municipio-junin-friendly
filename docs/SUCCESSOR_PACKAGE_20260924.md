# D1.1 · constructor y verificación del paquete sucesor GRH

## Referencia y alcance cerrado

Se trabajó desde GitHub `master` y el despliegue activo de Vercel, ambos comprobados en `814cb372bfa04d1d6d1d0e4eba7e538f753ee0bd`. Se recuperó el borrador previamente conservado, se ejecutaron sus pruebas y se corrigieron siete verificaciones incompletas: perfil/huella de fuente, corte, orden de diferencias, clave, proyección, contenido anterior y huella de una entidad vacía.

La biblioteca construye en memoria las diferencias de los diez dominios de almacenamiento: corridas, asignaciones de captura, movimientos, resúmenes mensuales, conciliación laboral, empleados, ausencias, licencias, familiares y catálogos. Los quince archivos de personal se proyectan en sus cinco tablas mediante los mapeadores existentes. No se confunden archivos de entrada, tablas, contratos o personas.

Cada diferencia conserva su clave y operación; las modificaciones y ausencias conservan además el registro anterior. Los importes se mantienen como decimales textuales y los identificadores largos no pasan por aritmética de punto flotante. La lectura de JSON rechaza números que no puedan conservar su significado decimal al ser representados por el proyector.

Se verifican las fuentes conocidas 10/09 y 22/09, las huellas de los manifiestos y sus artefactos, los conteos, claves repetidas, compañía y coherencia de las proyecciones. La base se relee durante la comparación, y todos los artefactos se cotejan nuevamente al terminar. No se acepta un paquete parcial ni una sustitución sin evidencia anterior.

## Resultado sobre los archivos reales

La ejecución completó los diez dominios y produjo en memoria **3.260 diferencias**, con **4.587.098 bytes** de representación canónica. Huella del contenido: `325ec95153bfa0cd052ea7c02f43d24bfbe305a888cddc7596c77d2840073ff3`.

| Dominio | Base 10/09 | Candidato 22/09 | Agregados | Modificados | Ausentes en candidato |
|---|---:|---:|---:|---:|---:|
| Corridas | 624 | 625 | 1 | 1 | 0 |
| Asignaciones de captura | 847 | 850 | 850 | 0 | 847 |
| Movimientos | 495.237 | 496.081 | 855 | 1 | 11 |
| Resúmenes mensuales | 216.411 | 216.413 | 4 | 582 | 2 |
| Conciliación laboral | 2.452 | 2.452 | 0 | 4 | 0 |
| Empleados | 2.452 | 2.452 | 0 | 50 | 0 |
| Ausencias | 31.702 | 31.750 | 48 | 1 | 0 |
| Licencias | 3.448 | 3.448 | 0 | 0 | 0 |
| Familiares | 3.649 | 3.650 | 1 | 1 | 0 |
| Catálogos | 358 | 358 | 0 | 1 | 0 |

Los agregados y ausencias de claves de la captura salarial no representan altas o bajas de empleados: se comparan las claves de asignación de dos formatos de fuente, incluido el candidato multiliquidación. Tampoco un resumen mensual modificado acredita que MuniControl haya recalculado un haber.

## Ejecución y evidencia

`node scripts/verify-grh-successor-package.mjs --baseline-core RUTA_ABSOLUTA_CORE_10 --candidate-core RUTA_ABSOLUTA_CORE_22 --baseline-curated RUTA_ABSOLUTA_PERSONAL_10 --candidate-curated RUTA_ABSOLUTA_PERSONAL_22`

La utilidad emite sólo un resumen agregado. `--progress` agrega avances por dominio en stderr, sin filas nominales. No existe una opción de carga a base, sustitución de fuente o salida de registros personales. El constructor reutilizable retorna el paquete completo en memoria; no se añadió el exportador nominal cuyo archivo no pudo completarse en esta sesión.

Los controles locales nuevos se ejecutan con `node --test tests/grh-successor-package.test.js tests/grh-successor-package-source.test.js`. La suite incluye inconsistencias con checksum recalculado, duplicados, fuente alterada, números con pérdida de precisión, invariancia de orden, proyección y rechazo de opciones de escritura. El workflow existente `grh-multirun-candidate.yml` incorpora sus archivos; no se añadieron credenciales ni otra ejecución recurrente.

Los archivos reales permanecen fuera del repositorio, y únicamente se conservó un resumen sin personas ni importes. La biblioteca y las pruebas sí se versionan. El resultado del build, commit y despliegue se acredita por separado: una prueba nueva no se considera aprobada hasta su ejecución.

## Lo que aún requiere cierre

La verificación del paquete es estructural y de origen, no una firma digital ni autorización de publicación. Sus huellas SHA-256 de proyección no sustituyen los sellos SQL de la migración 106: el futuro cargador debe comparar las filas con la versión operativa, verificar las huellas que calcula PostgreSQL e insertar y sellar en una misma transacción.

No se instaló la migración 106, no se grabó el paquete en Neon y no se promovió el respaldo del 22/09. Tampoco se contrastaron operaciones nativas posteriores ni se certificó la capacidad/restauración de la base. La siguiente subfase sigue siendo comparación con la selección operativa y nativos → capacidad y recuperación → instalación/carga sellada → selección sucesora explícita.

Por lo tanto, queda cerrado D1.1 (constructor y verificación completa de fuentes), no D1 completo ni la autonomía de GRH. Continúan los cierres funcionales de Noelia, Hugo, Mariano y superadministración. EXP-PROV-01 mantiene su diferimiento hasta G-AUT-01.


## D1.2 · inspección de la fuente operativa y dependencias nativas

`SUCCESSOR_OPERATIONAL_PREFLIGHT_20260925.md` añade la comparación de los diez dominios con la selección real, sus sellos y las imágenes anteriores de cada diferencia. Una sola transacción read-only obtiene además la cohorte de contratos y trece grupos de registros nativos, sin publicar filas personales. El resultado no autoriza cargar ni seleccionar el sucesor: el cargador debe preservar las dependencias, revalidar dentro de su propia transacción y cerrar capacidad/restauración.
