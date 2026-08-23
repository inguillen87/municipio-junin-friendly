# Handoff para Codex — Junín Municipio Enterprise

Usá este contexto como fuente de verdad para alinear `municipio-junin` Enterprise con el trabajo de `municipio-junin-friendly`. No reinicies el análisis, no dupliques bases y no escribas en producción sin verificar primero el estado actual.

## Decisión de arquitectura

- **GRH es el sistema rector laboral municipal.** Debe gobernar personas laborales, legajos, situación contractual, nómina, movimientos, estructura y ausencias.
- **PERSONAS es una fuente auxiliar transversal.** Sólo enriquece identidad, domicilios y territorio. Nunca reemplaza ni sobrescribe empleo o nómina de GRH.
- No unir ambas bases por `IDPERSONA`: sólo coinciden seis IDs y ninguno representa la misma identidad.
- El vínculo correcto usa CUIL válido, DNI como respaldo, nombre normalizado y fecha de nacimiento como evidencia, conservando siempre los IDs originales y una tabla puente versionada.
- **Neon será la única base operativa/canónica compartida.** Friendly y Enterprise deben consumir la misma verdad, con APIs/roles separados; no crear una segunda copia en Supabase.
- **Cloudflare R2 será archivo privado**, destinado a dumps comprimidos, artefactos inmutables, manifiestos y backups verificables. R2 no sustituye las tablas operativas de Neon.
- Prisma es una capa ORM, no una base ni una cuota de almacenamiento.

## Fuentes verificadas

- Último snapshot GRH disponible: `grh_junin.backup_2026081915_plataforma.sql.gz`, SHA-256 `BCED0B174AAB977B085FC977723F7EDD8FB9E473ADCFBE237070E8ECEF982AA7`.
- El snapshot es un dump lógico MariaDB 10.3, no PostgreSQL: 257 tablas, 2.980 columnas y 6.586.360 filas.
- GRH: 2.349 personas y 2.450 legajos históricos.
- Estado administrativo actual: 882 legajos sin fecha de egreso, correspondientes a 814 personas.
- Fotografía abierta de liquidación agosto 2026: 854 legajos. Diferencia controlada: 28.
- Última liquidación cerrada verificable: julio 2026, 856 legajos con concepto 999.
- Snapshot 19/08: `calculo` 4.373.145 filas y `legamov` 492.127; el mart mensual canónico vigente en Neon aún corresponde al corte anterior y conserva 214.164 hechos.
- Snapshot 19/08: 31.622 ausencias y 3.448 licencias.
- Control horario real histórico: 30 turnos, 32 horarios, 9 tolerancias, 574 asignaciones, 163.634 jornadas esperadas, 958 fichadas, 55 feriados y 873 prenovedades.
- Fuentes operativas adicionales del 21/08: un padrón Excel con 387 identificadores únicos en 39 áreas; organigrama de 49 áreas; y 13 puntos de marcación con 11 K20, 1 SF300 y 1 MB360. Siete extraen por red y seis por medio removible. Son evidencia privada `discovered_not_homologated`, no datos ya importados.
- La cobertura horaria es principalmente 2000–2012, mientras haberes, movimientos y ausencias sí llegan a 2026. El backup es real y actual; la vigencia se certifica por tabla/dominio, no por fecha del archivo.
- PERSONAS: 96.777 personas y 273.314 domicilios.
- Crosswalk reproducido: 1.699 vinculadas, 157 ambiguas y 493 sin coincidencia, total 2.349 (72,3%).
- Hay 24 personas de GRH sin legajo. Deben conservarse con identidad fuente real; no crear placeholders ni descartarlas.

## Nómina y semántica obligatoria

