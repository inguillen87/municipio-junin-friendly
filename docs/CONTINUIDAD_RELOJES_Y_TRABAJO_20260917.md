# Continuidad de relojes e inicio por funciones — 17/09/2026

## Incidente real y alcance de la corrección
Se encontró PM-10 capturando en el equipo autorizado, pero con su emisor detenido desde las 09:18 UTC por EPERM. El supervisor conservaba captura activa y había agotado sus tres arranques de envío. La cola y los recibos se validaron íntegramente antes de reanudar: 11.591 registros fuente conservados localmente, 11.547 confirmados y 23 partes pendientes, que contenían 44 registros. Estos conteos son del archivo local y no se equiparan al tamaño de una tabla canónica de eventos.

Se incorporó reemplazo atómico de archivos con reintentos acotados para errores EPERM/EACCES/EBUSY en Windows: seis esperas, 1.575 ms en total, siete intentos máximos. No elimina el destino, no cambia permisos del sistema operativo y conserva el archivo anterior y el temporal ante fallo definitivo. No reinterpreta disco lleno, archivo inexistente, corrupción, rechazo HTTP o credenciales inválidas como errores recuperables. Los renombrados de directorios y el protocolo de exclusión entre procesos no se modificaron.

La prueba no identifica qué proceso bloqueó el archivo; no se atribuye el incidente a antivirus sin evidencia. Antes del despliegue local se comprobaron lectura del token sin mostrarlo, hashes de lotes y recibos e I/O en archivos sintéticos separados. Se guardó el módulo previo y un parte privado de mantenimiento. El supervisor se detuvo de forma ordenada; se instalaron dos módulos verificados, se utilizó el comando existente de reanudación tras revisar el fallo y se reinició. No se borraron capturas, recibos, identidades, plantillas ni registros del reloj.

El servidor confirmó después 23 partes y 44 registros fuente desde la recuperación, con recepción a las 12:54:05 UTC. La permanencia de procesos y cola actual deben comprobarse por separado al finalizar. El watchdog existente de Windows continúa habilitado. Su alcance es la sesión del usuario: no se garantiza funcionamiento con la computadora apagada, sin red municipal o sin sesión. La operación permanente municipal requiere un host de servicio y prueba de reinicio/suspensión/corte de red con responsables.

## Otros cinco destinos documentados
Se recuperaron las direcciones del inventario privado ya entregado, no se solicitaron nuevamente ni se hizo un barrido. Una comprobación acotada por destino validó la ruta municipal y la respuesta de protocolo; los cinco devolvieron requerimiento de clave de comunicación. No se intentaron contraseñas ni se reutilizó la de PM-10. No se descargaron fichadas ni se asignaron puntos.

Pendiente técnico preciso: cargar por vía privada la clave conocida de cada equipo, leer y contrastar serial/modelo, confirmar su asociación con el punto existente y ejecutar una extracción aprobada. Una IP accesible o la cantidad de filas no define un PM. La futura flota debe mantener endpoint, identidad, credencial, cola y checkpoint separados; fallo o serie inesperada de un equipo no habilita reasignaciones ni paraliza otros. No retirar el límite de destino del lector PM-10 para simular una flota.

## E0 · Inicio con todas las funciones disponibles
El panel conserva su vista principal y agrega secciones desplegables de revisión y consulta cuando el perfil tiene esas capacidades. Preparar ya no oculta la posibilidad de revisar otros casos. Cada enlace exige el permiso de la operación y el de su pantalla. Los perfiles jurídicos llegan al registro y a las comparaciones sin inventar facultades salariales. El acceso de consulta de relojes queda explícito.

Los números muestran accesos disponibles, no pendientes municipales. No hay consultas adicionales al abrir secciones. Se usan disclosures nativos con teclado, objetivos táctiles y estilos adaptables. Cambiar permisos o perder sesión limpia los enlaces anteriores del DOM. No se amplió ningún rol ni se eliminaron controles del servidor. La búsqueda general de módulos se conserva; aún no se entrega un buscador de pendientes ni una bandeja con conteos reales.

