# Motor de relaciones normativas - Fase 1 - 21/09/2026

Relaciones explícitas y revisadas entre versiones exactas de normas municipales. Tipos iniciales: cita/referencia, modifica, deroga, deroga parcialmente, complementa, reglamenta, prorroga/extiende y otra relación.

Los extremos normativos son inmutables: source_norm_id/source_norm_version y target_norm_id/target_norm_version. Los artículos son opcionales pero, cuando se informan, deben existir en la metadata de la versión exacta.

La relación tiene eventos append-only Declarada/Cancelada. Cancelar o reabrir no cambia tipo, artículos ni fundamento; crea otra revisión de estado.

MuniControl no infiere derogación, modificación, vigencia o validez por similitud textual. Esos tipos sólo aparecen cuando una persona con legal.norm.register los declara con fundamento.

Lectura requiere legal.norm.read. Escritura requiere legal.norm.register y sesión gestionada. Runtime sin acceso DML directo a las tablas.
