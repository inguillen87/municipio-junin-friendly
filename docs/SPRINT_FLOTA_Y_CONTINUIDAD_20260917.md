# Sprint · Flota de relojes y continuidad de Jurídica

## Decisión
Mantener un único lector MuniControl 4.1 compartido. Cada reloj tiene identidad verificada, estado, temporizador, cola y presupuesto de fallos independientes. Un gateway puede atender la red accesible; una sede sin ruta puede utilizar el mismo paquete con su configuración, no una copia divergente del programa.

PM-10 conserva su captura y envío actuales durante esta ampliación. Los cinco equipos adicionales utilizan el lector compartido desde una instalación multirreloj. El panel local reúne las seis fuentes, pero no sustituye la verificación de recepción del portal. No se reescribió el protocolo de autenticación ni la lectura por bloques.

## Implementado en este incremento
Captura configurada por serie; validación de ruta antes de leer la clave; comprobación de autenticación y serie antes de transferir; colas separadas, deduplicación exacta y recuperación conservadora. Cuota por equipo y espacio mínimo. Un archivo corrupto no se borra ni se reinterpreta como cola vacía.

Instalador de tarea Windows para usuario actual: revisión cada cinco minutos e inicio de sesión, respetando el intervalo de cada reloj y la detención manual después del ciclo. `IgnoreNew` y bloqueos durables evitan operaciones superpuestas. Panel local adaptable a escritorio y móvil sin información personal. La instalación no garantiza funcionamiento con el equipo apagado, suspendido o con la sesión cerrada.

**Límite explícito: los cinco equipos nuevos capturan localmente. Su recepción automática en Neon no forma parte de este incremento.** El remitente específico de PM-10 rechaza sus manifiestos; no se lo reutiliza cambiando solamente la IP. El cierre siguiente debe certificar equipo/punto/serie, contrato de envío, credencial independiente, acuse y visualización en el portal.

## UX del registro de Mariano
Un formulario sin cambios o cuyos cambios fueron revertidos no pregunta innecesariamente si se desea descartar. Los errores de artículos enfocan la etiqueta, texto o página exacta, sin perder los demás campos. Se separan filtros escritos de filtros aplicados: al volver desde una ficha o guardar una revisión se conserva el corte consultado. Se agregan filtros aplicados visibles y limpieza explícita.

No se cambia la API ni la autorización del registro. No se declara la extracción de PDF, firma, vigencia, expedientes o contratos como implementados por estas correcciones de interfaz.

## Continuidad del plan
Relojes: captura automática → recepción con acuse independiente → correspondencias de identidad revisadas → turnos/justificaciones → preparte. Una marca recibida no es por sí sola una jornada aprobada.

Noelia/Hugo: topes individuales oficiales con vigencia y fundamento; reglas versionadas; fórmulas y redondeos explicables; liquidación paralela por concepto y legajo; revisión y cierre. No reemplazar este circuito con más lecturas del backup GRH.

Mariano: preservar registro y comparación; vincular transcripción a la versión exacta del PDF y registrar revisión; luego asuntos/expedientes, pases, obligaciones contractuales y plazos. El análisis asistido deberá citar fuentes verificables y aplicar permisos antes de recuperar documentos. Una revisión documental no es un dictamen ni una declaración de vigencia.

## Verificación
Ejecutar la suite de la aplicación, la del agente y los recorridos de registro/comparador, legajo y preparte. La prueba del registro utiliza su validador real de entrada y PDF, pero autenticación y SQL sintéticos. Los ensayos del agente usan relojes simulados salvo la aceptación controlada de los cinco equipos autorizados. El panel local no hace peticiones remotas.

No se modifica la base, sueldos, cuentas, MFA ni configuración de los relojes. Datos fuente, IP, series y credenciales permanecen fuera del repositorio. La captura sólo usa comandos de lectura y liberación de buffer de transferencia, no borrado de registros.
