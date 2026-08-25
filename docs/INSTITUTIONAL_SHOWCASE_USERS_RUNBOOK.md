# Perfiles institucionales para una muestra controlada

Este runbook prepara tres identidades diferenciadas sobre un tenant ya certificado:

- owner de plataforma, con `PLATFORM_OWNER` global y
  `PLATFORM_OWNER_OPERATIVO_INTEGRAL` en el tenant: lectura integral más
  preparación operativa, sin decisiones reservadas al aprobador;
- aprobador institucional, con `HUGO_APROBADOR_INTEGRAL`, vínculo laboral GRH real y alcance empresa para decidir licencias;
- consulta integral, con lectura amplia y sin comandos de decisión o mutación.

El buzón de segundo factor puede ser el mismo temporalmente. Sigue siendo solo un destino de entrega: las identidades, sesiones, membresías y eventos de auditoría permanecen separadas. El script nunca guarda contraseñas en el repositorio o Vercel, nunca las envía como SQL en claro y nunca imprime contraseñas ni el destino MFA.

## Límites deliberados

- No crea empleados ni inventa una relación laboral. El aprobador requiere un `employment_contract.id` canónico o el par único `legacy_company_id + legacy_legajo` del GRH certificado.
- No otorga `SUPERUSER`, `CREATEROLE` ni otro rol del motor PostgreSQL.
- No convierte el owner global en aprobador: se conserva maker-checker. El owner prepara y administra; el aprobador decide.
- El factor email queda `pending` o `verified` según el estado existente. Con
  `020-email-first-factor-login` verificada, un contexto privilegiado con factor
  email vivo entra al desafío por correo sin exigir enrolar TOTP primero.
- La configuración del routing compartido es independiente. Puede usar una
  expiración programada o quedar en modo de revocación manual con
  `expiresAt:null`; en este último caso permanece activa únicamente hasta que
  un responsable la retire explícitamente de las variables del entorno y
  vuelva a desplegar.

## Precondiciones

1. Migraciones requeridas instaladas sin drift. El script valida checksums exactos,
   incluidos `003-action-center`, `009-tenant-lifecycle-hardening` y
   `016-email-mfa-retry-idempotency`, `019-institutional-access-profiles` y
   `020-email-first-factor-login` y `021-platform-owner-operational-integral`,
   además de sus contratos finales.
2. Tenant activo con binding GRH verificado, plano de datos certificado y SHA de release vigente.
3. Rama QA acreditada desde Neon por branch id, host directo y base. Los tres
   pines deben coincidir con `DATABASE_URL_UNPOOLED`; nunca se acepta `-pooler`
   ni una rama conocida de Producción como QA.
4. Secretos existentes de cifrado/HMAC del factor email disponibles en el proceso.
5. Pepper dedicado del comando, de al menos 32 bytes, disponible solo en el proceso.
   Debe mantenerse estable si se reintenta el mismo UUID de operación; liga también
   passwords, nombres, identidades, motivo, empleo y destino sin persistirlos en claro.
6. Identificador laboral inequívoco del aprobador confirmado contra la fuente municipal.
7. UUID v4 nuevo para cada rotación. Reutilizarlo solo sirve para replay: el
   script vuelve a validar credenciales, membresías, roles, scopes, factor,
   empleo y ausencia de sesiones activas. Para cambiar passwords, nombres,
   identidades, empleo o destino se genera otro UUID.

## Variables requeridas

```text
SHOWCASE_PROVISION_CONFIRM
SHOWCASE_PROVISION_OPERATION_ID
SHOWCASE_PROVISION_REASON
SHOWCASE_PROVISION_COMMAND_PEPPER
SHOWCASE_TENANT_SLUG

SHOWCASE_OWNER_EMAIL
SHOWCASE_OWNER_DISPLAY_NAME
SHOWCASE_OWNER_PASSWORD

SHOWCASE_APPROVER_EMAIL
SHOWCASE_APPROVER_DISPLAY_NAME
SHOWCASE_APPROVER_PASSWORD

SHOWCASE_READER_EMAIL
SHOWCASE_READER_DISPLAY_NAME
SHOWCASE_READER_PASSWORD

SHOWCASE_SHARED_MFA_DESTINATION_EMAIL

# Elegir una sola estrategia:
SHOWCASE_APPROVER_EMPLOYMENT_CONTRACT_ID
# o ambas:
SHOWCASE_APPROVER_COMPANY_ID
SHOWCASE_APPROVER_LEGAJO
```

También se requieren las variables canónicas de conexión/pinning y los secretos ya usados por identidad:

```text
DATABASE_URL_UNPOOLED
CANONICAL_QA_BRANCH_ID
CANONICAL_QA_HOST
CANONICAL_QA_DATABASE
IDENTITY_EMAIL_MFA_PEPPER
IDENTITY_EMAIL_MFA_ENCRYPTION_KEY
```

Los pines `CANONICAL_QA_*` deben copiarse de evidencia independiente del panel
o API de Neon. No se derivan ni se adivinan desde la URL de conexión.

En Producción se agregan los pines:

```text
CANONICAL_PRODUCTION_BRANCH_ID
CANONICAL_PRODUCTION_HOST
CANONICAL_PRODUCTION_DATABASE
```

## Ejecución segura en una rama Neon descartable

No crear `.env` ni copiar valores sensibles al repositorio. Inyectarlos desde el gestor de secretos o cargarlos solo en el proceso actual. En PowerShell 7, `Read-Host -MaskInput` evita que las contraseñas se muestren:

