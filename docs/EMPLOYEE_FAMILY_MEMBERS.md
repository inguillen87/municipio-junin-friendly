# Alta propia de hijos declarados — MC-D02 / MC-E02

La migración 064 incorpora vínculos propios por municipio, fuente, legajo y persona titular. El UUID del hijo permanece estable al cambiar el corte GRH. El alta expresa una declaración administrativa; no aprueba el vínculo, no establece elegibilidad ni cambia haberes. No hay edición, baja, aprobación ni conciliación automática en este incremento.

## Contrato HTTP para la ficha

El contexto se consulta antes del alta, incluso cuando GRH no contiene hijos:

`GET /api/internal-family-members?resource=context&contractId=<uuid-del-contrato>`

Respuesta `200 {ok:true,data}`:

```json
{
  "version": "employee-family-context.v1",
  "subject": {
    "contractId": "fedcba98-7654-0321-0123-456789abcdef",
    "legajo": "SYN-1",
    "employeeName": null,
    "sourceCutoff": "2026-09-14T00:00:00Z",
    "identityToken": "<sha256 de la identidad del contrato>"
  },
  "canDeclare": true
}
```

`POST /api/internal-family-members` con `Content-Type: application/json`, origen de la aplicación e `Idempotency-Key: <uuid-v4>`:

```json
{
  "contractId": "fedcba98-7654-0321-0123-456789abcdef",
  "contractIdentityToken": "<identityToken del contexto>",
  "familyName": "Hija sintética",
  "birthDate": null,
  "dni": null,
  "validFrom": null,
  "validTo": null
}
```

Sólo nombre y contexto son obligatorios. Nacimiento, DNI y vigencia pueden omitirse o enviarse como `null`. No se inventan fechas. El nombre conserva acentos, se normaliza a NFC y se compactan espacios; admite un solo nombre. El DNI opcional admite puntos/espacios/guiones de presentación y se guarda como 5–12 dígitos, excluyendo valores compuestos sólo por ceros. No se solicita CUIL. El cuerpo está limitado a 8 KiB y rechaza atributos desconocidos, PDF, importes o estados de aprobación.

Respuesta `201`, o `200` al repetir el mismo intento confirmado:

```json
{
  "ok": true,
  "data": {
    "version": "employee-family-declare.v1",
    "familyRef": { "kind": "own", "id": "11111111-1111-4111-8111-111111111111" },
    "identityToken": "<sha256 de la identidad propia>",
    "state": "declared",
    "recordedAt": "2026-09-14T12:00:00Z",
    "duplicate": false
  }
}
```

La interfaz debe conservar los mismos datos y clave ante timeout. Si el alta ya se confirmó, reutiliza su `familyRef` y pasa a **Registrar certificado**. El PDF es una segunda operación: su fallo no elimina el hijo guardado ni justifica repetir el alta con otra clave. Si el usuario cambia el contenido, corresponde una nueva clave, no reutilizar la anterior.

## Certificados y reporte unificado

La API anterior mantiene v1 por defecto. La versión nueva se selecciona explícitamente:

- `GET /api/internal-family-certificates?resource=family&contractId=<uuid>&version=2`
- `GET /api/internal-family-certificates?resource=report&version=2`
- `POST /api/internal-family-certificates?version=2`
- `GET /api/internal-family-certificates?resource=download&certificateId=<uuid>&version=2`

El POST conserva `contractId`, `identityToken`, `filename`, `contentBase64`, `sha256`, `presentedOn` y `expiresOn`. Sustituye `familyId` por `familyRef`: `{"kind":"grh","id":"7"}` o `{"kind":"own","id":"<uuid>"}`. El token se toma de la fila seleccionada o del acuse del alta. Usa una clave de intento distinta de la utilizada para declarar el hijo. La respuesta conserva `certificateId` y `duplicate` con versión `family-schooling-register.v2`.

Lectura v2 conserva `rows`, `canRegister`, `storage` y `scope`. Cada fila conserva las propiedades anteriores excepto `familyId`, sustituido por `familyRef`, y agrega:

