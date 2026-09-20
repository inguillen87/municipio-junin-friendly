# Bandeja de asuntos jurídicos - release 20/09/2026

## Circuito

Primera versión nativa de la Mesa de Revisión de Mariano. Un asunto parte de una versión exacta del Registro normativo y conserva estados administrativos separados de la vigencia jurídica: assigned, in_review, returned, responded, reviewed, closed y cancelled.

El flujo operativo es Asignado → En revisión → Devuelto con observaciones → Respondido con evidencia → Revisado → Cerrado. También existen cancelación, reapertura y cambio explícito de responsable/área. Cada transición crea un evento nuevo; no se reescribe el historial.

Una devolución exige observaciones. Una respuesta exige evidencia y puede citar un artículo existente en la versión normativa fuente. Una cita no cambia la vigencia ni sustituye el PDF original. Cerrar/cancelar exige dejar vacía la próxima actuación; reabrir crea una revisión nueva con motivo.

## UX/UI

La bandeja muestra conteos por estado, búsqueda, filtros, responsable, próxima actuación y fecha objetivo interna. Los conteos corresponden al filtro completo y no son expedientes ni plazos legales.

Antes de guardar se presenta Antes/Propuesto y fundamento. Si el asunto cambia concurrentemente no se envía el POST: la propuesta se conserva y el usuario debe adoptar explícitamente la revisión actual. Una respuesta perdida puede consultarse con la misma clave de idempotencia.

Los responsables provienen únicamente de membresías activas y habilitadas para Jurídica en el mismo municipio. Elegir una persona no concede permisos. La pérdida de permiso borra el borrador y la información privada de la vista.

El Registro normativo y Revisión documental enlazan la versión exacta a Crear asunto jurídico. La navegación del área incluye Asuntos jurídicos, Agenda de seguimientos, Registro normativo y Revisión documental.

## Base de datos

Migración 082 instalada en PostgreSQL 18.6 aislado y PostgreSQL 17.11 operativo. SHA-256 de la migración: 2fb36f364c773fd6d4537c1055314e0899ee0ef27a263879ce6b657a886dd006.

La función legal_matter_operation_v1 tiene la misma huella pg_get_functiondef en ambos destinos: 00fd1c564a847cb261b347b52320dd3f79536cea56cd91358418b59f3344d827.

En ambos destinos: 0 asuntos, 0 eventos al instalar; el rol aplicativo no tiene acceso SELECT/INSERT/UPDATE/DELETE directo sobre legal_matter_event, no puede ejecutar el helper de lectura y sí puede ejecutar la fachada controlada.

## Verificación

Regresión completa: 3.877 pruebas aprobadas, 0 fallos. El navegador real compilado pasó 12 recorridos del circuito completo, incluidos 320/390 px, devolución, evidencia, cierre, reapertura, respuesta perdida, concurrencia, reasignación y pérdida de permiso.

En PostgreSQL 18 se ejecutaron 14 controles de comportamiento con municipio, usuarios y norma sintéticos en una transacción revertida. Se comprobó el ciclo completo, rechazo de versión obsoleta y rechazo de UPDATE directo. Tras rollback: 0 asuntos, 0 eventos y ninguna identidad sintética persistida.

## Límites

Esta fase todavía no implementa expediente municipal ni registro contractual. El asunto sólo vincula una versión normativa exacta. Tampoco envía notificaciones, firma dictámenes, determina vigencia o modifica personal/nómina.

Relojes, VPN, fuentes GRH, liquidaciones y planes no se modifican en este release.