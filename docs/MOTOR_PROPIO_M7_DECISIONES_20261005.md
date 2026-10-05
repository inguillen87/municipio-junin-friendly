# Módulo 7 · decisiones sobre el cálculo propio

Este incremento enlaza el resultado técnico de C2 con decisiones administrativas por legajo. El módulo7 histórico de SQL109 mantiene `payroll_calculated=false`: no acredita este circuito. Se usa el resultado calculado y congelado de SQL123, sin llamar a GRH ni delegarle el motor.

## Circuito implementado

En Nómina → **Confirmar y anular**, una persona autorizada consulta corridas calculadas de su ámbito, incluso las preparadas por otra persona. Revisa totales, conceptos, fuentes y decisiones antes de elegir legajos, convenios, reparticiones o todos los legajos **de esa corrida**. Búsqueda y página sólo afectan el detalle visible.

- Confirmar exige una persona distinta del preparador, no sólo otro correo o membresía. Registra una versión por legajo/período/tipo.
- Anular conserva la confirmación, el motivo y el resultado original. La nueva corrida puede confirmarse con la siguiente versión por legajo.
- Cancelar una preparación sin confirmar corresponde al preparador y no anula otra liquidación activa.
- Una liquidación confirmada de otro cálculo bloquea el mismo destino. Si cualquier legajo del alcance es incompatible, falla la decisión entera; no se omiten filas.
- Estado, alcance, resultado y ámbito se verifican en SQL dentro de una sola transacción. Los eventos son inmutables; la respuesta perdida se recupera con el mismo cuerpo y clave. Consultar no recalcula ni decide.
- El navegador retira datos nominales al ocultarse, cambiar de tarea, cerrar sesión o perder permisos. Un intento pendiente permanece sólo en memoria; no se guarda en localStorage.

La confirmación es una decisión administrativa sobre **las fuentes guardadas**. El resultado técnico anterior conserva sus hashes y sus banderas; no se reescribe para simular aprobación, contabilización o pago. Las reglas salariales siguen requiriendo su aprobación propia: los programas de prueba son inventados y no son normas municipales.

## Instalación y permisos

SQL124 agrega una tabla vacía, diez funciones y cuatro fachadas. Define `payroll.calculation.approve`, sin asignarla a personas ni roles. Confirmar/anular exige esa autoridad y todas las capacidades nominales existentes; cancelar exige preparar. No debilita el permiso ni la propiedad del lector de C2: la revisión usa una fachada separada y verifica el mismo ámbito certificado e identidad laboral.

Abrir un resultado preparado por otra identidad también exige esa autoridad específica; el permiso nominal general no basta. Su revocación retira la vista y no habilita un lector alternativo. El preparador conserva la consulta de su propio resultado con los permisos nominales vigentes.

El generador de instalación fija el código, las funciones anteriores y ambas bases existentes. Compara huellas de todos los datos y metadatos anteriores, roles, ACL, secuencias y vistas antes/después; verifica durabilidad desde otra conexión. Una respuesta incierta de instalación nunca se reintenta automáticamente.

## Verificación y pendientes

Pruebas unitarias, handler, PostgreSQL17/18 con COMMIT, instalación conservadora y navegador del paquete real. Las identidades, IAM y autenticación del ensayo son fixtures declarados. Los empleados son altas propias sintéticas; no existen en GRH. Se prueban separación por persona, alcances completos, concurrencia, historial, revocación real y recuperación sin duplicación.

Este incremento **no cierra todo el módulo7**. Faltan consolidación de decisiones de varias corridas por período, cierre propio, emisión institucional de recibos/planillas y entrega a contabilidad. Tampoco acredita parámetros municipales completos, aceptación de Noelia ni liquidaciones nominales reales. No activa relojes ni cambia firmas digitales.

Los14 puntos de relojes mantienen un circuito común; PM10 no es una arquitectura distinta ni un sustituto del parque completo. Su cierre requiere marca física → recepción → vínculo temporal → reglas homologadas de entradas/salidas/recreos/extras → revisión de Hugo/Personal → novedades → cálculo propio. Este incremento no presenta esa cadena como aceptada.
