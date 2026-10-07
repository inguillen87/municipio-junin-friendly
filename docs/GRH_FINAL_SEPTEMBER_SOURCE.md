# Respaldo final de septiembre: preparación local

El perfil explícito `grh-junin-2026-10-01` identifica el respaldo final por sus hashes físicos y lógicos, cantidades y corte del 01/10/2026 a las 15:17:29. Mantiene separado septiembre cerrado de las corridas M/O abiertas de octubre. Las fechas anómalas de otras filas no eligen el período actual. La extracción y aceptación son locales y de sólo lectura; no acreditan una liquidación propia ni promueven la fuente municipal.

Los extractores existentes admiten `--profile grh-junin-2026-10-01`. La aceptación completa de los artefactos usa:

```powershell
node scripts/verify-grh-multirun-candidate.mjs <directorio-core-privado> --profile=grh-junin-2026-10-01
```

`analyze-grh-successor.mjs`, `compare-grh-curated-successor.mjs` y `verify-grh-successor-package.mjs` admiten `--candidate-profile=grh-junin-2026-10-01`. Conservan la base explícita del 10/09 y exigen que los manifiestos core y administrativos pertenezcan al mismo corte. Sin selector se conserva el candidato anterior del 22/09. No se permite `latest`, mezclar fuentes ni omitir entidades de la comparación.

La migración de staging instalada para el 22/09 no admite el respaldo del 01/10. Los dos ejecutores rechazan ese perfil antes de consultar SQL o abrir una conexión. Tampoco se habilitan los importadores anteriores ni los agregados públicos para un candidato. La aceptación de archivos y su comparación no autorizan restaurar un dump, incorporar empleados, recalcular haberes o cambiar el corte productivo.

Antes de cualquier incorporación se necesitan los artefactos verificables de la fuente efectiva del 10/09, la comparación completa de los diez dominios, revisión de diferencias y un circuito propio probado que conserve contratos e historia. Los archivos municipales extraídos permanecen fuera de Git, CI y servicios externos. Los controles publicados usan únicamente datos sintéticos.

La revisión de dependencias tiene un perfil explícito para el esquema municipal vigente hasta SQL131:

```powershell
node scripts/verify-grh-native-continuity.mjs --catalog <ruta-absoluta-al-catalogo-privado.json> --expect-catalog <sha256-exacto-del-archivo> --profile municipal-sql131
```

El catálogo contiene sólo tablas, columnas y claves foráneas obtenidas mediante lectura autorizada. La herramienta trabaja sobre ese archivo y no abre una conexión. El perfil incluye raíces independientes de salarios, novedades, programas, capturas/resultados, cierres, recibos, cargos anuales y tiempo, además de las dependencias familiares y administrativas anteriores. Los hijos sin vínculo directo deben conservar exactamente la relación declarada con su padre, incluidas las columnas de municipio y vínculo cuando corresponden. Tablas desconocidas o faltantes impiden afirmar cobertura completa; claves sin validar, relaciones externas o ámbitos ambiguos detienen la revisión.

La selección mantiene el contrato anterior si se omite `--profile`. No hay selector `latest`. El perfil actual identifica por separado las exclusiones de infraestructura de versiones de fuente e identidad. `coverageComplete` acredita únicamente cobertura del catálogo relacional declarado. No acredita revisión semántica de registros, conservación de bytes adjuntos, resolución de conflictos, recuperación ni autorización para promover la fuente. Ninguna fórmula, alta, liquidación o evaluación de tiempo se ejecuta con esta herramienta.

`grh-municipal-footprint.mjs` permite obtener y contrastar huellas de las 82 tablas de ese perfil. Exige un destino exacto de proyecto, rama, base, municipio, vínculo y versiones seleccionadas; un catálogo completo; y transporte explícito. La lectura usa una sola transacción READ ONLY/REPEATABLE READ, normalización UTC y comprobación del catálogo y contexto al principio y al final. Devuelve cantidades y SHA-256 por tabla, sin registros nominales. Los hijos heredan el ámbito mediante las claves ya revisadas; las filas de otro municipio o vínculo no entran en la huella.

El contraste entre comprobantes detecta cambios de contenido aunque la cantidad de filas sea igual. Rechaza comprobantes alterados, parciales, de otro ámbito o de un catálogo distinto. Un cambio de versión de fuente se informa por separado y no autoriza su incorporación. Conservar huellas no equivale a resolver conflictos semánticos ni verificar adjuntos externos. La biblioteca no abre conexiones, guarda datos o promueve una fuente por sí misma.
