# M8-02 · informe completo de un legajo por rango de períodos

## Estado y alcance
Preparación local sobre master `08aee95ddf330545d5e902ebc8b42e97b2570363` (PR #60). No es una nueva función publicada y no cierra la aceptación integral del módulo 8. La base del pedido está registrada en `NOELIA_MODULO_8_INFORMES_20260923.md`, fila M8-02: rango de meses, uno o todos los tipos, conceptos, totales y salidas del resultado completo.

Se continúa el rango de consulta ya publicado por PR #59. La fase planteada era descargar un único PDF/Excel de todas las liquidaciones seleccionadas. En esta ejecución quedaron implementados el colector y un componente de revisión independiente; el generador conjunto y la conexión a la biblioteca no se aplicaron.

## Código efectivamente escrito
- `assets/payroll-period-collection.js`: selecciona todas las páginas del rango de origen, no las 24 tarjetas visibles; rechaza un catálogo truncado. Valida contrato seleccionado, fecha civil, mes, período, tipo, dataset, cantidad de conceptos y fuente de cada respuesta. Conserva el identificador de cada declaración y exige que sea único.
- Reconsulta el catálogo antes y después, lee y relee cada documento y compara el modelo completo, incluso si las huellas recibidas no cambiaron. Sólo devuelve un resultado completo e inmutable; diferencias, ausencias o denegaciones no producen una colección parcial.
- `assets/payroll-period-review.js` y `.css`: componente independiente con sumas de totales informados, tabla por corrida, búsqueda y paginación de todos los conceptos, y referencias de fuente. Distingue importes faltantes de cero. No convierte la suma documental en cálculo salarial nuevo ni resta otra vez las contribuciones patronales.
- Límites: 240 documentos, 50.000 conceptos, 32 MiB, cinco minutos y tres lecturas simultáneas como máximo. Los lectores son los existentes; no se incorporó una API nueva.

Las fuentes y corridas permanecen separadas; tampoco se mezcla el período de origen con la fecha de pago. La firma digital, a cargo del frente con Hugo y Noelia, no se modifica ni se declara terminada desde este incremento.

## Pruebas ejecutadas
43 pruebas nuevas del colector; 122 focales al incluir rango e identidad de detalle. Cubre catálogo limitado, todos los tipos, rango inclusivo, documentos faltantes, variaciones de hashes e importes, cambio de catálogo, duplicados, entradas inválidas, límites, cancelación y permisos.

13 escenarios de navegador del componente independiente: 30 liquidaciones y 330 conceptos, relectura de todos, filtros sin cambio de sumas, fuentes por documento, ausencia de datos, fallos, cancelación, desmontaje, retirada de acceso, ocultación y reentrada. Las capturas se inspeccionaron a 320/390/1440 px. Las tablas se desplazan dentro del panel; no se recortan valores para ajustar la página.

Son personas, catálogos y respuestas sintéticas en loopback. El componente no se cargó desde producción ni se abrió la sesión personal de Noelia. No se accedió a una API municipal privada durante estos ensayos.

## Bloqueo de integración y estado de publicación
La herramienta rechazó antes de guardar `assets/payroll-period-report.js` (generación conjunta PDF/Excel) y `verification/wire-period-review.mjs` (conexión del nuevo componente a la biblioteca y al build). Se comprobaron ausentes ambos archivos. No se aplicaron esos parches, no se enlazó el componente en la biblioteca y no se lo agregó a los archivos públicos.

Por tanto, la aceptación conseguida es del colector y componente independiente, no la del circuito publicado. La descarga conjunta PDF/Excel permanece pendiente. No se crea un workflow nuevo ni se modifican los de producción en esta entrega; la PR permanece en borrador.

## Incidente de almacenamiento durante las pruebas
La primera ejecución completa de `npm run build` falló con `ENOSPC` al escribir una fixture sintética de `grh-source-profile.test.js`. Se observó C: con cero bytes libres. Los 43 tests nuevos y los 13 escenarios focales ya habían pasado; el fallo del conjunto completo no se contó como aceptación.

Se retiró exclusivamente el directorio `public` regenerable del worktree anterior `municontrol-txt638-review-20260928`: 21.755.275 bytes, 328 archivos, ningún archivo versionado ni enlace. Se comprobó su release-info correspondiente a PR #60 y árbol fuente limpio antes/después. Los logs, fuentes municipales, repositorios, dependencias y documentos del usuario se conservaron. El sistema ya había recuperado espacio antes de esa eliminación; no se atribuye esa recuperación previa a esta limpieza.

Se repitieron baseline, containment y todas las pruebas con `--test-concurrency=1` para reducir el uso temporal de disco, sin modificar ni quitar aserciones. Resultado: **5.768 aprobadas, cero fallos y dos omitidas**. La construcción estática posterior aprobó. Espacio observado al terminar: 848.621.568 bytes; sigue siendo poco margen para continuar trabajando.

## Criterios pendientes del plan que no se sustituyen
El módulo 10 pide cargos liquidados contra los presupuestados de cada año y detalle PDF; el PDF actualizado contiene el listado documental de cargos/ocupantes, no completa por sí solo su enlace histórico. Módulo 9 mantiene pendiente la descarga propia del agente; la firma está en el trabajo con Hugo y Noelia. El motor de liquidación, la integración contable y la aceptación del TXT por AMARU permanecen en sus frentes, sin declararse cerrados por este informe.
