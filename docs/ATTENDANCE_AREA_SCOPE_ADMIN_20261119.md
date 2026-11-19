# Áreas de asistencia por cuenta · migración 243

## El problema

La asistencia por áreas limita cada lectura al área exacta concedida a la cuenta (`attendance_area_scope`). La tabla existía desde la composición del 19/11, pero no había función ni pantalla que la escribiera: nadie podía recibir un área.

## Qué hace

Dos fachadas nuevas y una sección en **Administración → «Áreas de asistencia»**:

- **Quién.** Sólo la administración de la plataforma, con la misma comprobación de sesión que el resto de Administración (contexto plataforma, segundo factor, persona administradora vigente). Leer exige `platform.users.manage`; conceder o retirar exige además `platform.roles.manage`.
- **Qué concede.** Un área exacta (repartición y sector; «sin sector» es un área propia, no un comodín) para una cuenta y una de las cuatro capacidades de asistencia por área. No hay alcance de todo el municipio ni herencia.
- **Qué no concede.** Capacidades. Un área concedida a una cuenta que no tiene la capacidad queda inerte hasta que se le asigne en «Usuarios y roles». La pantalla lo muestra.
- **Controles.** Referencia de autorización obligatoria, control del conjunto que la persona vio (si cambió, se pide actualizar), clave de envío idempotente, registro en la auditoría de identidad y en el historial propio de cada alcance. Nadie decide sus propias áreas. Retirar siempre es posible, incluso para una cuenta suspendida o un área que salió del catálogo.

## Pasos para habilitar a una cuenta

1. Administración → Usuarios y roles: asignarle la capacidad «Consultar asistencia por área» (y las de relojes esperados si corresponde).
2. Administración → Áreas de asistencia: concederle cada repartición y sector, con su referencia.
3. Personal → Vigencia de área de los contratos adoptados: una persona prepara la declaración y otra la aprueba (migración 244).
4. Relojes esperados por área: declarar los relojes de cada contrato.

## Ensayo

Sobre una copia aislada de la base operativa, con `plpgsql_check` sin hallazgos:

- Lectura: 5 cuentas (4 pueden recibir áreas; la propia no), 83 reparticiones y 36 sectores seleccionables.
- Conceder, repetir el mismo envío, retirar y volver a conceder dejan versiones 1, 2 y 3 con sus tres registros de auditoría.
- Rechazos verificados: conjunto desactualizado, misma clave con otro pedido, área fuera del catálogo, capacidad fuera de las cuatro, referencia corta, cuenta inexistente, asignación a sí mismo, retiro de un alcance que no existe y borrado directo de la fila.
- Las fachadas rechazan una sesión de plataforma que no existe.
