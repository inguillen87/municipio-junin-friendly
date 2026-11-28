# Cargo: los escritores aplican el mismo contrato que la captura

Estado: **código prospectivo integrado a la línea de PR291, sin instalar ni publicar en producción**. Base: `7be686a4f418fe24510692f65f81338a311e7d93`. Rama original de Claude: `claude/cargo-escritores-20261116`, commit `c9f3396940e44b7e96f81ad1b4624c65de34336a`, árbol `003d737c6790a3f9e1a4e088d196aa2ddde7d963`.

## Problema

PR291 conserva el cargo en las capturas futuras y lo valida con un contrato de texto exacto: NFC, sin espacios exteriores ni controles, sin marcas bidireccionales ni `<` `>`, y hasta 120 unidades UTF-16. Las rutas que escriben el cargo eran más permisivas. Un solo cargo aceptado al escribir y rechazado después frenaba la captura completa del período. Los dos casos que entraban por la pantalla y por la API eran:

| Entrada | Alta (`employeeDraft`) | Rectificación (`changeProposalInput`) | Captura de PR291 |
|---|---|---|---|
| U+202A…202E / U+2066…2069 | aceptaba | aceptaba | rechaza |
| 61–120 caracteres suplementarios | rechazaba (ya contaba UTF-16) | aceptaba (contaba puntos de código) | rechaza |
| C1 (U+0080…009F) | el regex JS no lo cubría; lo rechazaba el SQL | rechazaba (`\p{Cc}`) | rechaza |

Los espacios exteriores Unicode y las formas no NFC ya no llegaban por estas rutas: las dos aplicaban `normalize('NFC').trim()` antes de enviar al SQL.

## Cambio

- `assets/employment-job-title-contract.js` es el módulo puro y sin dependencias con el contrato único:
  - `employmentJobTitleReasons` devuelve las causas con códigos fijos, sin eco del texto;
  - `employmentJobTitleInput` aplica `NFC + trim`, como antes, y después el contrato. El vacío sigue vacío y se guarda como desconocido. Nunca repara el texto.
- `own-payroll-employment-print-facts.js` reexporta `ownEmploymentJobTitleReasons` desde ese módulo. Lector, preflight y escritores usan la **misma función**.
- `employeeDraft` (alta) y `changeProposalInput` (rectificación) rechazan con mensajes en castellano lo que la captura rechazaría.
- **La lectura sigue siendo tolerante:** `changeValues`, `validateChangeBootstrap` y `changeDiff` se mantienen, para que un cargo heredado inválido pueda abrirse y corregirse.
- `scripts/build-friendly.mjs` publica el módulo nuevo.

## Lo que no cambia

- **SQL:** este cambio no contiene migraciones ni redefiniciones. Las altas y propuestas nuevas de rectificación de la API pasan por `employeeDraft` en `lib/internal-native-employees.js` y `changeProposalInput` en `lib/internal-employment-changes.js`; la homologación de desarrollo usa los mismos modelos. La aprobación de una propuesta pendiente anterior pasa por `changeReviewInput`, que no contiene el cargo, y todavía puede aplicar un valor incompatible guardado previamente. El candidato SQL debe alinear las escrituras y validar el resultado al aprobar, después del replay, manteniendo posible el rechazo. La función efectiva de revisión procede de **224**, que incorpora la guarda de altas retiradas: reemplazarla con el cuerpo anterior de 104 perdería esa protección. Codex conserva la composición y la instalación.
- **Datos existentes:** no se normalizan ni se anulan. Para los cargos ya guardados sirve el preflight de PR291, sobre filas suministradas y con autorización.
- **PDF:** el conjunto imprimible no se estrecha. Un cargo válido con un carácter que el PDF no puede dibujar, por ejemplo «→», sigue deteniendo el lote con el legajo exacto (PR293). Restringir la escritura a WinAnsi sería otra decisión de producto.

## Pruebas

`tests/employment-job-title-contract.test.js`, con valores sintéticos:

- el lector usa la misma función que los escritores;
- los dos escritores rechazan bidi, C1, 61 caracteres suplementarios y 121 ASCII;
- los dos escritores aceptan lo que aceptaban antes (vacío, tildes, NBSP interior, `…`, comillas, `Nº`), y lo guardado pasa el lector;
- un cargo heredado inválido se abre con `validateChangeBootstrap`, pero no se puede volver a proponer;
- en cada punto de código hasta U+3100 y en el bloque de especiales (con muestreo en el resto), todo lo que un escritor acepta lo acepta el lector;
- el módulo forma parte de la build.

Sin el cambio de los escritores, 5 de esas 7 pruebas fallan sobre `7be686a4`.

En `tests/native-employment-changes.test.js`, la prueba de límites pasa de 120 emoji aceptados a 60. Se agrega que 120 emoji siguen leyéndose con `changeValues`.

## Revisión de integración (16/11/2026)

Se revisaron las ocho rutas de `c9f3396` frente a su padre y se preservó su código sin modificaciones. La verificación local aprobó **146 casos en seis archivos**:

```sh
node --test tests/employment-job-title-contract.test.js tests/native-employee.test.js tests/native-employment-changes.test.js tests/own-employment-print-preflight.test.js tests/own-payroll-employment-print-facts.test.js tests/build-published-imports.test.js
```

En la invocación original se agregó `tests/published-asset-import-closure-parser.test.js`; ese archivo no inició sus casos porque el checkout no tiene `playwright` (`ERR_MODULE_NOT_FOUND`). Por eso aquella invocación completa terminó con código 1. No se atribuye ese error de dependencia a una regresión del producto, ni se presenta como reproducida la batería más amplia comunicada por Claude.

La integración conserva el commit original de Claude como antecesor y agrega únicamente esta precisión documental. No se ejecutó SQL ni se verificó el estado de producción. `NoeliaReady=false`.
