# Módulo 10 — fuente normativa anual propia

Noelia pide comparar los cargos liquidados con los presupuestados de cada año. Este incremento implementa el registro anual normativo necesario para esa comparación: propuesta, revisión por otra persona, aprobación/rechazo, versiones inmutables y descarga completa. No declara terminada la comparación ni asigna cargos a empleados.

En `/estructura`, la planta anual propia aparece antes de los agregados históricos. Se consulta un ejercicio explícito. Cada fila conserva jurisdicción, códigos presentes en la fuente, descripción institucional, unidad, cantidad exacta y referencia. Los códigos ausentes permanecen nulos. Los cargos y el personal contratado usan enteros; las horas conservan hasta 18 decimales como límite de representación, sin redondeo ni equivalencias inventadas. La capacidad de 1000 filas se rechaza completa, sin recortar ni crear páginas como versiones.

El resumen oficial de Junín2026 puede prepararse voluntariamente como borrador cuando no hay filas en edición. Reutiliza la fuente pública ya verificada de la Ordenanza1.021/2025, artículo7: once grupos con unidades heterogéneas. Su SHA256 fue contrastado de nuevo con el PDF oficial en esta ejecución. Es resumen del articulado, no las planillas anexas ausentes ni el detalle de cada cargo. El año de emisión del PDF de estructura no determina ejercicio o vigencia.

La búsqueda y la paginación afectan sólo a la vista. El CSV contiene todas las filas de la versión aprobada, ejercicio, revisión y fuente. Neutraliza fórmulas, conserva códigos y cantidades como textos exactos. No incluye personas, legajos, DNI ni importes de haberes. La descarga revalida versión y sesión. Ocultar la página, cerrar sesión o revocar lectura retira los datos de la vista. No se persisten en localStorage ni se envían a otro servicio.

SQL127 agrega una tabla vacía y once funciones; el runtime sólo ejecuta tres fachadas. Define `workforce.structure.prepare` y `workforce.structure.approve`, sin asignarlas a cuentas o roles. La lectura exige `workforce.employee.read` y `workforce.structure.read`. Proponer o decidir requiere una identidad municipal vinculada; aprobar/rechazar exige otra persona, además de otra membresía y correo. Las decisiones no sustituyen la aprobación legal de la norma. Los intentos se conservan por clave y huella; un reenvío no cambia contenido ni duplica el evento. Una propuesta antigua puede rechazarse, pero no aprobarse sobre una versión anual cambiada.

No extrae ni reconstruye la integración histórica bloqueada de PR50/SQL111 presupuestario, ni SQL114/115 o el resolvedor/evaluador rechazados. El contexto del tenant conserva su vinculación certificada; ninguna consulta del registro usa GRH como motor o como fuente de posiciones anuales.

Pendientes del módulo10: incorporar y revisar los anexos autorizados, vincular posiciones propias por vigencia y conservar esa asignación en la liquidación original, cotejarla contra la versión anual aplicable y emitir el PDF comparativo simple/detallado. La liquidación propia actual conserva convenio, categoría y repartición; esos datos no bastan para inferir el cargo presupuestario histórico. La habilitación de nuevos permisos y la aceptación de Noelia/Hugo son estados separados de instalación y publicación.

## Descarga de la comparación propia · corrección local del 24/10/2026

El estado anterior corresponde al incremento del 06/10. La ruta posterior de comparación propia está montada en `/estructura` mediante `position-comparison-panel.js` y consulta `detail-v2`; no debe confundirse con el cotejo documental de presencia `budget-payroll*`.

Se corrigió una carrera en esa descarga: después de esperar la huella final, se vuelve a comprobar que la consulta siga vigente y conserve permiso antes de comparar la huella o crear el archivo. Ocultar la página, retirar el acceso, cerrar sesión o cambiar la consulta durante esa espera impide descargar. Una huella antigua distinta tampoco retira una consulta nueva.

Cuatro pruebas focales reproducen la retirada durante el hash final y la consulta nueva, y conservan controles positivos PDF/Excel/CSV. Montan el panel y cliente reales con DOM, autorización, modelos, hashes y renderizadores sintéticos; no importan el motor. Esta evidencia acredita la guarda de interfaz, no el contenido de un PDF real, los contratos de dominio, PostgreSQL, publicación o disponibilidad municipal del módulo completo.

La revisión posterior de Claude confirmó esa corrección y encontró la misma carrera en el primer hash de la exportación. Se añadieron guardas antes de iniciar el trabajo, después de sus lecturas asíncronas y después de ese primer hash: una operación retirada no invalida una consulta nueva ni inicia más lecturas o renderizadores por esa continuación.

La suite focal ampliada aprueba diez casos: seis nuevos y cuatro previos; cinco fallaban contra el panel anterior. Conserva los controles de ambos hashes y PDF/Excel/CSV sintéticos. No se cambió el cliente compartido: una sesión ya iniciada todavía requiere su propia revisión para impedir mutaciones internas tardías. Las guardas de este panel frenan la continuación de la exportación; no acreditan una corrección general de autenticación ni el cierre municipal del Módulo 10.