- `histocal.CIER_31 = 1` es evidencia de cierre. Julio 2026 está cerrado; agosto 2026 está abierto/preliquidado.
- No publicar importes de una corrida abierta como oficiales.
- Los conceptos 990–999 se modelan por separado. La suma técnica de `IMPO_31` no es masa salarial, neto ni costo.
- Vista ejecutiva cerrada: bruto = 993 + 994 + 995; retenciones = 996; neto pagable = 999; proxy de costo empleador = bruto + 990.
- Todo KPI monetario es nominal y no comparable entre gestiones sin IPC, paritarias y cambios de escala.
- La diferencia 882/854 es un control operativo contra agosto abierto; no debe presentarse como comparación con julio cerrado.

## Estado técnico al 21 de agosto de 2026

- Repo rector de la aplicación Friendly: `municipio-junin-friendly`.
- `master` es la referencia publicable y Vercel Producción debe apuntar exactamente al mismo SHA. Los worktrees `-integration` se usan sólo para aislar desarrollo; no son otra aplicación ni otra verdad de datos.
- Proyecto Neon existente: `municipio-junin-friendly-internal` (`noisy-poetry-54471701`).
- Rama Neon aislada de QA: `codex-grh-integration-20260813` (`br-square-glade-aczgtll0`).
- Rama Neon descartable usada para IAM/tiempo 005–013: `qa-final-iam-013-20260821` (`br-plain-dust-acpjgebb`), no primaria, no protegida y con expiración automática el 28/08/2026.
- Neon `main` ya contiene y reconcilia 620 corridas, 854 asignaciones de agosto, 214.164 hechos mensuales, 489.459 movimientos y 2.450 controles de legajo.
- La verificación integral de `main` pasó 36/36 gates; julio cerrado es publicable, agosto abierto permanece bloqueado y la brecha 882/854 queda explicada 16/11/1.
- El proyecto está en Neon Launch con cómputo acotado a 0,25–1 CU. Existe una rama temporal previa a promoción con expiración automática y la rama aislada sigue disponible para QA.
- PERSONAS ya fue promovida con 2.349 decisiones: 1.699 matches, 157 ambiguas y 493 sin coincidencia; las 24 personas GRH sin legajo se preservan sin contratos inventados.
- Friendly ya expone, bajo sesión interna, directorio y ficha de empleados, estructura observada, integración, control de nómina, ausentismo operativo, asistente y centro de aprendizaje. Las vistas públicas continúan siendo agregadas.
- Calidad operativa usa una cola sólo lectura sobre lotes publicados: 589 incidencias abiertas, 581 advertencias y 8 errores. Se separan 556 incoherencias de período/mes de nómina, 25 controles de CUIL y 8 anomalías de fechas. PERSONAS con cero controles materializados se rotula como “no evaluado”, nunca como fuente perfecta.
- R2 está aprobado como estrategia, pero bucket, credenciales operativas y prueba de restauración todavía deben verificarse. No afirmar que existe un backup remoto hasta demostrar upload + readback/hash.
- La rama `codex/identity-gateway-benchmark` contiene trabajo todavía no incorporado a `origin/master`; no hubo push, Preview ni promoción de este corte.
- La auditoría de Producción confirma que IAM 004 todavía no ofrece una demo multirol operativa. La identidad global consultada administra la aplicación, no es PostgreSQL SUPERUSER y no hereda lectura operativa de Junín. Los identificadores y conteos detallados se mantienen fuera de Git.
- Identity v2 y lifecycle 005–009 están implementados/probados localmente, pero `/api/internal-identity` no existe en `origin/master` ni Producción. Vercel no guarda usuarios/roles/contraseñas y todavía faltan los secretos de identity v2.
- El registro de fuentes temporales 010A fue aplicado y reaplicado en la rama Neon descartable acreditada; no contiene todavía contratos municipales homologados ni habilita ingestión, evaluación o posting.
- El catálogo temporal 010B/011 fue compilado, aplicado y reaplicado en la misma rama con calendarios, turnos diurnos/nocturnos, reglas tipadas, asignaciones, vigencia, maker-checker, idempotencia y solapamiento semanal cíclico. No se importaron filas operativas ni se homologó vigencia 2026.
- La gobernanza global 012 permite solicitar/aprobar alta o baja de `PLATFORM_OWNER`, protege el último owner y deja el bootstrap excepcional del segundo owner fuera del runtime web. Fue aplicada y reaplicada sólo en QA; Producción no la tiene instalada.
- La gobernanza 013 permite asociar una identidad managed existente a un tenant explícito y reactivar membresías suspendidas, con MFA, release/binding certificado, SoD, idempotencia, revocación de sesiones y auditoría. Agrega `TENANT_RRHH_ADMIN_OPERATIVO` para lectura nominal/propuestas sin salario, salud, aprobaciones o posting. Superó fresh apply de 34 sentencias y reapply con fingerprint estable en QA; no fue aplicada a Producción ni a la cuenta auditada.
- El perfilador seguro `scripts/profile-grh-backup.mjs` reproduce inventario, huella, DDL y conteos agregados sin extraer valores ni PII.
- El manifiesto `contracts/grh-junin-mariadb-to-canonical.v1.json` mapea 29 tablas/212 columnas/57 FK del snapshot a dominios canónicos, reconoce PII autorizada y exige tenant, propósito, capability, staging y cuarentena antes de promover.
- El contrato agregado `contracts/junin-attendance-inputs.v1.json` conserva solamente conteos/modelos/canales de las tres planillas y planifica S006-C1..C6. No contiene nombres, identificadores, direcciones ni coordenadas. El cruce nominal futuro debe ejecutarse sólo dentro del data plane tenant-bound.

