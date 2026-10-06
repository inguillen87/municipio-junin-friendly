# Respaldo final de septiembre: preparación local

El perfil explícito `grh-junin-2026-10-01` identifica el respaldo final por sus hashes físicos y lógicos, cantidades y corte del 01/10/2026 a las 15:17:29. Mantiene separado septiembre cerrado de las corridas M/O abiertas de octubre. Las fechas anómalas de otras filas no eligen el período actual. La extracción y aceptación son locales y de sólo lectura; no acreditan una liquidación propia ni promueven la fuente municipal.

Los extractores existentes admiten `--profile grh-junin-2026-10-01`. La aceptación completa de los artefactos usa:

```powershell
node scripts/verify-grh-multirun-candidate.mjs <directorio-core-privado> --profile=grh-junin-2026-10-01
```

`analyze-grh-successor.mjs`, `compare-grh-curated-successor.mjs` y `verify-grh-successor-package.mjs` admiten `--candidate-profile=grh-junin-2026-10-01`. Conservan la base explícita del 10/09 y exigen que los manifiestos core y administrativos pertenezcan al mismo corte. Sin selector se conserva el candidato anterior del 22/09. No se permite `latest`, mezclar fuentes ni omitir entidades de la comparación.

La migración de staging instalada para el 22/09 no admite el respaldo del 01/10. Los dos ejecutores rechazan ese perfil antes de consultar SQL o abrir una conexión. Tampoco se habilitan los importadores anteriores ni los agregados públicos para un candidato. La aceptación de archivos y su comparación no autorizan restaurar un dump, incorporar empleados, recalcular haberes o cambiar el corte productivo.

Antes de cualquier incorporación se necesitan los artefactos verificables de la fuente efectiva del 10/09, la comparación completa de los diez dominios, revisión de diferencias y un circuito propio probado que conserve contratos e historia. Los archivos municipales extraídos permanecen fuera de Git, CI y servicios externos. Los controles publicados usan únicamente datos sintéticos.
