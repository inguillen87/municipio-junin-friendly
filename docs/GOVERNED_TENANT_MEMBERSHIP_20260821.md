# Acceso global y membresía operativa gobernada — corte 2026-08-21

## Decisión ejecutiva

Una misma persona puede administrar la plataforma SaaS y operar RR.HH. de Junín, pero son dos autorizaciones distintas:

1. `PLATFORM_OWNER` gobierna tenants, usuarios, roles y auditoría del control plane.
2. `TENANT_RRHH_ADMIN_OPERATIVO` habilita lectura nominal y preparación de cambios únicamente en un tenant explícito.
3. Ninguno de esos roles es un rol PostgreSQL ni recibe `SUPERUSER`, `CREATEROLE`, `CREATEDB` o `BYPASSRLS`.
4. Un tenant futuro no se hereda. Requiere una membresía separada o, en una fase posterior, una concesión temporal aprobada y con vencimiento.

Este diseño permite que una persona autorizada vea legajos de Junín y prepare altas/cambios sin romper el aislamiento entre gobiernos ni la separación entre carga, aprobación y liquidación.

## Estado comprobado

| Elemento | Estado |
|---|---|
| Identidad administrativa auditada | `PLATFORM_OWNER` de aplicación; sin rol legado adicional acreditado |
| Rol PostgreSQL nominal / `SUPERUSER` | No existe; no se creará |
| Membresía operativa Junín | No acreditada en el último corte remoto |
| Usuarios/roles en Vercel o `.env` | No; pertenecen a PostgreSQL |
| Migración 013 | Fresh apply de 34 sentencias y reapply verificados en Neon QA descartable |
| Preview / Producción | Sin deploy ni cambio de datos de este corte |

La contraseña escrita en una conversación no es un canal de provisión. No debe copiarse a Git, Vercel, `.env`, comandos, logs ni archivos de entrega. Una identidad existente sólo se asocia después de estar activada como identidad administrada y tener MFA vigente.

## Perfil `TENANT_RRHH_ADMIN_OPERATIVO`

El perfil base permite:

- consultar resumen, estructura y legajos;
- consultar analítica y detalle nominal de ausencias;
- consultar políticas, simulaciones y solicitudes de licencia no restringidas;
- consultar calidad, linaje, acciones y analítica de gestión;
- proponer cambios de legajo, registrar ausencias/licencias y operar solicitudes de área dentro de alcances explícitos;
- consultar mayor esfuerzo y consultar/proponer fuentes y catálogos horarios versionados.

El perfil base excluye deliberadamente:

- lectura salarial, presupuesto aprobado, salud o licencias restringidas;
- aprobación de legajos, validación de ausencias y aprobación de licencias;
- aprobación o posting de horas extra;
- creación de roles PostgreSQL o acceso directo a tablas.

Las capacidades sensibles, si el municipio las autoriza, requieren un grant explícito y auditado; no forman parte del rol base. El flujo funcional completo para crear un legajo todavía debe implementarse sobre `employee.record.propose`: tener la capability no equivale a afirmar que la pantalla y el workflow ya existen.

## Controles de la migración 013

- Alta de membresía para una identidad existente, sin crear ni modificar credenciales.
- Reactivación sólo desde estado suspendido y con versión esperada.
- Sesión global administrada, MFA y capability `platform.users.manage` obligatorios.
- Tenant activo, binding GRH verificado y release exacto certificado.
- Identidad objetivo activa, administrada y con MFA.
- Tenant y rol explícitos; sin comodines ni herencia futura.
- Solicitud con vencimiento real a 24 horas. La persona decisora debe ser distinta tanto de quien solicita como de la cuenta objetivo. La cuenta objetivo sí puede solicitar su propia membresía; con exactamente dos propietarios, ese es el flujo que permite que el otro propietario decida.
- Validación de segregación de funciones dentro de la misma transacción.
- Limpieza revocatoria atómica de autoridad anterior y revocación de sesiones al reactivar; los overrides `deny` se preservan.
- Idempotencia ligada a actor, sesión, versión, release y payload.
- Evento append-only; el fundamento libre se conserva como hash SHA-256 en el contexto de auditoría.
- Runtime `NOINHERIT` con `EXECUTE` sólo sobre fachadas aprobadas y sin DML directo.

## Camino de activación real

1. **Cumplido en QA:** aplicar 005–013 en una rama Neon descartable y verificar fresh apply, reapply, ACL y casos adversariales estructurales.
2. Desplegar exactamente esos bytes en Preview con secretos de identity v2 y conexión runtime no-owner exclusivos de Preview.
3. Migrar/activar la cuenta mediante el flujo administrado y enrolar MFA; no reutilizar la contraseña escrita en el chat.
4. En la UI, elegir **Asociar cuenta existente**, Junín y `TENANT_RRHH_ADMIN_OPERATIVO`, con fundamento verificable. Si sólo existen dos propietarios y la cuenta objetivo es uno de ellos, esa misma cuenta debe presentar la solicitud para que el otro propietario quede disponible como decisor.
5. Probar lectura positiva de legajos y negativas de salario, aprobaciones, posting y otro tenant.
6. Probar suspensión, reactivación, revocación de sesión y auditoría.
7. Sólo con esa evidencia repetir el procedimiento autorizado en Producción.

## Evolución multi-gobierno

El soporte global futuro debe usar acceso JIT: solicitud, aprobación por una persona distinta del tenant, capabilities exactas, motivo/ticket, vencimiento corto, sesión acotada y revocación inmediata. No se implementará una membresía perpetua automática para todos los gobiernos.
