# Comparación del sucesor GRH multiliquidación

## Problema que resuelve

Una diferencia por `histolegajo.ID` puede presentar todas las filas como eliminadas y agregadas cuando el sistema origen regeneró sus identificadores. Eso no demuestra bajas ni altas de personal. La comparación ahora usa empresa, legajo, fecha de liquidación, período fuente, mes fuente y tipo. Conserva distintas asignaciones de un mismo legajo; duplicar la misma asignación sigue siendo un error.

## Comando de sólo lectura

`node scripts/analyze-grh-successor.mjs --baseline RUTA_CORE_10_SEP --candidate RUTA_CORE_22_SEP --output RUTA_PRIVADA/informe.json`

Las rutas deben contener las extracciones estrictas correspondientes. Se reutilizan el preflight canónico del 10/09 y la aceptación multiliquidación del 22/09. No existe modo `--apply`, no se cambia el perfil predeterminado ni se habilita el importador anterior para candidatos.

El proceso compara completamente los cinco artefactos del núcleo: corridas, asignaciones, movimientos, hechos salariales mensuales y conciliación laboral. Cada stream comprueba las huellas y conteos de los bytes que realmente produjo; se revalidan los manifiestos al finalizar. Un error rechaza el informe completo.

## Resultado y límites

El informe separa agregados, ausentes, cambios de proyección y cambios exclusivos de evidencia fuente. Los decimales se comparan como cadenas exactas normalizadas; nulo no equivale a cero. Los importes nominales y los identificadores personales no se incluyen en la salida. Los cierres se conservan por tipo de corrida; una liquidación de vacaciones cerrada no cierra la mensual.

Las huellas de proyección son deterministas y no dependen del orden de entrada. El detalle original permanece en los artefactos privados verificados, sin copiarse al repositorio. Los conteos de hechos salariales no son conteos de empleados ni una certificación aritmética.

Esta comparación no consulta la base operativa, no concilia por sí sola las entidades curadas ni las operaciones nativas y no promueve la fuente. El siguiente contrato debe resolver selección sucesora versionada, coordinación núcleo/curados, preservación nativa, capacidad y restauración. La tabla de selección v1 es inmutable: no se desactivan sus controles ni se fuerza una reimportación para sustituirla.

## Pruebas

`node --test tests/grh-successor-comparison.test.js tests/grh-multirun-candidate.test.js`

Cubren regeneración de IDs, multiliquidación por legajo, duplicados, fechas/períodos literales, precisión superior a Number, nulos, orden de entrada, fallos tardíos y ausencia de datos personales en el informe. La ejecución con respaldos municipales se documenta mediante una evidencia privada separada.
