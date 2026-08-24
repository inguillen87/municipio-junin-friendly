# QA 014 — Vinculación gobernada de la fuente GRH

Fecha de evidencia: 2026-08-24 UTC.

## Resultado

La rama descartable de Neon `br-plain-dust-acpjgebb` quedó acreditada por la
propia conexión PostgreSQL antes de cualquier escritura. El proyecto corroborado
fue `noisy-poetry-54471701`, la base `neondb` y el prerrequisito 013 estaba
instalado con su ledger vigente.

La migración `014-governed-source-binding-provisioning` se aplicó y se reaplicó
con el mismo checksum SHA-256
`f4da934c2b0cd0f416e52969b79d94edc59ff7afa2be54906e9959b01d8b5b63`.
El aplicador validó además ownership, `SECURITY DEFINER`, `search_path`, ACL,
membresías de rol, ausencia de DML directo y allowlist exacta del runtime.

## Prueba dinámica reversible

El gate ejecutó un actor, sesión MFA y tenant exclusivamente sintéticos dentro de
una transacción. Consumió la evidencia canónica existente del snapshot GRH real:
un único batch publicado y 2.450 contratos canónicos para la empresa fuente
configurada. No interpreta ese conteo como empleados activos ni como fichadas o
turnos homologados.

Se verificó la secuencia completa:

1. estado inicial con único comando `bind_source`;
2. vinculación acreditada y replay idempotente;
3. estado pendiente con único comando `certify_data_plane`;
4. certificación con `deliveryReady=false`;
5. estado final sin nuevos comandos;
6. `ROLLBACK` y control posterior con cero usuarios, roles, sesiones, tenants,
   políticas, bindings o eventos fixture residuales.

## Superficie visible

`administracion-plataforma.html` incorpora un onboarding GRH reanudable. Sólo se
muestra con contexto Plataforma, tenant seleccionado, sesión MFA y capability
`platform.tenants.manage`. La UI separa vinculación de certificación, conserva
la idempotencia ante timeouts, elimina coordenadas del DOM después del éxito y
no convierte una caída del servicio en una falsa falta de permisos.

La API usa únicamente el SHA de release del servidor, respuestas minimizadas y
fachadas PostgreSQL ligadas a sesión y versión. No publica base, empresa, batch,
actor, fundamento, PII ni coordenadas internas.

## Límites honestos

- El backup entregado es una fuente municipal real en formato MariaDB y ya tiene
  datos canónicos útiles. La migración 014 gobierna cómo se vincula esa fuente;
  no convierte el snapshot en conexión GRH en tiempo real.
- No se persistió automáticamente el binding real de Junín: esa decisión queda
  como acción humana MFA y auditable en la nueva pantalla.
- Calendarios, turnos, reglas de fichada y relojes siguen sin homologación
  operativa 2026. El catálogo puede modelarlos, pero no debe inventarlos.
- Producción no recibió migraciones, variables, push de `master`, promoción ni
  cambios de datos durante este gate.
- Usuarios, roles, membresías y permisos viven en PostgreSQL. Vercel conserva
  sólo secretos de infraestructura; no se guardan contraseñas de usuarios en
  variables, `.env` ni archivos descargables.

## Gate de promoción futuro

Antes de Producción deben existir una migración remota controlada 005–014,
variables de infraestructura separadas owner/runtime, autenticación nominal MFA,
smokes de no-sesión y sesión real, y promoción del mismo SHA ya verificado en
Preview. Hasta entonces, Preview/QA y Producción son estados distintos.