## Asistente y proveedores de IA

- `OPENAI_API_KEY` es una variable exclusiva del servidor. Friendly y Enterprise pueden usar la misma cuenta sólo si la variable se configura deliberadamente en cada proyecto de Vercel; nunca copiarla a HTML, Git, logs o documentación.
- OpenAI Responses es el proveedor primario para redactar explicaciones de hechos agregados y preseleccionados. Hugging Face es un único fallback; la respuesta determinística local debe seguir funcionando si ambos fallan.
- Búsquedas, fichas nominales, datos de ausencias con cohortes pequeñas, onboarding y guías de producto no salen a proveedores externos.
- El proveedor nunca recibe nombres, legajos, DNI, CUIL, domicilios, filas de incidencias, valores observados, payloads crudos ni el mensaje libre original del usuario. Sólo recibe un contrato agregado permitido por intención.
- Una respuesta de IA no reemplaza actos administrativos, autorizaciones, resoluciones ni validaciones de la fuente.

## Instrucciones para el agente Enterprise

1. Inspeccioná primero Git, variables y conexiones disponibles; nunca pegues ni registres URLs, tokens o contraseñas.
2. Tratá Neon `main` como producción. Para pruebas, creá o reutilizá una rama aislada y verificá que no sea default/protegida.
3. No reimportes un dump a ciegas ni construyas un modelo alternativo. Cada snapshot nuevo se perfila, registra como lote distinto, compara contra el publicado y sólo se promueve mediante staging, controles y reconciliación explícita.
4. Prepará Enterprise como consumidor modular de la misma base: RRHH, estructura, nómina y calidad primero; Hacienda/Tesorería sólo cuando exista una fuente real adicional.
5. No uses `IDPERSONA` entre sistemas, no auto-resuelvas los 157 ambiguos y no expongas personas/domicilios en vistas públicas.
6. Mantené Friendly simple y Enterprise profundo, pero ambos deben compartir definiciones, IDs canónicos, cierres y trazabilidad.
7. Antes de afirmar disponibilidad, exigí: migración idempotente, conteos exactos, conciliación financiera, prueba E2E, backup R2 con SHA-256 y restauración verificada.
8. Coordiná cualquier escritura de esquema/importación contra `master` y una rama Neon aislada; nunca tomes un nombre histórico de worktree como señal de que una migración sigue pendiente.

## Resultado esperado

Enterprise debe consumir la misma capa canónica de Neon sin migración paralela ni cifras inventadas. Informá por separado: validado localmente, validado en rama Neon, publicado en `main`, desplegado en Preview y desplegado en Producción.
