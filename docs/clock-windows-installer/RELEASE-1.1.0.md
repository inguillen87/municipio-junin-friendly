## MuniControl Dispositivos 1.1.0 — Windows x64

El EXE incluye el programa y el runtime de Node verificado. No requiere instalar Node, npm ni un entorno de desarrollo. Se acompaña del código correspondiente, sus avisos de licencia, huellas y resultado de la autoprueba.

### Cambios

Registro explícito de la tarea automática desde el asistente, después de verificar la configuración privada. Queda desactivada: habilitar la lectura exige otra confirmación y comprobar que no sigue operando el capturador anterior. La tarea utiliza LocalService, inicio con Windows y prevención de instancias simultáneas. El panel diferencia tarea registrada, habilitada y ejecutándose; permite solicitar una detención ordenada sin borrar colas ni recibos.

### Alcance de esta edición

El adaptador habilitado sigue siendo ZK40 TCP/4370 y el perfil operativo conserva las restricciones de Junín. PM10 pertenece a la misma flota. MQTT, ONVIF y Modbus todavía no son adaptadores operativos. Cambiar el nombre de la institución no crea otro tenant ni credenciales. La inscripción autorizada y la configuración privada se completan por separado.

Una instalación existente no se sobrescribe ni se migra automáticamente. Para cambiar de host se conservan configuración privada, colas y recibos y se requiere detener el capturador anterior. La autoprueba y las capturas de pantalla usan estado sintético: no acreditan recepción real de marcas, reinicio del servidor municipal ni aceptación con la PC anterior apagada.

**El EXE MuniControl no tiene firma de editor Authenticode.** La firma comprobada de Node pertenece al runtime, no al instalador. La huella SHA-256 permite cotejar el archivo recibido con esta entrega. No desactivar políticas de seguridad de Windows para instalarlo.

No contiene datos municipales, tokens, claves, plantillas biométricas ni conexión directa a Neon. La publicación de este programa no cambia el plan de Vercel/Neon ni activa equipos.
