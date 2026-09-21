# Novedades permanentes · contrato v1

Registro administrativo individual; aprobar habilita únicamente la exportación de control. No crea lotes, calcula haberes, paga ni modifica GRH. Cantidad e importe son declaraciones: `null` es distinto de `"0"`. No se infieren reglas del concepto 80 ni fechas finales.

API `/api/internal-payroll-fixed-novelties`, siempre `{ok:true,data}` o `{ok:false,code,error}`. Todas las consultas exigen `payroll.novelty.read` y `payroll.novelty.nominal.read`, sesión municipal MFA, binding y release certificados. Proponer suma `payroll.novelty.prepare`; revisar suma `payroll.novelty.approve`; ambas exigen vínculo laboral vigente del operador con persona identificada. Exportar suma `payroll.novelty.export`. Son capacidades existentes. Los permisos de cada fila se resuelven en servidor; no se crean vínculos ni permisos por nombre o correo.

GET exactos:

- Sin parámetros o `resource=bootstrap`: `data={version:"payroll-fixed-bootstrap.v1",principal:{tenantId,membershipId,certifiedBindingId,capabilities,employmentLinked},limits:{maxRecords:500,maxHistory:100},payrollTypes:["monthly","first_fortnight","sac","vacation","supplementary","final","other"],effects:{approvalEffect:"control_export_only",grhMutation:false,payrollCalculated:false,payrollPosted:false}}`.
- `resource=employee&legajo=...`: `data={version:"payroll-fixed-employee.v1",subject}`. Resuelve exactamente un contrato GRH activo y publicado; no busca por nombre.
- `resource=list` y opcional `periodMonth=YYYY-MM-01`: `data={version:"payroll-fixed-list.v1",periodMonth:null|date,rows:[record],total,snapshotToken:sha256,effects}`. Máximo 500; nunca trunca. Con período muestra registros cuya versión aprobada o última propuesta intersecta ese mes. No prorratea cantidades/importes. Anulaciones sin versión activa pueden consultarse sin período.
- `resource=detail&recordId=UUID`: `data={version:"payroll-fixed-detail.v1",record,history:[proposal]}`. Historial completo descendente por versión, máximo 100 propuestas.
- `resource=attempt&command=propose|review&key=UUID`: `data=receipt`, requiere también el permiso del comando; consulta exclusivamente el intento de la membresía y binding actuales. Un 404 tras respuesta perdida no prueba que el POST original haya terminado.
- `resource=export&periodMonth=YYYY-MM-01&snapshotToken=sha256`: `data={version:"payroll-fixed-export.v1",periodMonth,snapshotToken,rows:[{recordId,version,proposalId,subject,values}],total,effects}`. Devuelve sólo las versiones aprobadas vigentes que intersectan el mes, conserva los valores completos, y revalida identidad, permisos y huella de todo el resultado. Sin escrituras de exportación ni lotes.

`subject={contractId,legajo,employeeName:null|string,identityToken:sha256,sourceCutoff:timestamp}`. Identidad vinculada a contrato/persona/base/empresa/legajo; no cambia al refrescar un mismo vínculo. Nombre y corte son el snapshot de la propuesta original.

`record={id,version,subject,identityCurrent:boolean,approved:null|proposal,pending:null|proposal,latest:proposal,canPropose:boolean}`. `approved` es la última propuesta aprobada, incluida una anulación; una propuesta pendiente o rechazada no la reemplaza. `version` aumenta con cada propuesta o revisión.

`proposal={id,recordId,version,operation:"set"|"annul",values:null|values,reason,proposedAt,proposedBy,review:null|review,canReview:boolean}`.

`review={decision:"approve"|"reject",reason,reviewedAt,reviewedBy,version}`. Los autores son correos autenticados del servidor. No se confía en autores enviados por el cliente. El revisor debe ser una membresía y una persona diferentes del proponente; tampoco puede usar otra cuenta de la misma persona.

`values={conceptSourceId:string,costCenterSourceId:null|string,payrollType,quantityDecimal:null|string,amountCents:null|string,forced:boolean,forcedReason:null|string,legalInstrument:string,validFrom:date,validTo:null|date}`.

Concepto, legajo y centro: dígitos canónicos (0 o entero sin ceros iniciales), máximo 20. Son referencias declaradas, no una certificación de elegibilidad ni un catálogo normativo. Cantidad: hasta 12 dígitos enteros y 6 decimales, signo opcional; importe: centavos enteros hasta 18 dígitos, signo opcional. Se exige por lo menos uno; se rechaza cero negativo. Instrumento: 5–300 caracteres; motivo y fundamento: 5–500. Texto NFC, trim, sin controles ni etiquetas. `forcedReason` e importe explícito (`amountCents` distinto de `null`, incluido cero) obligatorios si `forced=true`; `forcedReason=null` si no. Fechas civiles 1900–2100; `validTo>=validFrom`; `null` significa final no informado, nunca 2050 automático. Períodos 1900–2100, siempre primer día del mes.

POST exacto `{command:"propose",payload:{recordId:null|UUID,expectedVersion:0|integer,contractId,legajo,identityToken,operation:"set"|"annul",values:null|values,reason}}`. Nueva alta: `recordId:null,expectedVersion:0,operation:"set"`. Cambio: ID y versión exactos consultados. Anulación: `operation:"annul",values:null`, exige una versión aprobada activa y conserva el original. Sólo una propuesta pendiente por registro; luego de rechazo puede proponerse otra contra la nueva versión exacta.

POST exacto `{command:"review",payload:{recordId,proposalId,expectedVersion,decision:"approve"|"reject",reason}}`. No rebase automático. La aprobación vuelve a comprobar identidad y que no haya solapamiento civil inclusivo con otra versión aprobada de la misma identidad, concepto, centro y tipo de liquidación. Una propuesta propia pendiente no altera la versión vigente.

Ambos POST requieren `Idempotency-Key: UUID`. `receipt={version:"payroll-fixed-receipt.v1",command,recordId,proposalId,recordVersion,duplicate:boolean}`. Primera respuesta 201, replay 200. Se conserva snapshot y clave tras respuesta incierta; un reintento exacto devuelve el mismo recibo incluso si después hubo otros cambios. Nunca cambiar datos/clave para resolver un envío incierto.

Errores controlados `PAYROLL_FIXED_*`: `VERSION_CONFLICT`, `PENDING_EXISTS`, `OVERLAP`, `IDENTITY_CHANGED`, `MAKER_CHECKER_REQUIRED`, `IDEMPOTENCY_REUSE`, `SNAPSHOT_CHANGED`, `SESSION_BUSY` (409), `NOT_FOUND` (404), `INVALID_PAYLOAD`/`DATES_INVALID`/`ROW_LIMIT` (422), `CAPABILITY_REQUIRED` (403), `CAPACITY_LIMIT` (503); autenticación/certificación se traduce desde el contexto existente. Ninguna respuesta expone mensajes SQL.

Almacenamiento compacto y privado, propuestas y revisiones inmutables. Cada mutación exige un margen conservador de 256 KiB (262144 bytes) por debajo del límite de 520093696 bytes del cluster, sin ampliar planes/conexiones. Las pruebas SQL generan fixtures en un esquema aislado con rollback y no acreditan operación municipal real.
