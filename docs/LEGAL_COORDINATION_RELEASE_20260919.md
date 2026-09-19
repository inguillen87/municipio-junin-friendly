# Coordinación jurídica: responsable y próxima actuación - 19/09/2026

## Entrega cerrada

Se completa el circuito iniciado en los candidatos 6e24b0b/c458b53: cada seguimiento puede registrar responsable, próxima actuación y fundamento sin modificar la norma ni el estado del seguimiento.

La pantalla real internal-legal-coordination.html reutiliza el control de acceso municipal y exige legal.norm.read para consultar. Guardar sigue requiriendo legal.norm.register, sesión gestionada y los controles del servidor.

## UX y concurrencia

El funcionario ve responsable actual, próxima actuación e historial. Antes de guardar compara Antes/Propuesto y el motivo. Escape o Volver a editar conservan la propuesta.

La persona responsable sólo puede seleccionarse entre membresías activas del mismo municipio que conservan acceso jurídico. Si pierde elegibilidad, el antecedente permanece pero no puede reasignarse sin una selección válida.

Antes de confirmar se revalida coordinación, versión del seguimiento y elegibilidad. Un cambio concurrente bloquea el POST y conserva el texto local. Respuestas perdidas se recuperan con la misma clave de idempotencia.

## Base y permisos

Migración 081 instalada en PostgreSQL 17.11 operativo y PostgreSQL 18.6 aislado. La función principal tiene la misma huella SHA-256 en ambos destinos: b62e880ca21f6c8ead0b113cc38192d1a508733ac5bb120b7596564a001b7dd2.

El rol aplicativo no posee acceso directo a legal_coordination_event ni EXECUTE sobre el helper privado; sólo ejecuta la fachada. No se crearon eventos reales durante la instalación.

## Verificación

Regresión completa: 3.858 pruebas aprobadas, cero fallos. La página compilada pasó 12 recorridos de navegador del circuito nuevo y el módulo de seguimientos existente pasó 15 comprobaciones adicionales.

Las pruebas privadas usan identidades y respuestas sintéticas; no crean asignaciones municipales. La publicación se considera completa sólo después de verificar SHA del commit, Vercel READY, igualdad de assets y recorridos publicados.

No se modifican relojes, VPN, nómina, planes, fuentes GRH ni permisos asignados a funcionarios.