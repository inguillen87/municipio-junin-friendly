# Registro completo de licencias propias

Incremento de Personal y autogestión sobre SQL111/113 ya instaladas. El empleado vinculado a su contrato propio accede desde Centro de acciones; Personal accede desde la ficha. No necesita existir en GRH.

1. Abrir el registro y revisar las solicitudes, decisiones y saldos consultados completos.
2. Elegir **Descargar registro completo (CSV)** o **Descargar registro completo (Excel)**. La consulta vuelve a verificar cuenta, permisos, contrato, historial laboral y registro completo antes de producir el archivo.
3. Si algo cambió, la pantalla actualiza la consulta y exige revisar antes de otra descarga voluntaria. Ocultar la página, retirar permisos o recibir una respuesta incompleta descarta la descarga.

La búsqueda, el estado y la página sólo filtran la pantalla. Ambos archivos incluyen todas las solicitudes y cada versión histórica, con sus fechas originales, estado, responsable, evidencia y revisión expresa. También incluyen los saldos y todas sus declaraciones y decisiones. Una solicitud que cruza el año conserva su referencia y se distribuye en líneas por año; el control informa por separado solicitudes únicas y líneas.

Excel tiene cinco hojas: Solicitudes, Decisiones, Saldos, Declaraciones y Control, con encabezados inmovilizados y filtros completos. CSV distingue cada tipo de registro e incluye columnas específicas para el control. Los valores enteros son exactos; cero se conserva y un saldo desconocido o no aplicable permanece vacío con su tratamiento explícito. Días y minutos declarados no se convierten entre sí. Los textos se protegen contra interpretación como fórmulas en CSV; Excel usa celdas de texto literal.

Son archivos nominales de consulta privada para el contrato autorizado: legajo, nombre en el control, referencias de registro y responsables de decisiones. Se excluyen DNI/CUIL, observaciones libres, fundamentos, referencias documentales y tokens de identidad/ámbito. El navegador no persiste el registro en almacenamiento local ni transmite el archivo a un servicio externo.

La descarga está deshabilitada durante preparación, decisión o envío sin confirmar. Conserva el cuerpo y la clave de un intento pendiente. No genera otro guardado, aprueba una solicitud, acredita uso efectivo de licencia, calcula haberes o emite un documento firmado. No modifica APIs, tablas, permisos o colectores.

Validación: pruebas de formatos con lector Excel independiente, historial de varias versiones/años, unidades, cero/ausente, totalidad hasta el límite existente de 1.000 solicitudes y rechazo por exceso/incompletitud. Navegador sobre el build y handlers privados reales con SQL sintético: descarga de 75 solicitudes/225 decisiones bajo filtros, consulta cambiada, retirada de permisos, ocultación, respuestas tardías, intento incierto y controles móviles. La durabilidad/autorización SQL111/113 conserva sus suites PG17/PG18; la aceptación del primer registro municipal sigue separada.

Este cierre mejora el circuito propio de empleados y Personal. No cierra los módulos 6/7 de cálculo/anulación/confirmación, la importación OSEP completa, recibos institucionales, presupuesto anual ni operación física autónoma de relojes. Los frentes rechazados conservan sus bloqueos.
