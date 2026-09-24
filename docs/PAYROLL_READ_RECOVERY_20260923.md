# Recuperación de consultas salariales — 23/09/2026

## Incidencia y causa comprobada

El control de sesión utilizado por historial, detalle y biblioteca de liquidaciones también ejecutaba la comprobación global de separación de funciones de escritura. Un perfil con lectura salarial vigente y permisos de preparación/aprobación incompatibles recibía `TENANT_IAM_SOD_CONFLICT`, incluso sin intentar modificar o aprobar nada. La API convertía el error en un 503 genérico de base. La reproducción utilizó el control SQL real, no una simulación de esa comprobación.

## Corrección de alcance limitado

La migración 105 crea `employee_payroll_assert_read_session_v1`, privada, y la utilizan únicamente las tres funciones existentes de historial, detalle y biblioteca. Conserva usuario y membresía activos, sesión vigente, versión, MFA, inactividad, tenant, fuente certificada, habilitación operativa y permisos nominales actuales. El contexto retornado sólo contiene capacidades de lectura. Las consultas conservan sus filtros de origen, precisión numérica y auditoría.

No modifica roles, asignaciones de permisos, las funciones compartidas de aprobación, la regla global de separación de funciones ni los datos salariales. Un conflicto de preparación/aprobación continúa bloqueando los circuitos que necesitan resolverlo; no debe impedir la lectura ya autorizada. El runtime no recibe permiso para ejecutar directamente la nueva función auxiliar ni consultar tablas de salarios.

La API distingue sesión vencida (401), autorización/configuración del rol (403), concurrencia transitoria (409) y disponibilidad/configuración técnica (503). Los mensajes son propios y los diagnósticos contienen sólo código, recurso y una referencia generada; nunca mensajes SQL arbitrarios, documentos, importes o credenciales. La interfaz permite reintentar la primera consulta; ante pérdida de permisos retira los importes previamente mostrados.

## Validación y publicación

Las pruebas SQL reutilizan una base local vacía, datos sintéticos y las funciones reales. Las dos representaciones de código previamente certificadas se prueban de forma independiente, con ejecución repetida de la migración y rollback integral: 117 comprobaciones por variante en PostgreSQL 17 local. El flujo CI ejecuta también PostgreSQL 18. Se preservan los hashes de datos, permisos y controles compartidos. La interfaz real de legajos pasa 14 recorridos de consulta, exportación, denegación, recuperación y móvil con API sintética.

`apply-payroll-read-session.mjs` hace preflight de sólo lectura por defecto. Aplicar exige destino explícito, huella de migración, funciones compatibles y una transacción con tiempos acotados, control de permisos/origen sin cambios y registro de migración. La evidencia de aplicación a Neon y la entrega de Vercel se verifican por separado; este documento por sí solo no prueba un despliegue ni una sesión real de un usuario municipal.

## Independencia operativa: no confundir cierres

Esta corrección no promueve el respaldo del 22/09. El preflight de esta entrega identifica todavía la fuente activa del 10/09/2026. La actualización multiliquidación, la conciliación presupuesto/liquidado, los recibos masivos firmados y la aceptación con una sesión nueva de la operadora continúan siendo hitos distintos. No se sobrescriben las operaciones nativas ni se transforma una consulta en una aprobación.
