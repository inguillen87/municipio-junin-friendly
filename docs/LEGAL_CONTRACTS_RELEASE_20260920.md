# Registro contractual Fase 1 - 20/09/2026

Contrato versionado vinculado a un Asunto jurídico y, opcionalmente, a un Expediente ya relacionado con ese asunto.

Registra número/año/tipo, título, objeto, contrapartes revisadas (nombre, rol, CUIT opcional), moneda, importe en unidad menor, fechas declaradas, referencia de aprobación, responsable y motivo de cada revisión.

Editar ficha y cambiar estado son operaciones distintas. Editar no cambia estado; cambiar estado no modifica partes, objeto, monto, plazo, responsable ni vínculos. Estados: Registrado, En revisión, Activo administrativo, Finalizado administrativo y Cancelado administrativo.

Estos estados son operativos y no declaran vigencia, validez, firma, cumplimiento, pago, renovación o rescisión jurídica. No hay extracción automática de partes o montos.

Toda revisión es append-only, con idempotencia, actor/sesión y bloqueo transaccional. Lectura requiere legal.norm.read; escritura legal.norm.register.