| Campo | GRH | Propio |
|---|---|---|
| `declarationState` | `source` | `declared` |
| `familyRecordedAt` | `null` | Instante del alta propia |
| `validFrom` | `null` | Fecha declarada o `null` |
| `identityReviewRequired` | Booleano | Booleano |

`familyEndDate` conserva la baja GRH o la vigencia final declarada. `sourceCutoff` siempre identifica el corte laboral GRH; no es la fecha de alta del hijo propio. No se exponen DNI, CUIL, persona titular interna ni snapshot de identidad en la respuesta. Las versiones anteriores de PDF continúan asociadas a su identidad y se descargan con los controles de 057.

`scope.unresolvedFamilyRows` cuenta las filas con coincidencias entre GRH y vínculos propios. Ambas permanecen visibles y señaladas. No deben sumarse como hijos distintos certificados: el reporte debe mostrar filas en revisión separadas de un conteo de vínculos sin coincidencias. Esta observación no fusiona hijos, no elige un certificado ajeno y no ofrece una aprobación inexistente.

## Persistencia, duplicados y permisos

`employee_family_member` y sus eventos son inmutables. Una clave propia no se convierte en ID numérico ni tiene FK a `grh_family`, reemplazada por el importador. `school_certificate` incorpora un destino propio con FK compuesta por municipio, fuente, contrato y persona, y una restricción que exige exactamente un destino. No se modifican las filas existentes ni el archivo de migración 057.

Las altas se serializan por municipio/fuente/contrato, además de por operador y clave de intento. Se contrastan documentos informados y coincidencias conservadoras de nombre/nacimiento contra el mismo legajo propio y GRH. Los nombres equivalentes con nacimiento desconocido requieren revisión, en vez de una fusión automática. Los gemelos con nombres distintos no se deduplican sólo por fecha. Las fechas de vigencia no habilitan duplicar una identidad.

Durante el alta se bloquean el contrato/corte y la búsqueda de familiares importados; los refreshes concurrentes devuelven una respuesta de reintento o esperan al cierre de la declaración. El alta exige `READ COMMITTED`, como la API actual: rechaza `REPEATABLE READ` y `SERIALIZABLE` antes de escribir, evitando que una instantánea anterior al bloqueo omita una declaración concurrente sin DNI. Cada operación vuelve a verificar sesión, municipio, fuente certificada y persona titular. Un corte equivalente conserva identidad y documentos; una reasignación impide su atribución a la nueva persona. No se afirma que una fuente histórica certifique la situación actual.

Lectura requiere `workforce.employee.read`; declarar y registrar PDF agregan `employee.record.propose`. No se exige un legajo propio al operador ni se concede `employee.record.approve`. El runtime sólo ejecuta fachadas; no lee o modifica directamente tablas propias o archivos. Todos los errores enviados al cliente provienen de listas cerradas y no contienen mensajes SQL ni datos personales.

El alta no depende de la cuota de archivos. Los PDF reutilizan la validación estructural, 2 MiB/30 páginas, deduplicación privada y cuota global de 8 MiB de 057. Ampliar el archivo general sigue siendo un trabajo separado.

## Verificación y activación

La ficha utiliza explícitamente v2. **Agregar hijo/a → Guardar hijo/a → Registrar certificado** mantiene las dos operaciones independientes. Sólo pide nombre; nacimiento, DNI y vigencia son opcionales. Ante una respuesta incierta conserva formulario y clave; una identidad de legajo cambiada bloquea el reintento sin reasignar el borrador. El detalle histórico GRH queda plegado y se identifica como otra fuente. Un enlace propio conserva `familyKind=own` y UUID hasta después del ingreso; nunca se interpreta como un ID GRH ni selecciona otro hijo como alternativa.

Verificaciones realizadas el 15/09/2026:

