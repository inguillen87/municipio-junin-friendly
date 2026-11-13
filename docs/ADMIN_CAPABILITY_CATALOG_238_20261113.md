# 238 — Catálogo municipal asignable en Administración

## Resultado y alcance

Entrega aditiva sobre el árbol de producción `3d59c5278151de0df4cd08aa73a0c8e833ab5d35`.
La migración modifica solamente `public.tenant_iam_admin_view_v4(text,uuid,integer,text,text,uuid,integer)`.
Agrega `capabilityCatalog` a los recursos `bootstrap` y `roles`, con y sin municipio seleccionado.

La consulta de diagnóstico de producción fue exclusivamente de lectura. El 13/11/2026 se observaron
105 capacidades con `scope_kind='tenant'`, de las cuales 9 no estaban asignadas a ningún rol; la unión
de capacidades de los roles sólo alcanzaba 96. `payroll.calculation.close` ya existía en el catálogo,
pero ese mecanismo no la entregaba a la interfaz. Había además 10 capacidades de alcance `platform`.

Este paquete está probado localmente y preparado para integración. No se instaló en producción ni
se publicó una versión con esta entrega. La ficha completa requiere además el cambio de interfaz que toma todas las
entradas de `state.capabilities`, solicitado por Claude como parche 10.

## Contrato

Cada entrada de `capabilityCatalog` contiene:

```json
{
  "key": "payroll.calculation.close",
  "label": "Etiqueta vigente en iam_capability",
  "description": "Descripción vigente en iam_capability",
  "scopeKind": "tenant",
  "sensitivity": "privileged",
  "conflictsWith": []
}
```

- La condición de inclusión es exactamente `iam_capability.scope_kind = 'tenant'`.
  No se filtran prefijos: una capacidad municipal no se descarta por llamarse `platform.*`, y una
  capacidad de plataforma no se admite por llamarse `payroll.*`.
- El catálogo no depende de `iam_role_capability`; incluye capacidades municipales sin rol.
- Las entradas y sus conflictos se ordenan por clave. Los conflictos se entregan en ambas direcciones,
  conforme al almacenamiento de pares de `iam_capability_conflict`.
- `roles`, sus asignaciones, `allowedCommands` y los demás campos conservan su contenido anterior.
  `users`, su wrapper SoD y los otros recursos mantienen el contrato anterior.
- La llamada original a `tenant_iam_admin_view_v3` ocurre antes de leer el catálogo. Siguen vigentes
  la sesión de plataforma, su versión, la autoridad de plataforma y la validación de release/tenant.
- No se agregan capacidades, grants, overrides, membresías ni roles editables. Mostrar una capacidad
  no la concede: `update_access` y sus validaciones conservan el comportamiento existente.

## Transporte hasta la interfaz

`lib/internal-admin.js:getInternalAdminView` llama a v4 para `bootstrap` y `roles` y devuelve el JSON
de SQL sin seleccionar campos. `api/internal-admin.js:createInternalAdminHandler` conserva el JSON
con `{ ok: true, ...result }`. No requieren cambios.

El wrapper `tenant_iam_admin_users_sod_baseline_v1` sólo se usa para `users` con tenant. Su contrato
se verificó sin cambios; no interviene en los dos recursos que reciben el catálogo. La interfaz
existente ya reconoce `capabilityCatalog` en `mergeCapabilities`; el parche UI debe usar ese catálogo
completo al presentar permisos, sin reconstruirlo exclusivamente desde los roles.

## Instalación y reversión

Archivos revisables:

| Archivo | Función |
| --- | --- |
| `scripts/migrations/238-admin-assignable-capability-catalog.sql` | Instalación transaccional con preimagen y postimagen exactas |
| `scripts/rollback/238-admin-assignable-capability-catalog.sql` | Restauración de la definición anterior, con los mismos controles |
| `scripts/read-admin-capability-catalog-state.sql` | Pre/postflight de sólo lectura: hash, metadatos y conteos agregados |

SHA-256 de los archivos:

```text
instalador b689f74d137dfa400138d63bf20e767c6df6f9c241c62fbafebc2fd727b9998e
rollback   f4caa3b7cbf20465ad097c6f400b873c50f1977ef46d65d1e047334ffc027bdc
```