```powershell
$env:SHOWCASE_PROVISION_CONFIRM = 'PROVISION_INSTITUTIONAL_SHOWCASE_IDENTITIES'
$env:SHOWCASE_PROVISION_OPERATION_ID = [guid]::NewGuid().ToString()
$env:SHOWCASE_PROVISION_REASON = 'Preparación institucional autorizada'
$env:SHOWCASE_PROVISION_COMMAND_PEPPER = Read-Host 'Pepper dedicado del comando (32+ bytes)' -MaskInput
$env:SHOWCASE_TENANT_SLUG = Read-Host 'Slug exacto del tenant'
$env:CANONICAL_QA_BRANCH_ID = Read-Host 'Branch ID QA corroborado en Neon'
$env:CANONICAL_QA_HOST = Read-Host 'Host directo QA corroborado en Neon'
$env:CANONICAL_QA_DATABASE = Read-Host 'Base QA corroborada en Neon'

$env:SHOWCASE_OWNER_EMAIL = Read-Host 'Login del owner'
$env:SHOWCASE_OWNER_DISPLAY_NAME = Read-Host 'Nombre visible del owner'
$env:SHOWCASE_OWNER_PASSWORD = Read-Host 'Password temporal del owner' -MaskInput

$env:SHOWCASE_APPROVER_EMAIL = Read-Host 'Login del aprobador'
$env:SHOWCASE_APPROVER_DISPLAY_NAME = Read-Host 'Nombre visible del aprobador'
$env:SHOWCASE_APPROVER_PASSWORD = Read-Host 'Password temporal del aprobador' -MaskInput

$env:SHOWCASE_READER_EMAIL = Read-Host 'Login de consulta'
$env:SHOWCASE_READER_DISPLAY_NAME = Read-Host 'Nombre visible de consulta'
$env:SHOWCASE_READER_PASSWORD = Read-Host 'Password temporal de consulta' -MaskInput

$env:SHOWCASE_SHARED_MFA_DESTINATION_EMAIL = Read-Host 'Buzón temporal de segundo factor'
$env:SHOWCASE_APPROVER_COMPANY_ID = Read-Host 'ID empresa GRH certificado'
$env:SHOWCASE_APPROVER_LEGAJO = Read-Host 'Legajo exacto del aprobador'

node scripts/provision-institutional-showcase-users.mjs --confirm-isolated-branch
```

El comando debe terminar con un resumen genérico de tres identidades, tres membresías y tres factores, sin nombres, emails, passwords ni destinos.

## Ejecución en Producción

Solo después de una QA satisfactoria en la rama descartable, usar el mismo artefacto y el branch id productivo fijado:

```powershell
node scripts/provision-institutional-showcase-users.mjs --confirm-production-branch=br-identificador-confirmado
```

El script además compara host, database y branch id contra las variables de pinning. Si cualquiera difiere, aborta antes de abrir la transacción.

## Evidencia esperada

- tres cuentas activas `auth_mode=managed`, con `internal_users.password_hash IS NULL`;
- tres hashes scrypt en `tenant_identity_password_credential`;
- cero sesiones anteriores activas después de la rotación;
- owner con `PLATFORM_OWNER` como único rol global activo y dos perfiles sin autoridad global;
- tres membresías activas sin overrides;
- vínculo laboral activo y único para el aprobador;
- cinco scopes operativos de empresa para owner y tres scopes de decisión para aprobador;
- un factor email vivo por identidad, con el mismo destination hash pero sin destino en claro;
- contratos email-first-factor 020 y owner operativo integral 021, más ACL
  runtime, verificados antes y después de provisionar;
- un `tenant_iam_event` append-only, sin credenciales ni buzón en el resultado.

## Cierre posterior a la muestra

1. Desactivar el routing temporal compartido.
2. Asignar un email individual por identidad y rotar cada factor.
3. Rotar las tres contraseñas con UUID de operación nuevos.
4. Conservar los perfiles y el historial de auditoría; no borrar eventos.
5. Repetir smokes autenticados de login, lectura, creación y aprobación con sesiones separadas.

## Limpieza de variables del proceso

```powershell
@(
  'SHOWCASE_PROVISION_CONFIRM', 'SHOWCASE_PROVISION_OPERATION_ID',
  'SHOWCASE_PROVISION_REASON', 'SHOWCASE_PROVISION_COMMAND_PEPPER',
  'SHOWCASE_TENANT_SLUG',
  'SHOWCASE_OWNER_EMAIL', 'SHOWCASE_OWNER_DISPLAY_NAME', 'SHOWCASE_OWNER_PASSWORD',
  'SHOWCASE_APPROVER_EMAIL', 'SHOWCASE_APPROVER_DISPLAY_NAME',
  'SHOWCASE_APPROVER_PASSWORD', 'SHOWCASE_READER_EMAIL',
  'SHOWCASE_READER_DISPLAY_NAME', 'SHOWCASE_READER_PASSWORD',
  'SHOWCASE_SHARED_MFA_DESTINATION_EMAIL',
  'SHOWCASE_APPROVER_EMPLOYMENT_CONTRACT_ID',
  'SHOWCASE_APPROVER_COMPANY_ID', 'SHOWCASE_APPROVER_LEGAJO',
  'CANONICAL_QA_BRANCH_ID', 'CANONICAL_QA_HOST', 'CANONICAL_QA_DATABASE'
) | ForEach-Object { Remove-Item -LiteralPath "Env:$_" -ErrorAction SilentlyContinue }
```
