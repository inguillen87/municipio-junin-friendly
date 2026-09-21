# Pases y actuaciones del expediente - Fase 2B - 20/09/2026

Línea de tiempo append-only para pases, providencias, notas, constancias, informes, dictámenes incorporados y otras actuaciones.

El área actual no se edita en una columna: se deriva del último pase. Cada escritura exige expectedCaseRevision, expectedSequence y fromArea actual para evitar que dos operadores pisen movimientos concurrentes.

Un pase requiere destino distinto; las demás actuaciones no cambian área. Toda actuación puede citar opcionalmente un documento exacto del expediente mediante FK.

No hay UPDATE/DELETE/TRUNCATE. Lectura requiere legal.norm.read; escritura legal.norm.register y sesión gestionada. No se envían notificaciones automáticas, no se firma ni se concluye vigencia o validez jurídica.