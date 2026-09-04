# Contrato de datos certificado

Las operaciones gobernadas comparan una identidad estable del contrato de
datos con `certified_release_sha` en PostgreSQL. El nombre de la columna se
conserva por compatibilidad, pero su valor ya no identifica cada despliegue de
la aplicación: identifica la revisión del contrato que comparten el backend y
las fachadas SQL.

La variable canónica es `INTERNAL_CERTIFIED_DATA_CONTRACT_SHA`. Debe contener
exactamente 40 caracteres hexadecimales. El valor no es un SHA de commit: es la
identidad de contenido calculada por
`scripts/classify-data-contract-release.mjs` sobre los miembros declarados en
`contracts/certified-data-contract-files.v1.json`. Se conserva en los
despliegues posteriores hasta que alguno de esos miembros vuelva a cambiar.

`VERCEL_GIT_COMMIT_SHA` identifica el artefacto desplegado y no participa en
esta comparación. Por eso un cambio de UX, textos, estilos u otro código que no
altera el contrato de datos puede desplegarse sin recertificar el tenant.

## Estado seguro

El runtime falla cerrado con HTTP 503 antes de abrir la base cuando:

- no existe ni la variable canónica ni el alias transitorio;
- la identidad no tiene exactamente 40 caracteres hexadecimales; o
- la variable canónica y el alias transitorio conviven con valores distintos.

Una identidad válida tampoco certifica por sí sola el plano: PostgreSQL debe
tener el mismo valor y conservar el binding GRH verificado. Si el contrato se
rota y la política del tenant conserva la identidad anterior, las operaciones
tenant fallan cerradas hasta completar la certificación gobernada.

## Transición desde el nombre anterior

`INTERNAL_CERTIFIED_RELEASE_SHA` permanece como alias explícito y temporal. Ya
no debe seguir al SHA de Vercel ni se compara con él. Esto permite migrar sin
interrumpir el servicio ni recertificar datos que no cambiaron:

1. Desplegar esta versión conservando el valor actual de
   `INTERNAL_CERTIFIED_RELEASE_SHA`.
2. Agregar `INTERNAL_CERTIFIED_DATA_CONTRACT_SHA` con exactamente el mismo
   valor y crear un nuevo despliegue.
3. Comprobar las lecturas y una operación gobernada autorizada.
4. Eliminar el alias anterior y desplegar nuevamente.

Mientras ambas variables convivan deben ser idénticas. No se admite fallback a
metadata Git, valores vacíos ni corrección silenciosa.

## Assert automático durante el build

`npm run build` ejecuta primero `npm run prebuild`, que calcula la identidad del
contrato desde los archivos exactos entregados al build. También puede
ejecutarse de forma explícita con:

```powershell
npm run release:assert
```

El comportamiento depende exclusivamente del entorno de publicación:

- En Vercel Producción (`VERCEL_ENV=production`) exige la variable canónica,
  valida su formato y compara el valor con la identidad calculada. Ausencia,
  formato inválido, conflicto con el alias transitorio o desigualdad detienen
  el build antes de publicar.
- En Preview, Development y local la identidad se calcula igualmente, pero la
  comparación informa `NO APLICA`. Ese resultado no certifica ni prueba
  Producción.
- Si Vercel informa `VERCEL=1` sin un `VERCEL_ENV` válido, el build falla
  cerrado; no se degrada silenciosamente a local.

El assert usa el contenido del checkout y no depende de `.git`, que puede no
estar presente en el paquete de fuentes de Vercel. El propio assert, el
clasificador, su conexión al build y los controles de pinning de migraciones
forman parte del manifiesto protegido: debilitarlos se clasifica como cambio de
contrato, no como una publicación ordinaria.

## Despliegue ordinario: el contrato no cambió

El límite auditable del contrato está versionado en
`contracts/certified-data-contract-files.v1.json`. Antes de publicar, el
pipeline puede clasificar automáticamente la diferencia contra la base:

```powershell
npm run release:gate -- --base=origin/main --head=HEAD
```

Un resultado `RELEASE ORDINARIO` termina con código 0 y habilita estos pasos.
El assert de build es complementario: comprueba además que el checkout que se
está construyendo conserva la identidad configurada en Producción.

1. Mantener `INTERNAL_CERTIFIED_DATA_CONTRACT_SHA` sin cambios.
2. Desplegar el nuevo artefacto normalmente, sin pedir una acción manual al
   propietario de la plataforma.
3. Verificar que las lecturas tenant y una operación gobernada sigan disponibles.

No ejecutar `certify_data_plane` y no editar la política del tenant. El SHA del
nuevo commit de Vercel puede ser distinto; eso es esperado.

`npm run release:classify -- --base=<ref> --head=<ref>` entrega la misma
clasificación sin bloquear y muestra la identidad candidata calculada desde el
contenido contractual. Si se omite `--head`, incluye el árbol de trabajo y los
archivos no versionados; si se omite `--base`, usa `RELEASE_BASE_SHA` o `HEAD^`.
La opción `--json` permite consumir el resultado desde CI sin analizar texto.

## Rotación: el contrato de datos sí cambió

Una rotación corresponde cuando cambia una fachada SQL, una migración, el
binding exigido o una pre/postcondición gobernada que modifica lo que el runtime
puede leer o escribir. No corresponde por un cambio puramente visual.

El gate clasifica cualquiera de esos archivos como `CAMBIO DE CONTRATO DE
DATOS` y termina con código 2. No actualiza Neon, no cambia variables de entorno
y no certifica en nombre de una persona: detiene la publicación ordinaria para
que el cambio siga fallando cerrado hasta completar el circuito gobernado.

1. Identificar y revisar el cambio de contrato; probar su migración en una rama
   aislada de Neon antes de Producción.
2. Asignar una nueva identidad de 40 hexadecimales y configurar
   `INTERNAL_CERTIFIED_DATA_CONTRACT_SHA` con ese valor.
3. Aplicar la migración gobernada con conexión directa y verificar sus
   invariantes.
4. Desplegar el backend. La diferencia con PostgreSQL debe producir HTTP 503;
   ese cierre confirma que no se mezclan contratos.
5. Desde una sesión Plataforma con MFA, binding GRH verificado, versión esperada
   e idempotencia, ejecutar `certify_data_plane` una sola vez.
6. Confirmar que PostgreSQL devuelve la nueva identidad, mantiene el binding
   esperado y habilita los smokes tenant.

Nunca actualizar `tenant_identity_policy` mediante SQL directo. Un estado
`Ready` de Vercel tampoco prueba que el contrato y PostgreSQL coincidan.
