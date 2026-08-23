# QA de identidad y membresías — 2026-08-21

## Resultado ejecutivo

Las migraciones de identidad y autorización 005–013 quedaron instaladas y revalidadas en una rama Neon descartable. La migración 013 realizó un `fresh apply` de 34 sentencias y una reaplicación idempotente con el mismo fingerprint. La conexión fue directa al endpoint de la rama QA, con rol owner de esa rama, y fue rechazada si no coincidían host, base, rol o condición no productiva.

Este resultado **no es un deploy ni una modificación de Producción**. No se creó ni se modificó ninguna cuenta nominal productiva, no se promovió la rama y no se guardaron contraseñas.

## Destino acreditado

| Campo | Evidencia |
|---|---|
| Rama | `qa-final-iam-013-20260821` |
| Branch ID | `br-plain-dust-acpjgebb` |
| Parent | `br-fancy-paper-acfshq9z` |
| Estado | `ready` |
| Primary | `false` |
| Protected | `false` |
| Expiración | `2026-08-28T23:59:59Z` |
| Conexión | Directa, no pooler |
| Base / rol | `neondb` / `neondb_owner` |
| Producción | Host distinto y bloqueado por el gate |

Las URLs completas y credenciales no forman parte de esta evidencia.

## Ledger verificado en PostgreSQL

| Versión | SHA-256 instalado |
|---|---|
| `005-tenant-identity-gateway` | `dca8ae5d6dd0c5481bd4b0b8ec9799048e813df8f2248d5533e6d34b49fb7392` |
| `006-tenant-action-authority` | `0d00147d965884f163b614d2fc1f8f167c27dd91060b101495c08b2275563e4a` |
| `007-action-center-read-facades` | `d0e04ca20e3b67518d1340fe38d409fc3c7b339da4dee20e7a6850ebadbc8a1e` |
| `008-governed-overtime-actions` | `70fab16c31bfe43ab9473448dd9f069fae35b4156ac7cea38169758a45386c21` |
| `009-tenant-lifecycle-hardening` | `d2152fe1df92ac646ada498b6140523a8bc3f13901ac49a95da13744dc72dfe4` |
| `010-governed-time-source-registry` | `66ab3584315db1baba52f08ac7579eddbe04898fd5fa2c383f4e778a2f1a7034` |
| `011-versioned-time-catalog` | `8b7aea9110b1cd230cbfa445729fa559446ee0809ae5c06ca1d0378fff4a2af3` |
| `012-platform-owner-governance` | `91396a7b02e4a46c8702137b3282c428735b33a9be52a47dd46f70741a95772d` |
| `013-existing-identity-membership-governance` | `32eb0a599a3071996121fab526ef6b93951eda12184cddee4a8f04e3ab970d3d` |

## Qué probó 013

- rol tenant exacto `TENANT_RRHH_ADMIN_OPERATIVO` y allowlist de capacidades;
- ausencia de permisos de salario, salud, aprobación y posting en ese perfil;
- alta para un único tenant y reactivación gobernada;
- maker-checker: la persona decisora debe ser distinta de la solicitante y de la cuenta objetivo; solicitante y objetivo pueden ser la misma persona, caso necesario cuando existen exactamente dos propietarios y uno solicita su propia membresía;
- identidad administrada y MFA tanto para operadores globales como para la cuenta objetivo;
- expiración real a 24 horas, versión esperada e idempotencia;
- release y binding GRH certificados;
- limpieza revocatoria atómica de autoridad anterior al reactivar, preservando overrides `deny`;
- auditoría append-only con contexto y hash recalculado dentro de PostgreSQL;
- ACL de runtime execute-only, sin DML directo, sin `SUPERUSER` y sin acceso automático a futuros tenants;
- ownership, funciones `SECURITY DEFINER`, `search_path`, triggers e índices catalogados.

El primer intento dinámico detectó que PostgreSQL deparsea `BETWEEN 3 AND 500` como límites `>= 3 AND <= 500`; el segundo detectó la agrupación canónica de la suma de 24 horas. Ambos intentos fallaron dentro de la transacción y ejecutaron `ROLLBACK`. El verificador se corrigió para aceptar exclusivamente las dos representaciones equivalentes, con negativos que rechazan otros límites, operadores o duraciones. Después, `fresh apply` y `reapply` finalizaron correctamente.

## Pruebas locales

- Suite IAM ampliada: 107/107.
- Suite focal de 013 y UX administrativa: 15/15.
- Suite completa y build: 566/566; PWA `build-c766d41887fb3c12`.
- Revisión estática independiente de 013: 0 hallazgos P0/P1/P2.
- Browser contractual lifecycle: 2 viewports, API totalmente interceptada, 0 mutaciones DB y 0 PII obsoleta renderizada.
- Browser contractual de fuentes temporales: 3 viewports, API totalmente interceptada, 0 mutaciones DB y evaluación mantenida cerrada.
- Browser contractual de membresías: desktop 1440×900 y mobile 390×844; 2 aprobaciones HTTP 200 y 2 asociaciones HTTP 202; APIs totalmente interceptadas, 0 DB, 0 `Authorization`, tenant futuro excluido y sin errores/overflow.

## Smoke dinámico maker-checker

El script reutilizable `scripts/smoke-existing-identity-membership-governance.mjs` ejecutó el flujo real dentro de una transacción con identidades exclusivamente sintéticas:

- owner A creó la solicitud y la membresía continuó ausente;
- la autoaprobación de owner A fue rechazada por maker-checker;
- owner B, distinto del solicitante y de la cuenta objetivo, aprobó;
- se creó una membresía activa sólo en el tenant QA y con rol exacto `TENANT_RRHH_ADMIN_OPERATIVO`;
- las 28 capacidades efectivas coincidieron exactamente con la allowlist y hubo 0 capacidades prohibidas;
- la respuesta acreditó que no creó rol PostgreSQL ni `SUPERUSER`;
- quedaron 2 eventos y 2 contextos ligados a solicitud, release, sesiones y hashes de fundamento;
- se ejecutó `ROLLBACK` y una conexión posterior confirmó 0 filas residuales de fixtures.

El smoke rechazó explícitamente el host productivo y endpoints pooled. Producción recibió 0 escrituras.

La certificación multipágina heredada no puede fabricar una sesión v2: el backend cierra expresamente el fallback legacy y Preview todavía no tiene base de identidad ni secretos criptográficos. No se reabrió ese control. La prueba end-to-end nominal en navegador queda pendiente hasta disponer de Preview gobernado; la UI nueva quedó validada con un contrato Playwright totalmente interceptado y sin credenciales.

## Límites y siguiente gate

- La única carga auxiliar de MFA en esta rama es una fixture QA no utilizable, necesaria para probar la gobernanza 012; no es una credencial de acceso.
- No se activó la cuenta nominal auditada ni se creó su membresía Junín.
- Falta configurar en Preview el data plane aislado y los secretos de identity v2.
- Falta invitar y activar al menos dos owners elegibles y cuentas representativas con MFA.
- Falta ejecutar pruebas positivas y negativas por rol, aislamiento entre tenants, revocación y auditoría con sesiones v2 reales.
- Producción sigue sin migraciones 012/013 y no recibió escrituras, push, deploy o promoción en este corte.
