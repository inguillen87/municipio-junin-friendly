# Auditoría de identidad y roles — 2026-08-21

## Respuesta ejecutiva

- La identidad administrativa consultada tiene rol global SaaS `PLATFORM_OWNER` y un rol legado de administración interna.
- No tiene una membresía municipal explícita; por diseño no obtiene acceso implícito a legajos, sueldos ni salud.
- No es `SUPERUSER` de PostgreSQL y no posee un rol PostgreSQL nominal propio.
- La auditoría confirmó que los usuarios multirol solicitados todavía no estaban provisionados. El identificador consultado, la cardinalidad exacta de cuentas y el inventario nominal se mantienen fuera de Git para evitar enumeración y phishing dirigido.

La verificación fue agregada y redactada: no se imprimieron correos completos, contraseñas, tokens, URLs de conexión ni otros secretos.

## Dónde se guardan identidades y permisos

Los usuarios y roles pertenecen a PostgreSQL, no a variables de entorno:

| Responsabilidad | Persistencia correcta |
|---|---|
| Identidad base | `internal_users` |
| Rol global SaaS | `platform_user_role` |
| Rol por municipio | `tenant_membership` |
| Excepciones allow/deny | `tenant_membership_capability_override` |
| Invitaciones | `tenant_invitation` y, con identity v2, secreto one-time hash-only |
| Auditoría | `tenant_iam_event` / eventos de identidad |

Las variables de entorno sólo contienen configuración y secretos técnicos. El inventario revisado no contiene usuarios, roles ni contraseñas como configuración. Los nombres, scopes y ausencias exactas de controles se conservaron fuera del repositorio; el resultado operativo relevante es que los requisitos criptográficos de identity v2 todavía no están completos en el entorno objetivo.

El archivo local `.env.local` está ignorado por Git. Contiene únicamente conexión de infraestructura y secreto de sesión; no contiene usuarios ni roles.

## Estado real frente a la UI

El catálogo productivo ya define:

- `PLATFORM_OWNER`;
- `TENANT_ADMIN`;
- `JUNIN_RRHH_OPERADOR`;
- `JUNIN_RRHH_APROBADOR`;
- `JUNIN_TESORERIA_CARGA`.

El entorno productivo auditado todavía conserva el control plane anterior y no ejecuta este corte de identity v2. El detalle de endpoints, migraciones instaladas y cardinalidades se mantiene en evidencia restringida. La rama de trabajo local contiene cambios aún no incorporados a `origin/master`.

El código local sí implementa invitación, activación, MFA, suspensión, cambio de rol, capacidades permitidas/denegadas y revocación de sesiones. Las suites focalizadas pasaron 65/65. Eso prueba contratos locales; no demuestra usuarios multirol funcionando end-to-end en Producción.

Después de esta auditoría se agregó localmente la gobernanza 012 para `PLATFORM_OWNER`: solicitud y decisión por personas distintas, MFA, protección del último owner, versionado, idempotencia, revocación de sesiones y auditoría. También se confirmó que un owner en contexto Plataforma puede invitar al primer `TENANT_ADMIN` de Junín sin darse una membresía operativa. El bootstrap excepcional del segundo owner queda fuera del runtime web y exige doble evidencia auditada. Nada de esto cambia Producción: 012 no fue aplicada, este corte no provisionó usuarios y no hubo deploy.

Persisten tres gaps funcionales que no deben ocultarse: asociar una identidad existente a un segundo municipio, reactivar una membresía suspendida y administrar plantillas de rol. El catálogo actual sí permite asignar roles existentes y overrides `allow/deny` por membresía.

## Entrega segura de acceso

No se deben entregar contraseñas por chat, TXT, Git ni variables Vercel. El circuito correcto es:

1. `PLATFORM_OWNER` prepara una invitación para un correo nominal.
2. El backend genera un enlace one-time con expiración y guarda sólo su hash.
3. El usuario define su propia contraseña y configura MFA.
4. La membresía se activa con municipio, rol y capacidades efectivas explícitas.
5. Cada cambio posterior exige motivo, versión esperada y auditoría; la sesión anterior se revoca.

Puede generarse un TXT o CSV **sin secretos** con nombre, municipio, rol, estado y capacidades para control operativo. Las credenciales nunca deben incluirse allí.

## Gate para una demo multirol verdadera

1. Acreditar una rama Neon QA descartable.
2. Aplicar y revalidar migraciones 005–009 en esa rama.
3. Completar los requisitos criptográficos faltantes sólo en Preview, mediante el gestor de secretos y sin documentar valores ni postura nominal en Git.
4. Desplegar la rama autorizada a Preview, no a Production.
5. Invitar cuentas nominales para administración municipal, operador, aprobador, tesorería y auditoría.
6. Activar cada cuenta por enlace one-time y MFA.
7. Probar en navegador permisos positivos y negativos, aislamiento entre municipios, cambio/revocación de rol y auditoría.
8. Recién con esa evidencia promover los mismos bytes y migraciones autorizados.
