# Auditoría de identidad y roles — 2026-08-21

## Respuesta ejecutiva

- La identidad administrativa consultada tiene rol global SaaS `PLATFORM_OWNER`; la auditoría actual no acreditó además un rol legado de administración interna.
- No tiene una membresía municipal explícita; por diseño no obtiene acceso implícito a legajos, sueldos ni salud.
- No es `SUPERUSER` de PostgreSQL y no posee un rol PostgreSQL nominal propio.
- Tampoco está activada como identidad v2 administrada ni tiene un factor MFA activo en el corte productivo consultado.
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

Las variables de entorno sólo contienen configuración y secretos técnicos. El inventario Vercel revisado por nombre, tipo y scope no contiene usuarios, roles ni contraseñas como configuración. `ACTIONS_DATABASE_URL` está limitado a Producción y falta en Preview; `IDENTITY_TOKEN_PEPPER` e `IDENTITY_MFA_ENCRYPTION_KEY` no están configuradas. No se consultaron ni documentaron valores.

El archivo local `.env.local` está ignorado por Git. Contiene únicamente configuración técnica de infraestructura, sesión y OIDC; no contiene usuarios, roles ni contraseñas nominales.

## Estado real frente a la UI

El catálogo productivo ya define:

- `PLATFORM_OWNER`;
- `TENANT_ADMIN`;
- `JUNIN_RRHH_OPERADOR`;
- `JUNIN_RRHH_APROBADOR`;
- `JUNIN_TESORERIA_CARGA`.

El entorno productivo auditado todavía conserva el control plane anterior y no ejecuta este corte de identity v2. Las migraciones 012 y 013 no están instaladas allí. La consulta remota fue estrictamente de lectura: no creó membresías, MFA, roles PostgreSQL, usuarios ni sesiones. El detalle de endpoints y cardinalidades se mantiene en evidencia restringida. La rama de trabajo local contiene cambios aún no incorporados a `origin/master`.

El código local sí implementa invitación, activación, MFA, suspensión, cambio de rol, capacidades permitidas/denegadas y revocación de sesiones. La suite IAM ampliada pasó 107/107 y la suite completa/build pasó 566/566. Eso prueba contratos y compilación local; no demuestra usuarios multirol funcionando end-to-end en Producción.

Después de esta auditoría se agregó localmente la gobernanza 012 para `PLATFORM_OWNER`: solicitud y decisión por personas distintas, MFA, protección del último owner, versionado, idempotencia, revocación de sesiones y auditoría. También se confirmó que un owner en contexto Plataforma puede invitar al primer `TENANT_ADMIN` de Junín sin darse una membresía operativa. El bootstrap excepcional del segundo owner queda fuera del runtime web y exige doble evidencia auditada. 012 fue aplicada y reaplicada únicamente en la rama Neon QA descartable; este corte no provisionó usuarios productivos y no hubo deploy.

Después de la auditoría se agregó la migración 013 para cerrar dos de esos gaps: asociar una identidad administrada existente a un tenant explícito y reactivar una membresía suspendida. Ambas operaciones exigen sesión global con MFA, release y binding GRH certificados, identidad objetivo managed con MFA, versión/idempotencia, SoD, expiración y auditoría append-only. También se agregó el perfil portable `TENANT_RRHH_ADMIN_OPERATIVO`, con lectura de legajos y preparación de cambios, pero sin salario, salud, aprobaciones o posting. 013 completó fresh apply y reapply en PostgreSQL QA; no fue desplegada ni usada para modificar la cuenta auditada.

Persiste el gap de administrar plantillas de rol. También persiste el flujo funcional completo de alta/cambio de legajo: `employee.record.propose` es una capability catalogada, no una pantalla transaccional terminada. El contrato y el procedimiento están detallados en `docs/GOVERNED_TENANT_MEMBERSHIP_20260821.md`.

## Entrega segura de acceso

No se deben entregar contraseñas por chat, TXT, Git ni variables Vercel. El circuito correcto es:

1. `PLATFORM_OWNER` prepara una invitación para un correo nominal.
2. El backend genera un enlace one-time con expiración y guarda sólo su hash.
3. El usuario define su propia contraseña y configura MFA.
4. La membresía se activa con municipio, rol y capacidades efectivas explícitas.
5. Cada cambio posterior exige motivo, versión esperada y auditoría; la sesión anterior se revoca.

Puede generarse un TXT o CSV **sin secretos** con nombre, municipio, rol, estado y capacidades para control operativo. Las credenciales nunca deben incluirse allí.

## Gate para una demo multirol verdadera

1. **Cumplido:** acreditar una rama Neon QA descartable.
2. **Cumplido:** aplicar y revalidar migraciones 005–013 en esa rama.
3. Completar los requisitos criptográficos faltantes sólo en Preview, mediante el gestor de secretos y sin documentar valores ni postura nominal en Git.
4. Desplegar la rama autorizada a Preview, no a Production.
5. Invitar cuentas nominales para administración municipal, operador, aprobador, tesorería y auditoría.
6. Activar cada cuenta por enlace one-time y MFA.
7. Probar en navegador permisos positivos y negativos, aislamiento entre municipios, cambio/revocación de rol y auditoría.
8. Recién con esa evidencia promover los mismos bytes y migraciones autorizados.
