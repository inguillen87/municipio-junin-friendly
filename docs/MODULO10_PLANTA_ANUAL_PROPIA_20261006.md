# Módulo 10 — fuente normativa anual propia

Noelia pide comparar los cargos liquidados con los presupuestados de cada año. Este incremento implementa el registro anual normativo necesario para esa comparación: propuesta, revisión por otra persona, aprobación/rechazo, versiones inmutables y descarga completa. No declara terminada la comparación ni asigna cargos a empleados.

En `/estructura`, la planta anual propia aparece antes de los agregados históricos. Se consulta un ejercicio explícito. Cada fila conserva jurisdicción, códigos presentes en la fuente, descripción institucional, unidad, cantidad exacta y referencia. Los códigos ausentes permanecen nulos. Los cargos y el personal contratado usan enteros; las horas conservan hasta 18 decimales como límite de representación, sin redondeo ni equivalencias inventadas. La capacidad de 1000 filas se rechaza completa, sin recortar ni crear páginas como versiones.

El resumen oficial de Junín2026 puede prepararse voluntariamente como borrador cuando no hay filas en edición. Reutiliza la fuente pública ya verificada de la Ordenanza1.021/2025, artículo7: once grupos con unidades heterogéneas. Su SHA256 fue contrastado de nuevo con el PDF oficial en esta ejecución. Es resumen del articulado, no las planillas anexas ausentes ni el detalle de cada cargo. El año de emisión del PDF de estructura no determina ejercicio o vigencia.

La búsqueda y la paginación afectan sólo a la vista. El CSV contiene todas las filas de la versión aprobada, ejercicio, revisión y fuente. Neutraliza fórmulas, conserva códigos y cantidades como textos exactos. No incluye personas, legajos, DNI ni importes de haberes. La descarga revalida versión y sesión. Ocultar la página, cerrar sesión o revocar lectura retira los datos de la vista. No se persisten en localStorage ni se envían a otro servicio.

SQL127 agrega una tabla vacía y once funciones; el runtime sólo ejecuta tres fachadas. Define `workforce.structure.prepare` y `workforce.structure.approve`, sin asignarlas a cuentas o roles. La lectura exige `workforce.employee.read` y `workforce.structure.read`. Proponer o decidir requiere una identidad municipal vinculada; aprobar/rechazar exige otra persona, además de otra membresía y correo. Las decisiones no sustituyen la aprobación legal de la norma. Los intentos se conservan por clave y huella; un reenvío no cambia contenido ni duplica el evento. Una propuesta antigua puede rechazarse, pero no aprobarse sobre una versión anual cambiada.

No extrae ni reconstruye la integración histórica bloqueada de PR50/SQL111 presupuestario, ni SQL114/115 o el resolvedor/evaluador rechazados. El contexto del tenant conserva su vinculación certificada; ninguna consulta del registro usa GRH como motor o como fuente de posiciones anuales.

Pendientes del módulo10: incorporar y revisar los anexos autorizados, vincular posiciones propias por vigencia y conservar esa asignación en la liquidación original, cotejarla contra la versión anual aplicable y emitir el PDF comparativo simple/detallado. La liquidación propia actual conserva convenio, categoría y repartición; esos datos no bastan para inferir el cargo presupuestario histórico. La habilitación de nuevos permisos y la aceptación de Noelia/Hugo son estados separados de instalación y publicación.

## Cliente de cargos y descarga de comparación · 24/10/2026

El estado anterior corresponde al incremento del06/10. La ruta posterior de comparación propia está montada en `/estructura` mediante `position-comparison-panel.js` y consulta `detail-v2`; no debe confundirse con el cotejo documental de presencia `budget-payroll*`.

Cada consulta o comando del cliente de cargos tiene una operación propia con ticket, señal y métodos de sesión/lectura. Los tres paneles —asignación, cargos capturados y comparación— usan esa operación. Antes y después de recibir cuerpos asíncronos se comprueba que siga vigente; una respuesta retirada no interpreta la autoridad ni entra al trabajo de otra consulta. Una operación vencida o finalizada tampoco puede iniciar otra petición. El error de timeout vigente se informa incluso si el trabajo local retorna sin descargar.

La exportación conserva sus guardas entre lecturas y huellas. Ocultar, cerrar sesión, revocar acceso o cambiar la consulta impide que una descarga vieja continúe o retire un resultado nuevo. La actualización periódica verifica sesión con su propia operación.

Un intento pendiente de asignación conserva objeto, clave y cuerpo originales. Recuperar o reintentar captura ese intento antes de esperar la sesión; la respuesta sólo puede limpiar ese mismo objeto. Otro montaje no puede sobrescribirlo mientras espera su comprobación previa. Esto conserva la recuperación explícita, sin POST automático desde una continuación vieja ni duplicación por cambio de clave.

Validación local:28casos únicos,18nuevos y10regresiones de M10. Montan paneles y cliente reales con DOM, autenticación, verificadores, modelos, hashes y renderizadores sintéticos; no importan el motor. Se comprobaron respuestas tardías, cambio de cuenta, timeout, claves/cuerpos pendientes y controles PDF/Excel/CSV. No acredita archivos reales, cálculo, contratos de dominio, PostgreSQL, navegador, publicación o disponibilidad municipal del módulo completo. Un transporte que nunca retorna no está cubierto por una garantía nueva de resolución anticipada; se comprueba su inercia si retorna después del aborto.

## Asignación consultada desde varias vistas · 25/10/2026

Si otra vista resuelve el envío o crea un pendiente mientras la primera esperaba una respuesta, la vista vigente explica lo ocurrido y ofrece consultar nuevamente o recuperar ese envío. Conserva el intento, su clave y su cuerpo; no realiza otro envío ni cambia el resultado mostrado en la otra vista. Una operación retirada mantiene el mensaje de retirada.

Verificación local:30 casos únicos con el mismo arnés sintético, incluidos dos nuevos de resolución y sustitución del pendiente desde otra vista y una comprobación ampliada del envío concurrente. Son mejoras de información al operador; se mantienen los límites de validación y publicación anteriores.