SHA-256 de `pg_get_functiondef`:

```text
antes  4dd56db18e6fa1befb5826a29a0ae135b87ee602c3200fb40c2acc32d0b39c12
después f49cad7291d18f99b0dca6a2004588fbf56af7c10f8ab7ad73414c6deb3ab176
```

El instalador y el rollback verifican también owner `neondb_owner`, ACL exacta
`{neondb_owner=X/neondb_owner,municontrol_actions_runtime_app=X/neondb_owner}`,
`search_path=public, pg_temp`, `SECURITY DEFINER` y volatilidad `v`.
Con una definición o metadatos distintos abortan. Repetir la operación sobre su postimagen es un
no-op. La sustitución utiliza `CREATE OR REPLACE` y conserva el OID y los permisos de la función.
Se limita la espera por locks a 5 segundos y la ejecución a 30 segundos.

Secuencia de instalación sobre el destino que se haya definido para esa operación:

1. Ejecutar el preflight. Debe devolver una fila de función reconocida y
   `execution_metadata_matches=true`; cero filas o `unrecognized` no satisfacen el gate.
2. Verificar el SHA-256 del instalador y ejecutarlo completo con parada ante error.
3. Repetir el preflight: debe mostrar `after_238` y los mismos metadatos de ejecución.
4. Con una sesión de propietario de plataforma vigente, leer `bootstrap` y `roles`: el catálogo
   debe contener todas las capacidades municipales, incluida `payroll.calculation.close`, y ninguna
   entrada con `scopeKind='platform'`. Sus conteos proceden del catálogo actual, no de una cifra fija.
5. Si se necesita revertir este cambio, ejecutar el rollback completo y comprobar `before_238`.

## Evidencia de verificación

`scripts/verify-admin-capability-catalog.py` inicia un clúster nuevo en loopback, carga el fixture
de esquema y las definiciones reales congeladas en
`scripts/fixtures/admin-capability-catalog-functions.json`, crea sólo datos sintéticos y ejecuta el
instalador y el rollback. No admite una URL de base existente. No reemplaza funciones por mocks ni
deshabilita triggers. Al terminar detiene el clúster y borra sus credenciales y datos temporales.

| Verificación | Resultado |
| --- | --- |
| PostgreSQL 17.12 | 23 PASS, 0 FAIL |
| PostgreSQL 18.7 | 23 PASS, 0 FAIL |
| Transporte API/biblioteca | 6 PASS, 0 FAIL |
| Regresión de evidencia SoD existente | 3 PASS, 0 FAIL |

Se reprodujo primero la ausencia de la capacidad de cierre con la definición anterior. Después se
verificaron catálogo sin rol, filtro por scope independiente del prefijo, conflictos simétricos,
preservación de campos, lectura con y sin tenant, wrapper SoD, fingerprints de datos IAM sin cambios,
denegación de lectura directa al runtime, sesión obsoleta rechazada, release inválida rechazada y
autoridad insuficiente rechazada. También se verificaron repetición sin cambios, rechazo de drift
de ACL/configuración/definición, rechazo de rollback sobre ACL alterada y restitución exacta.

Los recibos normalizados están en `docs/evidence/admin-capability-catalog-238-qa.json`.
No se probó aquí la interfaz de Claude ni se ejecutó una concesión real de permisos.

### Reproducir

Se requiere Python 3, PostgreSQL local con `psql`, `initdb` y `pg_ctl`, y el fixture de laboratorio
`BASELINE_SCHEMA_ONLY.sql` con SHA-256
`40b244267844b5f31532bff9584b0855588eb4dbd39bc87a99c1cff837d0f9cf`.
El verificador registra el hash de cada entrada utilizada. La carga del esquema exige base fresca
`neondb` y administrador local `qa_cluster_admin`, creados por el propio verificador.

```sh
python scripts/verify-admin-capability-catalog.py \
  --pg-bin /ruta/postgresql/bin \
  --pg-share /ruta/postgresql/share \
  --baseline-schema /ruta/BASELINE_SCHEMA_ONLY.sql \
  --output /ruta/nueva/qa-catalogo

node --test tests/admin-capability-catalog.test.js tests/admin-access-sod-baseline.test.mjs
```
