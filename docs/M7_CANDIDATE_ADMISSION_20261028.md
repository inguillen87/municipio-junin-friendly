# Admisión técnica del candidato M7

Este cambio añade evidencia y una admisión que rechaza resultados incompletos antes de que `verify-remote-release-base.mjs --phase=publish` declare alineación. No promueve deployments, instala SQL ni configura protección de ramas o enrutamiento de Vercel. Su adopción y ejecución en el SHA final siguen siendo requisitos separados.

## Evidencia exigida

Las cuatro matrices existentes conservan todos sus comandos funcionales y PostgreSQL 17/18:

| Workflow | Evidencia adicional | Suite completa existente |
| --- | --- | --- |
| `own-payroll-calculation.yml` | Resultado del producto de cálculo y manifiesto del paquete | No: conserva sus focales y su constructor original |
| `own-payroll-full-capacity.yml` | Resultado del circuito completo sintético y manifiesto | Sí, `npm run build` |
| `own-payroll-receipts.yml` | Recibos, revisión independiente, aislamiento y revocación | Sí, `npm run build` |
| `own-payroll-reports.yml` | Descargas completas, invalidaciones y revocación de reportes | Sí, `npm run build` |

Reportes es necesario además del circuito de capacidad: aporta sus propias regresiones de legajo, estadísticas, variables originales y descarga tras invalidación. Son ocho jobs y ocho artefactos de admisión. No se sustituyen pruebas por artefactos declarativos: el consumidor exige los cuatro YAML aprobados por hashes canónicos incorporados en el guard revisado, todos los jobs y pasos exitosos, los resultados completos y los bytes de sus evidencias.

Cada productor registra antes y después el `HEAD`, su árbol, `GITHUB_SHA`, ejecución, intento, workflow, job y hashes de fuentes de control. La suite completa conserva el comando de `package.json`; el log se captura con `pipefail`. `package.json` y su lock no cambian.

Los artefactos dedicados incluyen resultado, identidad de release, manifiesto de estáticos y, donde corresponde, log completo. Su nombre incluye workflow, versión PostgreSQL, run e intento. El consumidor comprueba el digest SHA-256 del ZIP observado por GitHub antes de extraerlo y comprueba cada archivo contra el manifiesto.

## Identidad y vigencia

La admisión exige el SHA candidato exacto y el árbol obtenido de GitHub. Requiere el último run elegible y su intento actual de cada workflow; vuelve a consultarlos después de descargar toda la evidencia. Un run nuevo pendiente, fallido o cancelado, un reintento nuevo, una matriz parcial, un paso requerido omitido o un artefacto faltante impiden la admisión.

Los eventos admitidos para publicar son `push` y `workflow_dispatch`. Un resultado verde de `pull_request` puede corresponder a un commit de merge: no acredita el SHA de la rama. Los productores registran esa diferencia y el consumidor rechaza el evento PR. La rama `codex/candidate-admission-20261028` tiene un trigger push explícito para poder comprobar su SHA sin suponer que el nuevo `workflow_dispatch` ya existe en la rama predeterminada. Los filtros incluyen fuentes del gate, sus fixtures, configuración del build y páginas M7. Una matriz ausente por filtros sigue siendo ausencia, nunca éxito.

La sucesión de metadata CI preserva por hashes y spans exactos el workflow anterior de capacidad y permite conservar sus pruebas históricas. No cambia fuentes nativas ni los pins de negocio. Las pruebas del gate comparan además todos los comandos funcionales ordenados con el padre 5b38.

## Omisiones opcionales

Se conservan las condiciones opcionales existentes en las fuentes, con nombre, archivo y hash exactos:

- Los dos casos de datasets externos de `tests/friendly-source-aggregate.test.js`.
- El caso forense local de `tests/owner190-cleanup-raw255.local.test.js`.
- El caso de XLSX municipal privado de `tests/junin-attendance-inventory-importer.test.js`.

El consumidor reconstruye el inventario desde el log TAP/spec y lo compara con el recibo. No basta un contador de omisiones. Un nombre desconocido, un conteo sin nombres o una fuente cambiada rechaza la admisión. Estas excepciones son de casos individuales; no autorizan omitir workflows, jobs ni pasos de PostgreSQL/release. No se solicita ni publica evidencia nominal externa.

## Deployment y alcance del manifiesto

Se exige el ID exacto de un deployment `READY`, `target: production`, del proyecto y equipo observados en la respuesta de Vercel, con SHA idéntico al candidato y `alias: []`. Un preview `READY`, un deployment ya asociado a cualquier alias o una identidad de proyecto inferida de los argumentos no califican.

El colector compara los bytes servidos desde la URL inmutable del deployment con los 21 archivos explícitos de `M7_RELEASE_FILES`, incluidos `release-info.json`, las dos páginas y los assets enumerados. Es una comprobación acotada a esa lista; no constituye una comparación de todos los archivos del sitio ni de los bundles serverless. Las ocho matrices deben producir el mismo manifiesto estático e identidad de release.

Los resultados mantienen explícitamente:

```text
noeliaReady=false
fullGoalComplete=false
normalAuthenticationVerified=false
productionSqlVerified=false
externalNominalDatasetsVerified=false
serverlessArtifactBytesVerified=false
productionEnvironmentVerified=false
platformEnforcementVerified=false
promotionPerformed=false
```

El gate no acredita variables o secretos de producción, MFA/JWT normal, operaciones municipales nominales, instalación 208/209 en PROD ni cambios posteriores de bancos/planillas que estén fuera del candidato revisado. Los perfiles públicos y los selectores HTTP permanecen intactos.

## Uso de lectura y adopción pendiente

El colector permite adaptadores de lectura explícitos para la integración. Su CLI usa exclusivamente GET de GitHub/Vercel y estáticos anónimos. Requiere una credencial Vercel de lectura ya disponible; no la crea ni presupone su existencia. GitHub puede requerir una credencial existente para descargar artefactos. Una respuesta de protección, redirección o lectura incompleta rechaza la admisión; no se sintetizan sesiones ni bypasses.

```sh
node scripts/verify-release-candidate.mjs --sha=<SHA_FINAL_40_HEX> --deployment=<DPL_ID>
node scripts/verify-remote-release-base.mjs --phase=publish --base=<BASE_REMOTA_40_HEX> --deployment=<DPL_ID>
```

La fase `start` conserva su contrato. La fase `publish` recoge evidencia actual del `HEAD` y exige una admisión creada por el validador en ese mismo proceso, además de los controles originales de base, árbol de trabajo y alias publicado. Un JSON guardado con `admitted: true` no es una autorización reutilizable.

La publicación requiere adoptar y revisar el cambio, ejecutar las cuatro matrices sobre el SHA final, obtener el deployment de producción preparado y recoger la evidencia completa. No hay job ficticio de promoción, secreto asumido ni configuración persistente de plataforma en este parche. Las protecciones externas y la asociación final de dominios siguen dependiendo de sus mecanismos y autorizaciones reales; un recibo local no impide que otro actor use una vía distinta. La evidencia debe volver a recogerse inmediatamente antes de cualquier promoción autorizada.