## Evolución de Mariano: del documento a una actuación municipal
Prioridad funcional propuesta para #40/#41: una bandeja de asuntos, no otro repositorio aislado. Cada asunto vincula normas/versiones, proyecto, expediente o contrato; identifica iniciador, responsable, próxima actuación, plazo con fundamento y nivel de reserva. Un enlace a una fuente nunca concede permisos sobre el asunto. No se implementa aún esta entidad en este incremento.

1. **Mesa de revisión:** presentación, asignación, devolución con motivo, respuesta y cierre. Estados administrativos separados de vigencia jurídica; quién revisó una transcripción no equivale a quien emitió un dictamen. El mismo responsable puede preparar y revisar asuntos distintos, con control por operación.
2. **Ficha de impacto:** artículos relacionados, dependencias afectadas y acciones propuestas. Una reforma de un artículo podría generar una tarea a Contaduría, no cambiar el salario automáticamente. Toda propuesta debe abrir su versión y fuente exactas.
3. **Obligaciones contractuales:** responsable, prestación, garantía, fecha y cláusula de origen, evidencia de cumplimiento y escalamiento. La alerta debe explicar qué hay que hacer; enviado, recibido y cumplido son hechos distintos. Empezar por un caso completo antes de agregar calendarios decorativos.
4. **Calidad documental:** cola de extracción de texto nativo y revisión por página. Cambiar el PDF invalida una revisión de transcripción anterior. No inferir firma, fecha o artículo faltante. Extracción local bajo demanda antes de IA externa sobre documentación reservada.
5. **Visión de Dirección:** estado agregado de asuntos y plazos con cobertura declarada, sin revelar títulos de expedientes reservados. Un cero real no debe confundirse con error o falta de permiso.

Aceptación de E5: un responsable crea un asunto autorizado, otro recibe la tarea, devuelve una observación fundamentada, la respuesta conserva fuentes/versiones y el cierre queda auditado. Notificaciones idempotentes y recuperación ante respuesta perdida, sin firma ni aprobación jurídica implícita. Esto complementa el registro y comparador publicados; no los reabre como pendientes.

## Continuidad salarial y despliegue
#37 mantiene topes oficiales versionados, turno/calendario y permisos homologados, reglas ejecutables con bases y redondeo y conciliación por legajo/concepto. Las marcaciones recuperadas alimentan evidencia; no acreditan horas pagables, presentismo ni ausencias por sí solas.

Validar suite completa de aplicación, agente y protocolo, Inicio mixto, registro/comparación legal, preparte y alta nativa. El despliegue agrupa código y reutiliza el runner productivo existente; las pruebas visuales usan API sintéticas y no prueban una operación municipal real. No enviar el inventario privado ni los registros de mantenimiento a GitHub.

Reversión del cambio web: revertir exclusivamente el commit, sin restaurar datos. Reversión local: parada ordenada, restauración del módulo respaldado, verificación y arranque; preservar todos los lotes y recibos. No usar rollback de tablas para una corrección de navegación o del agente.

## Evidencia de cierre local de este incremento
A las 13:04 UTC, el emisor informó `queue_confirmed`, 11.591 registros del archivo local confirmados y cero partes restantes. A las 13:05 UTC, captura y emisor seguían en ejecución bajo el supervisor. Neon confirmó las 23 partes/44 registros recuperados. No se afirma que estos conteos sean el padrón de empleados ni un período de asistencia completo.

Pruebas locales: 3.460 de aplicación aprobadas sin fallos ni omisiones; agente 270 casos (265 aprobados, cinco específicos de otra plataforma omitidos en Windows); once controles del contrato emisor/receptor; siete grupos del Inicio mixto. Volvieron a aprobar seis grupos de alta nativa, ocho de preparte, once del registro normativo y ocho del comparador. Se inspeccionaron capturas del Inicio en escritorio y móvil. Los recorridos de interfaz utilizan cuentas y respuestas sintéticas y no crean registros municipales; la recuperación del agente sí reenvió exclusivamente registros fuente reales ya capturados, con los recibos del servicio existente.
