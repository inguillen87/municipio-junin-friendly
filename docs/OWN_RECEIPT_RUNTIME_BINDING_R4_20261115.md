# Recibos: integración del binding R4

Estado: código y pruebas sintéticas; sin instalación ni comprobación de un destino real.

## Alcance

La API `api/internal-own-payroll-receipts.js` verifica el destino del mismo cliente SQL antes de invocar cualquiera de sus fachadas: `self`, `list`, `batch`, `attempt`, `preview` y los comandos `prepare`, `approve` y `withdraw`.

El recurso `issuer` mantiene su consulta del perfil institucional después del gate municipal. Sale antes de leer la configuración del binding o adquirir un cliente SQL.

El sobre HTTP continúa siendo exactamente `{ok:true,data}`. El helper devuelve internamente `own-receipt-runtime-binding.v1`, con `applicationCommit`, `bindingVerified:true` y `observedAtUtc`; esta constancia no se incorpora a la respuesta ni al cuerpo de los comandos.

## Configuración requerida

`INTERNAL_RECEIPT_ACTIONS_TARGET` debe ser una propiedad propia del entorno del servidor que contenga JSON válido, sin claves duplicadas, de hasta 4096 bytes UTF-8. Su objeto tiene exactamente estas claves:

| Campo | Regla |
| --- | --- |
| `major` | Número entero 17 o 18. |
| `projectId` | Cadena no vacía, hasta 256 caracteres, sin controles ni espacios en sus extremos. |
| `branchId` | La misma regla de cadena. |
| `endpointId` | La misma regla de cadena. |
| `database` | La misma regla de cadena. |
| `role` | Exactamente `municontrol_actions_runtime_app`. |

Los valores efectivos son configuración privada del operador. No se incluyen en esta entrega ni se toman de una consulta HTTP, cabecera, cuerpo de usuario o metadatos IAM. Tampoco se reutiliza el destino de otro módulo como valor por omisión.

`VERCEL_GIT_COMMIT_SHA` debe contener exactamente 40 caracteres hexadecimales en minúsculas. Identifica el artefacto de aplicación. No reemplaza `session.releaseSha`, `INTERNAL_CERTIFIED_DATA_CONTRACT_SHA` ni su alias de compatibilidad. El gate de acceso, la certificación lógica del ámbito municipal y los cuerpos SQL permanecen intactos.

Ambas configuraciones se validan antes de llamar a `getSql`. Su ausencia o malformación devuelve HTTP 503 con `OWN_RECEIPT_BINDING_UNAVAILABLE` sin adquirir cliente ni ejecutar la lectura de identidad. Publicar este código sin esa configuración deja indisponibles las operaciones SQL de Recibos; `issuer` conserva su comportamiento.

## Secuencia de verificación

1. Obtener el cliente mediante `getSql(env,{expectedDestination})`.
2. Exigir que ese cliente tenga identidad registrada y coincidente en `assertActionRuntimeDestination`.
3. Ejecutar exclusivamente `ACTION_RUNTIME_IDENTITY_SQL` para leer una fila con las siete columnas declaradas.
4. Comprobar nuevamente la identidad registrada del mismo cliente.
5. Registrar la identidad observada y exigir otra vez su coincidencia con el destino esperado.
6. Invocar la fachada de Recibos sobre ese mismo cliente.

El destino queda copiado y congelado al entrar al helper; el commit se lee una vez dentro de él. No se agrega un protocolo que relea el entorno durante la consulta. El helper sólo necesita el commit en su argumento `env`, puesto que recibe el destino previamente validado como argumento separado.

La lectura admite una fila ordinaria o con prototipo `null`, con exactamente `currentUser`, `sessionUser`, `major`, `projectId`, `branchId`, `endpointId` y `database`. Rechaza getters, campos extra, múltiples filas y valores incompatibles. Ambos roles observados deben ser `municontrol_actions_runtime_app`.

Cada fallo del binding devuelve el mismo error seguro, sin datos internos de conexión. Si comenzó la lectura, se invalida la identidad del cliente. Además, `recordActionRuntimeIdentity` elimina primero cualquier identidad anterior, incluso si luego rechaza el nuevo registro.

### Consecuencia de la invalidación