- 85 pruebas HTTP, compatibilidad v1, modelo v2, exportación y controles del aplicador: `node --test tests/internal-family-members.test.js tests/internal-family-certificates.test.js tests/family-schooling.test.js tests/employee-family-ui.test.js tests/employee-family-applier.test.js`.
- PostgreSQL real local: `scripts/rehearse-employee-family-members-local.mjs` aplica 064, la vuelve a aplicar, recrea un trigger ausente y ejecuta `scripts/tests/064-employee-family-members.test.sql` dentro de una transacción que termina en rollback. Incluye permisos, reasignación, corte equivalente, reemplazo GRH, PDF inválido y cuotas, nombres Unicode bajo collation C, gemelos, documento opcional, deduplicación e inmutabilidad. Ensayo completo aprobado a las 02:55:38 UTC.
- Concurrencia real: `scripts/rehearse-employee-family-concurrency-local.mjs` ejecuta dos operadores y dos claves sobre el mismo hijo sin DNI. Comprueba espera efectiva por bloqueo y una sola alta en READ COMMITTED; rechazo sin escritura en REPEATABLE READ/SERIALIZABLE y replay. Cierre aprobado a las 03:05:58 UTC, con 120 tablas/5 vistas originales y todas las huellas de datos, secuencias, DDL, funciones y ACL restituidas. Un primer teardown rechazó eliminar sesiones sintéticas por un trigger preexistente; la transacción de limpieza se revirtió, se recuperaron sólo los objetos/IDs inventariados y el ensayo completo se repitió con limpieza exacta exitosa. Evidencia privada conservada fuera de Git. PostgreSQL fue liberado al siguiente ensayo.
- Navegador: `node scripts/build-friendly.mjs` y `node scripts/verify-family-schooling-browser.mjs`, 35 escenarios aprobados con datos y PDF sintéticos sobre el build real, sin sesión municipal ni escrituras backend. Incluye alta mínima con cuota PDF agotada, ACK perdido/replay sin duplicación, alta conservada ante PDF fallido, permiso revocado, identidad cambiada, referencias propias/GRH, acceso desde Personas/Nómina, Excel completo y diseño móvil/teclado. Un 401/403 durante descarga, carga o alta limpia datos consultados y autoridad; conserva únicamente el formulario local pendiente y exige revalidación antes de guardar. Una acción de descarga ya desprendida no puede reenviar tras la revocación. El script comprueba que los cuatro assets construidos coincidan con las fuentes, sin superponer código de desarrollo.
- Suite general compartida: `npm test`, 2.928/2.928 aprobadas; `git diff --check` sin errores.

Capturas revisadas: `verification/family-schooling-declaration-mobile-qa.png`, `family-schooling-declaration-desktop-qa.png`, `family-schooling-own-pdf-error-qa.png` y `family-schooling-own-certificate-qa.png`. Resultado automático: `verification/family-schooling-browser.json`. Son pruebas locales; no prueban un alta municipal en producción.

El aplicador dedicado exige `--expected-checksum=<sha256 revisado>`, `--confirm-operational-branch=<rama autorizada>` y `--backup-report=<informe privado>`; rechaza argumentos duplicados/malformados antes de conectar. Requiere un backup cuyo archivo coincida con el SHA, restauración verificada y antigüedad menor a 24 horas. `DATABASE_URL` debe señalar expresamente el endpoint operativo existente, puerto 5432, base `neondb`, usuario owner y TLS: no reescribe un destino recibido. Por defecto hace rollback; sólo `--apply=true` confirma.

La verificación conserva cada fila anterior de certificados, blobs y eventos mediante hashes, permitiendo anexos legítimos durante el ensayo. Compara exactamente las definiciones/ACL anteriores de 057 y los ACL de sus tablas. No compara conteos de fichadas, sesiones ni timestamps de conectores, y no pausa su recepción. Mide `pg_database_size`, tamaño total de cluster y espacio real por encima de la reserva de 16 MiB antes, después del DDL y al finalizar. El nuevo SELECT de evidencia también fue ejecutado correctamente en la restauración local, sin imprimir IDs ni hashes.

La aplicación efectiva y publicación corresponden al integrador; siguen pendientes. No se activará la interfaz nueva antes de la aplicación controlada de 064. Volver al código anterior conserva registros y documentos; no se restaura toda la base ni se eliminan altas. La selección operativa GRH de 066/067 no forma parte de este incremento ni fue activada por estas pruebas.
