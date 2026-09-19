# Coordinacion juridica: nucleo candidato verificado, no publicado en produccion

## Estado del corte

Esta rama conserva el backend de responsable y proxima actuacion del seguimiento. No esta fusionada a master, no se aplico su migracion al esquema public y no hay un nuevo formulario operativo. La interfaz nueva y la alternativa de comparacion de historiales no pudieron guardarse por bloqueos de las herramientas. No se declaran como implementadas ni se recrearon por otra via.

La base de produccion permanece en el release 424b13c. La rama candidata es un punto de continuacion con codigo y pruebas, no una entrega funcional lista para los funcionarios. El objetivo siguiente es cerrar interfaz, accesibilidad, confirmacion, revalidacion y pruebas de navegador antes de activar el backend.

## Comportamiento implementado y probado en aislamiento

La migracion 081 define un registro inmutable de coordinacion por seguimiento, con revision independiente, referencia a la revision del seguimiento, responsable, proxima actuacion, motivo, actor, sesion, fecha y clave de idempotencia. Las asignaciones no modifican el estado, nota o norma del seguimiento. Retirar una asignacion agrega una revision; no elimina antecedentes.

El responsable se selecciona entre membresias activas y cuentas gestionadas con lectura juridica del mismo municipio. No crea usuarios, roles ni permisos. La elegibilidad se comprueba nuevamente al guardar. Una persona que pierde acceso queda visible en la referencia historica como no elegible, pero no puede recibir otra asignacion. El proponente debe tener los permisos existentes de lectura y registro juridico; una cuenta de lectura no puede escribir ni recuperar recibos de escritura.

Cada guardado exige las versiones esperadas de coordinacion y seguimiento, un motivo y, cuando hay responsable, una proxima actuacion concreta. Un seguimiento cerrado no admite reasignacion. No se genera otra revision por cambiar solo el motivo. El bloqueo transaccional usa el mismo dominio que la escritura de seguimientos para evitar competir con un cierre concurrente.

La API deriva municipio, actor y sesion del acceso autenticado; no acepta esos campos del cliente. POST exige origen autorizado, JSON acotado y clave UUID v4. El mismo contenido y clave devuelven el recibo original; otra propuesta con esa clave se rechaza. La respuesta se valida antes de informar guardado. Las tablas y el helper de elegibilidad no se exponen al rol aplicativo; solo la fachada obtiene EXECUTE cuando se aplique la migracion.

## Evidencia

Regresion y compilacion local con Node 24.21.0: 3.858 pruebas aprobadas, cero fallos/omisiones. Son 16 nuevas pruebas de contrato/API sobre las 3.842 anteriores. La compilacion no demuestra funcionamiento de una interfaz que no se completo.

El verificador SQL ejecuto la migracion y funciones contra un esquema sintetico en PostgreSQL 18 aislado y termino con 51 comprobaciones aprobadas: 27 del circuito de seguimientos preexistente y 24 nuevas de coordinacion. Incluye asignacion, duplicados, version desactualizada, restriccion municipal, revocacion, retiro de asignacion, no cambio de seguimiento, bloqueo de reescritura y requisito de MFA.

Las cuentas/capacidades del ensayo son sinteticas. El helper de separacion de funciones del ensayo original es un stub de QA; la validacion de sesion usa la funcion real adaptada al esquema aislado. No se simula como prueba de las cuentas o roles reales de Mariano, Noelia o Hugo. Toda la transaccion se revirtio; no se escribieron registros municipales ni quedaron tablas de QA. La comprobacion independiente de Neon confirmo que el esquema de ensayo y public.legal_coordination_event no existen.

La huella SHA-256 de la migracion verificada es 885fabebafb171b749b45eb003960057ff39aacad510000abf52b2c24288ddd5. El ejecutor usa un destino de ensayo explicito, no la base operativa, y guarda su evidencia fuera del repositorio. El primer intento fallo antes de conectar por un error del constructor de SQL de ensayo; se corrigio la sustitucion para conservar literalmente los delimitadores dollar-quote y las expresiones regulares, y se repitio correctamente.

## Condiciones pendientes antes de produccion

1. Completar la interfaz con seleccion explicita de responsable, proxima actuacion, motivo y comparacion antes/propuesto; no incorporar datos en campos libres que simulen una cuenta.
2. Demostrar en navegador el guardado, retiro/reasignacion, perdida de respuesta sin duplicados, revocacion durante la edicion, vuelta al historial, teclado y 320/390 px.
3. Aplicar la migracion revisada en los destinos autorizados, contrastar su definicion/permisos y publicar conjuntamente API e interfaz, con comprobacion de la version efectiva en Vercel.

No se inicio instalacion remota, se modifico la VPN, se ampliaron cuotas o planes, se incorporaron nuevas credenciales ni se cambiaron fuentes de nomina. Los colectores actuales, el circuito de Hugo, las salidas de Noelia y los modulos publicados de Mariano permanecen sin cambios. Esta fase no envia notificaciones, determina vigencia juridica ni genera cambios salariales.

Referencias tecnicas: PostgreSQL 18, CREATE FUNCTION / Writing SECURITY DEFINER Functions Safely, y Explicit Locking / Advisory Locks. Las pruebas del proyecto, no esas referencias generales, respaldan el estado informado.