El cliente cacheado que perdió su identidad no se rehabilita automáticamente. Una nueva petición de Recibos exige identidad registrada y vuelve a fallar antes de la fachada. Tras corregir la causa, el operador deberá reinicializar el cliente o proceso por el carril autorizado. Este cambio no añade un reinicio automático ni amplía la comprobación de destino a APIs ajenas que actualmente no solicitan `expectedDestination`.

## Cotejo del R4 recibido

La referencia recibida corresponde al commit `da3595fbc1495d6975702362b3a0582577fa85bb`, bajo `relevo-chatgpt/20261115/binding-r4/`.

| Archivo recibido | SHA-256 de la entrega con rutas relativas |
| --- | --- |
| `receipt-runtime-binding.mjs` | `8414cc33521b2c275f615b35d979630325a0a5d80fcf03ec256f022b774771c9` |
| `action-runtime-identity.mjs` | `bef83848e634f70e37b3c10b8e9e3f69a84448a0f11710b858313ed44781fe59` |
| `own-receipt-runtime-qa.mjs` | `f0eab2f61d4e1f1ae45f3bca155a53fc5b979159cb2e4d3e58056f9d47581d26` |

La fuente de binding original declarada en esa entrega tiene SHA-256 `068e0c37c26a8f2e3e079873771078c4499237f1b15ec90c7edeb048b95be3a4`; Claude declaró que la diferencia de la copia entregada corresponde a adaptar rutas locales a relativas. Esta integración es código nuevo cotejado con la fuente recibida, no una reconstrucción byte a byte del original.

Se conservan el esquema de configuración, sus límites, el SELECT, la comprobación triple en el mismo cliente, el error y la invalidación de identidad. Las adaptaciones de integración son:

- Imports relativos de la aplicación y extensión `.js`.
- Prevalidación de destino y commit antes de adquirir el cliente, preservando la salida sin SQL de `issuer`.
- Validación de la clave de intento y del identificador de lote antes de la nueva lectura de identidad, con sus códigos y mensajes de entrada existentes.
- Copia congelada del destino y validación local de la forma exacta de la fila de siete columnas, compatible con filas ordinarias y de prototipo `null`.
- Uso interno de la constancia, sin modificar el sobre HTTP ni el contrato de los comandos.

La fixture recibida de Claude se leyó como fuente. No se ejecutó ni se importó para las pruebas.

## Compatibilidad de los consumidores de QA existentes

Los adaptadores `psql` de los ensayos existentes sólo admiten fachadas de negocio. Antes de esta adaptación, sus handlers de Recibos carecían del destino y commit requeridos por R4; al incorporarlo habrían respondido 503 antes del recorrido que intentaban verificar.

`scripts/lib/own-receipt-synthetic-runtime-qa.mjs` proporciona una costura exclusiva de QA. Crea un destino inventado y un commit sintético, registra una identidad ficticia sobre un wrapper estable y responde únicamente al texto exacto y sin parámetros de `ACTION_RUNTIME_IDENTITY_SQL`. Cada fila simulada es una copia nueva. Las demás consultas conservan su texto, argumentos, receptor, promesa, resultado y errores al delegarse al adaptador original.

La identidad se registra una sola vez, al crear el wrapper. `getSql` comprueba el destino esperado y la identidad registrada; no rehabilita un cliente invalidado. No se agregan omisiones del binding, parámetros de bypass ni importaciones de este helper en la aplicación productiva.

Se adaptaron estos ocho consumidores, manteniendo sus fachadas, pins, cuerpos SQL y rutinas de arranque:

| Consumidor bajo `scripts/` | Integración |
| --- | --- |
| `verify-own-payroll-receipt-ui.mjs` | Handler de Recibos con entorno y cliente sintéticos. |
| `verify-adopted-own-payroll-receipt-ui.mjs` | La misma costura para recibos adoptados. |
| `verify-own-payroll-receipt-planilla-ui.mjs` | Wrapper sólo en Recibos; Cierre conserva su adaptador. |
| `verify-own-bank-output-ui.mjs` | Wrapper sólo en Recibos; Cuentas y Cierre conservan sus adaptadores. |
| `verify-noelia-payroll-circuit.mjs` | Wrapper sólo en Recibos; el resto del circuito conserva sus adaptadores. |
| `verify-salary-auxiliary-namespace.mjs` | Wrapper sólo en Recibos y referencia estable transmitida a la continuación. |
| `lib/own-period-classification-qa.mjs` | La recuperación usa ese mismo wrapper y el entorno compartido; preserva `actualAccess`. |
| `lib/own-period-classification-final-qa.mjs` | Recibe la versión mayor declarada del ensayo; la rama y política de reintentos de preview no cambian. |

