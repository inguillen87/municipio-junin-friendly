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

## Reconstrucción privada del respaldo final — SQL144

`144-final-grh-source-revision.sql` agrega una revisión inmutable, sus diferencias y su sello. Reconstruye los diez dominios completos contra las versiones core y administrativas selladas y seleccionadas del 10/09. Conserva los registros físicos, el puntero anterior, contratos, identidades e historia. No modifica SQL106 ni habilita sus ejecutores para el 01/10.

Las tres tablas tienen RLS, escritura limitada al propietario y sin acceso del rol de aplicación. Contienen registros privados del respaldo cuando se guarda una revisión. Las funciones de lectura de esta revisión también son privadas; no son una nueva API pública. Una revisión sin sello no puede confirmarse, y una revisión sellada no admite edición, borrado, truncado ni diferencias posteriores. El sello verifica los diez dominios, registros anteriores, compañía, cantidades, huellas y ausencia de asignaciones duplicadas de snapshot. Conserva la diferencia entre septiembre cerrado y las corridas M/O abiertas de octubre, los nulos, decimales exactos y payload original administrativo.

`prepareFinalSourceRevisionWithinTransaction` necesita un cliente explícito y una transacción SERIALIZABLE de escritura del propietario. Comprueba proyecto, rama, base, municipio, vínculo, versiones y manifiestos del predecesor; no toma el último lote disponible. Usa su propio savepoint, controla espacio de todo el clúster y comprueba el contenido completo al repetir. Una falla o cancelación revierte su preparación. El presupuesto conservador vigente es 512 MiB, con 16 MiB de reserva y hasta 24 MiB de crecimiento; una ampliación real requiere revisar ese presupuesto, no omitir el control.

El ejecutor de mantenimiento es `scripts/prepare-grh-final-source-revision.mjs`. Requiere rutas absolutas para `--target`, `--baseline-core`, `--candidate-core`, `--baseline-curated` y `--candidate-curated`; checksum exacto en `--expect-package`; y uno de `--rehearse` o `--save-revision`. `--install-schema` autoriza explícitamente instalar el esquema si falta. El destino JSON tiene las ocho claves del contrato existente de lectura operativa. La conexión se entrega únicamente mediante `MC_FINAL_SOURCE_REVISION_DATABASE_URL`; no se carga un archivo de secretos ni se deduce otro destino. El paquete se reconstruye y valida antes de abrir una conexión. El ensayo revierte la transacción completa. Si el resultado de COMMIT es incierto, el ejecutor descarta la conexión e informa esa incertidumbre; no cambia de destino ni reintenta automáticamente.

La publicación del código, la instalación del esquema vacío, el guardado de una revisión, su selección y la adopción municipal son pasos diferentes. Este incremento **no selecciona la fuente final ni adopta contratos**, y su recibo lo declara expresamente. La comprobación de trece raíces nativas usada en la preparación no sustituye la cobertura municipal completa ni la revisión de conflictos necesaria antes de seleccionar una fuente. Tampoco certifica fórmulas, altas, liquidaciones, pagos o aceptación de Noelia.

La regresión real está en `scripts/verify-grh-final-source-revision-postgres.mjs`. Sólo conecta a loopback y bases de QA expresamente admitidas; la base local existente exige además su directorio de datos exacto dentro de `verification`. Usa un esquema sintético aislado, compara el contenido previo, ensaya fallos y cancelación, prueba COMMIT y repetición después de reconectar, y retira su propio esquema. PostgreSQL 17 y 18 se verifican en CI. El driver de QA fijado en pg 8.16.3 se instala en un prefijo temporal independiente; no cambia paquetes de la aplicación, dependencias compartidas ni paquetes globales.
