# Backups privados e inmutables en Cloudflare R2

Este pipeline prepara, sube, verifica y ensaya la restauración de backups sin agregar dependencias al proyecto. Usa Node.js estándar y la API S3-compatible de R2. No crea ni modifica buckets, dominios, CORS o reglas de Cloudflare.

## Contrato de seguridad

- El bucket debe permanecer **privado**: `r2.dev` deshabilitado y sin Custom Domain público. R2 es privado por defecto, pero hay que comprobarlo en `R2 > bucket > Settings > Public access` antes de usar `--confirm-private`.
- Use un token R2 `Object Read & Write` limitado exclusivamente al bucket de backups. No use un token administrativo.
- Las credenciales sólo se leen desde `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` y, si aplica, `R2_SESSION_TOKEN`. Nunca se guardan en el plan ni se imprimen.
- Sólo entran dumps `.sql.gz`, manifiestos JSON y outputs JSON/NDJSON/Parquet declarados por esos manifiestos. Se excluyen `.env`, tokens, claves, credenciales, SQL sin comprimir, CSV, imágenes y JSON no declarado.
- Todo objeto lleva SHA-256, tamaño, cutoff inicial y marca `public=false` como metadata. El manifiesto fija el cutoff exacto de cada snapshot. La clave remota no contiene nombres locales: es content-addressed por rol y SHA-256, por lo que puede reutilizar contenido idéntico entre snapshots.
- `If-None-Match: *` impide sobrescribir un objeto. Si ya existe, debe coincidir por HEAD en hash, tamaño, rol y privacidad; el manifiesto del snapshot además debe coincidir en cutoff.
- El manifiesto se sube último; un manifiesto remoto nunca apunta a una carga incompleta.

La inmutabilidad es una garantía de este pipeline (clave por contenido + PUT condicional), no un WORM/Object Lock de R2. Una credencial externa con permisos suficientes todavía podría borrar objetos. Proteja la cuenta con MFA, tokens limitados al bucket, auditoría y separación de funciones; no reutilice la credencial operativa en la aplicación web.

## 1. Inventariar sin red

Use inputs explícitos. Priorice los `.sql.gz` originales y agregue los directorios que contienen sus manifiestos canónicos.

```powershell
node .\scripts\r2-backup.mjs inventory `
  --cutoff '2026-08-13T15:00:00Z' `
  --input 'D:\backups\grh_junin.backup.sql.gz' `
  --input '.\rrhh-data' `
  --out "$env:TEMP\municipio-junin-r2-plan.json"
```

Revise el resumen: cantidad, bytes, SHA-256 y key del manifiesto. El plan local contiene rutas necesarias para subir; manténgalo fuera del repositorio y elimínelo al cerrar la operación.

## 2. Subir al bucket privado

Configure las variables sólo en la sesión o en el gestor de secretos del job. No use argumentos CLI para secretos y no active shell tracing.

```powershell
$env:R2_ACCOUNT_ID = '<account-id>'
$env:R2_ACCESS_KEY_ID = '<bucket-scoped-access-key>'
$env:R2_SECRET_ACCESS_KEY = '<bucket-scoped-secret>'

node .\scripts\r2-backup.mjs upload `
  --plan "$env:TEMP\municipio-junin-r2-plan.json" `
  --bucket 'municipio-junin-private-backups' `
  --confirm-private
```

El comando re-hashea todos los archivos antes de la primera operación de red y carga secuencialmente. Para objetos individuales de más de 5 GiB, no use este uploader de PUT simple: use `rclone`/multipart S3 con el mismo esquema de claves y manifiesto.

## 3. Verificar

La verificación normal hace HEAD y luego descarga cada objeto como stream para recalcular SHA-256 sin persistir una copia local:

```powershell
node .\scripts\r2-backup.mjs verify `
  --plan "$env:TEMP\municipio-junin-r2-plan.json" `
  --bucket 'municipio-junin-private-backups' `
  --confirm-private
```

Para una comprobación rápida de metadata solamente, agregue `--head-only`. No reemplaza la verificación por descarga.

## 4. Ensayar restauración sin escribir

```powershell
node .\scripts\r2-backup.mjs restore-dry-run `
  --plan "$env:TEMP\municipio-junin-r2-plan.json" `
  --to 'D:\restore-staging\municipio-junin'
```

El dry-run no crea directorios ni archivos, genera nombres neutros y falla si algún destino ya existe. Una restauración real debe hacerse en un entorno aislado, verificar primero SHA-256/tamaño y recién después importar la base; nunca restaurar directamente sobre Producción.

## Operación recomendada

1. Generar dump consistente y comprimido; fijar el cutoff real del origen.
2. Inventariar y revisar el plan local.
3. Confirmar en Cloudflare que el bucket sigue privado.
4. Subir; luego ejecutar verify completo.
5. Guardar la key y SHA-256 del manifiesto en el registro operativo/auditoría, sin credenciales ni datos personales.
6. Ejecutar periódicamente un restore dry-run y, en una ventana controlada, una restauración real sobre una base descartable.

Prueba local del pipeline:

```powershell
node --test .\tests\r2-backup.test.js
```