Los reportes de esos consumidores, incluidos los reportes de fallo que ya existían y el reporte subordinado de recuperación, agregan `receiptRuntimeIdentity` con estos valores:

```json
{
  "mode": "synthetic-fixture",
  "identityQuery": "simulated",
  "applicationCommit": "synthetic",
  "genuineSdkVerified": false,
  "actualDestinationVerified": false
}
```

Esa marca delimita la evidencia: el recorrido de negocio conserva sus comprobaciones existentes, pero la identidad runtime se simula. Los ensayos no acreditan un SDK genuino ni un destino productivo. No se cambiaron seeds, perfiles institucionales, ejecutores retenidos ni protocolos de instalación.

## Verificación local

Las fixtures nuevas usan identificadores inventados y un cliente simulado. No conectan con un SDK o base de datos real ni ejecutan SQL local o remoto.

```text
node --test tests/own-receipt-runtime-binding.test.js tests/own-payroll-receipt-runtime-binding-api.test.js tests/own-payroll-receipts-api.test.js tests/action-runtime-destination.test.js
```

Resultado: 59 pruebas aprobadas, cero fallos y cero omitidas. `git diff --check` limpio.

La cobertura incluye configuración inválida o ausente, destino incompatible, cliente sin identidad registrada, revocación de permisos, misma instancia de cliente, manipulación de identidad, claves extra en query/cuerpo, cabeceras que intentan sustituir el destino, conservación del replay, respuesta HTTP sin cambios, separación del commit de aplicación y el contrato certificado, filas de prototipo `null` y ausencia de SQL en `issuer`.

Después de adaptar los consumidores se ejecutó únicamente la prueba focal nueva:

```text
node --test tests/own-receipt-synthetic-runtime-qa.test.js
```

Resultado: nueve pruebas aprobadas, cero fallos y cero omitidas. Verifican el wrapper con versiones mayores sintéticas 17 y 18, la delegación intacta del adaptador, el rechazo de un destino ajeno o una identidad invalidada, el handler real con dependencias simuladas, permisos y configuración, y la presencia de la costura y su marca de evidencia en los ocho consumidores. La revisión de esos consumidores fue estática: no se ejecutaron sus ensayos PostgreSQL ni de navegador.

Al integrar las veinte rutas sobre PR288 `be2894c54b1cf55e6a16c2bf296f9d20ed05f5a4`, se ejecutaron juntas las cinco suites anteriores: **68 pruebas aprobadas, cero fallos y cero omitidas**.

Las tres llamadas existentes de `tests/own-period-classification-final-qa.test.js` se actualizaron para declarar `major:17`, y la llamada del ensayo final transmite su `major` ya validado. La búsqueda de todas las llamadas confirmó esos argumentos. Se intentó iniciar esta suite pura:

```text
node --test tests/own-period-classification-final-qa.test.js
```

El archivo no llegó a ejecutar sus casos: el cargador de módulos devolvió `ERR_MODULE_NOT_FOUND` para `@neondatabase/serverless`, importado transitivamente por `scripts/import-grh-core-canonical.mjs`. No había una copia local de esa dependencia en los worktrees revisados ni en las dependencias del runtime. No se instaló ni se simuló el SDK. Esta suite queda pendiente de CI con las dependencias normales; no se cuenta como aprobada.

Los doce archivos JavaScript nuevos o modificados para esta adaptación superaron `node --check`, que sólo analiza sintaxis. `git diff --check` permanece limpio. La búsqueda de importaciones del helper de QA o bypasses nuevos bajo `api/`, `lib/` y `assets/` no encontró resultados.

La evidencia no acredita configuración productiva, instalación de SQL V6, identidad de un SDK real, publicación ni habilitación municipal.
