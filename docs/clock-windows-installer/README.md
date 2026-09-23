# MuniControl · instalador para Windows

El objetivo de esta entrega es instalar y administrar el lector municipal desde un asistente y un panel de Windows. El paquete EXE incorpora el programa y Node.js; la persona que lo recibe no necesita instalar Node, usar npm ni editar el código del lector. La versión distribuida debe incluir su manifiesto, huellas y avisos de licencia. La firma del runtime no implica que el EXE de MuniControl tenga una firma de editor: esa comprobación se informa por separado para cada entrega.

**El lector disponible en esta versión es ZK40 por TCP, puerto 4370.** Se reutiliza el lector existente 4.1.3, con sus colas, controles de identidad y recibos. Haber leído los equipos comprobados de Junín no demuestra compatibilidad con todos los modelos o firmwares ZKTeco. MQTT, ONVIF y Modbus aparecen como próximos adaptadores, todavía no disponibles.

## Para empezar

1. Abrí el EXE y elegí «Comprobar este equipo». Si encuentra una instalación existente, consultá su estado; no instales otro lector sobre ella.
2. En un equipo nuevo, completá el nombre de la institución y los relojes que preparás. El asistente permite guardar ese borrador sin activar conexiones.
3. «Instalar» prepara y verifica el programa con Node incluido. No significa que los relojes estén conectados ni que el servicio haya comenzado.
4. El responsable técnico asocia ubicación, IP, protocolo y serie con la configuración privada autorizada, prepara la conexión y comprueba la recepción. La VPN, sus certificados, los tokens y las colas existentes se conservan por un canal protegido, fuera del paquete compartible.

PM-10 · Edificio Viejo integra el mismo parque y panel que los otros cinco equipos incorporados. Los ocho puntos restantes del inventario siguen pendientes de incorporación. Instalar este EXE no activa Oracle ni resuelve por sí solo la configuración privada o los certificados de la VPN. La autonomía se comprueba con una marca nueva recibida mientras el equipo anterior está apagado.

El EXE de MuniControl no cuenta actualmente con firma de editor. Si Windows muestra «editor desconocido», comprobá la procedencia y la huella con el responsable técnico; no desactives las protecciones. La firma de Node no firma el EXE completo.

## Qué prepara el asistente

El asistente guarda un borrador con el nombre del municipio, la ubicación de cada reloj, su adaptador, dirección IP, puerto y número de serie. Permite revisar esos datos antes de instalar y consultar después el estado del programa. Elegir un protocolo no abre una conexión ni declara que el equipo respondió. La inscripción autorizada del municipio y de sus dispositivos, las credenciales privadas y la configuración operativa se completan por separado con el responsable técnico; no se crean desde este formulario.

Las credenciales se entregan por un canal privado y se conservan en archivos con permisos restringidos. El paquete compartible no contiene tokens, claves de relojes, conexiones de base, fichadas ni datos de personas. La PC envía por HTTPS al receptor autorizado; no necesita una cuenta de PostgreSQL ni una conexión directa a Neon.

**El EXE de esta entrega instala archivos y permite preparar la configuración desactivada; no registra ni activa automáticamente una tarea de Windows.** El registro de la tarea y su activación son pasos técnicos separados, todavía pendientes en el asistente. Deben realizarse después de comprobar que no existe otro capturador o remitente del mismo equipo. Cuando se instale la tarea municipal existente, funcionará bajo una cuenta de servicio: el acceso a la red o VPN debe estar disponible también sin una sesión de escritorio abierta. Cerrar el panel no equivale a detener una tarea que ya se hubiera activado por separado.

El kit previo de scripts y ZIP sigue documentado en [la guía técnica de Windows 11](GUIA-TECNICA-WINDOWS11.md), incluida junto al instalador. Ese kit exige un Node externo; este instalador prepara una distribución con runtime incluido. No mezclar archivos de ambas entregas ni usar una para sobreescribir una instalación en marcha.

## Qué significan los estados

| Estado | Evidencia necesaria | Lo que aún no demuestra |
|---|---|---|
| Instalado | Archivos del paquete verificados y copiados | Registro o activación de la tarea, configuración correcta, conexión o envío |
| Configurado | Identidades, rutas y credenciales revisadas; validaciones locales superadas | Respuesta del dispositivo |
| Conectado | El protocolo responde y la serie coincide con la autorizada | Descarga completa o recepción en el servidor |
| Capturado localmente | Lote guardado en la cola con su metadata y huellas | Acuse del servidor |
| Recibido como fuente | Recibo persistente de la parte exacta, con `scope: source_only` | Conciliación de asistencia, aprobación de horas o salarios |
| Operación autónoma aceptada | Una nueva marca física llega al destino correcto con la PC anterior apagada y el nuevo host reiniciado o sin sesión | Compatibilidad de equipos que no participaron de la prueba |

Un puerto abierto, una tarea en ejecución o una respuesta HTTP satisfactoria no reemplazan la evidencia de la fila siguiente. El panel debe indicar cuándo se comprobó cada estado y distinguir un estado antiguo de una captura nueva pendiente.

Los envíos al archivo de fuentes se agrupan en ventanas compartidas de 15 minutos; cada controlador conserva su programación. Los registros nuevos pueden estar guardados localmente y esperar el próximo envío. El último recibo no confirma registros nuevos que aún no se enviaron. Ante un corte de Internet, las colas conservan los pendientes dentro de los límites de espacio configurados; no se borran para resolver un error.

## Edición actual y otros municipios

La edición actual conserva restricciones de red del despliegue de Junín (`172.100.96.0/19`) y un destino HTTPS compilado para su receptor. El municipio se identifica por un tenant autorizado; cada dispositivo necesita una inscripción y un token propios. **Escribir otro nombre de municipio o cambiar un campo de destino no habilita otro cliente.** El software no cambia estas restricciones ni crea inscripciones, empleados o sedes por su cuenta.

Un campo «API de destino» puede mostrar el perfil autorizado, pero esta versión no promete envío a cualquier URL. Un destino distinto requiere una edición y un contrato probados, autenticación y permisos del servidor, aislamiento de datos y una prueba de recepción. Nunca reutilizar credenciales de Junín en otra instalación institucional. La evolución propuesta está en [Adaptadores y crecimiento](ADAPTADORES-Y-CRECIMIENTO.md).

## Instalación, cambio de PC y aceptación

1. Verificar la versión, la huella y los avisos del paquete recibido. Un hash junto al archivo acredita igualdad; la procedencia se confirma por el canal de entrega.
2. Elegir una PC administrada, encendida y con espacio suficiente, red del equipo e Internet. No dar por probada la VPN bajo la cuenta de servicio porque funciona en una sesión personal.
3. Completar únicamente datos reales autorizados. Revisar serie, sede, municipio y destino; conservar claves y tokens fuera de capturas de pantalla o reportes.
4. Preparar la instalación sin iniciar capturas. Si existe otra, detenerla de forma ordenada, respaldar su configuración privada, colas y recibos, y comprobar que finalizó antes del traspaso.
5. Completar con el responsable técnico el registro separado de la tarea; el EXE no lo hace automáticamente. Activar primero un equipo. Confirmar lectura, lote local y recibo exacto; después ampliar a los demás dispositivos revisados.
6. Registrar la aceptación con una marca nueva y una prueba de continuidad sin la PC anterior. El EXE compilado o instalado por sí solo no completa esa prueba.

No activar una segunda instancia para resolver un atraso. No borrar bloqueos, colas ni recibos para que el panel muestre un estado favorable. **PM-10 · Edificio Viejo pertenece al mismo parque municipal y se administra con los mismos criterios que los demás equipos.** El coordinador admite su controlador de captura y envío junto con los controladores de los otros relojes. Cada uno conserva su identidad, su cola y el contrato de acuse que le corresponde; el traslado no convierte ni reenvía registros como si fueran una fuente nueva.

## Un panel para el parque de relojes

El panel local del coordinador muestra todos los relojes de su configuración en la misma lista, con iguales tarjetas y contadores. PM-10 participa del total, de las capturas guardadas, de los equipos con acuse conservado y de los que requieren revisión. No suma registros de contratos distintos como si fueran asistencia o un total laboral conciliado.

Cada tarjeta distingue la captura local del envío, muestra la fecha del archivo de estado y la del último acuse comprobado. La recepción de marcaciones y el archivo original de fuentes conservan su alcance. Si falta una evidencia, aparece «Recepción no consultada» o «Sin comprobación»; no se declara que el envío esté sin configurar, ni se reemplaza la falta de información por cero. Una captura más reciente que el último acuse tampoco prueba por sí sola que existan pendientes: puede no contener registros nuevos.

Mientras el coordinador esté en ejecución, prepara el archivo privado `estado.html` en su directorio de estado cada 30 segundos. El botón del asistente para abrir un estado existente sólo abre ese archivo; no inicia un coordinador ni genera nuevas capturas. Con el coordinador detenido, la página conserva su último corte aunque se recargue. Un error de consulta publica un aviso sin cifras anteriores; si no se puede escribir el archivo, permanece visible la fecha del corte previo.

La comprobación del panel valida la metadata local, la identidad de la cola y la forma y el vínculo del acuse guardado. No vuelve a leer las marcaciones, no recalcula las huellas de su contenido ni consulta al servidor. Acredita qué evidencia local pudo verificarse; no es una certificación independiente de su autenticidad ni una prueba de captura en vivo.

Los contadores describen la configuración y los archivos consultados, no una conexión en vivo. Los 14 puntos del inventario municipal —13 de la planilla original y PM-14 incorporado por confirmación— no equivalen a 14 equipos conectados. Los seis incorporados y los ocho pendientes deben conservar su estado real; un distrito nuevo requiere dirección, ruta autorizada, identidad y protocolo verificados. Este cambio del panel no instala, traslada ni activa equipos por sí mismo.

## Alcance de la entrega

Este documento describe el producto y sus límites. La compilación, integridad, pruebas locales, firma de editor, instalación en el host y aceptación de cada dispositivo se registran como evidencias distintas de la versión entregada. No se presentan como realizadas por escribir esta guía o por seleccionar una opción del catálogo.

El paquete debe conservar las licencias y referencias del lector y del runtime redistribuido. Los antecedentes del código se detallan en [Licencia y alcance de distribución](LICENCIA-Y-DISTRIBUCION.md), incluida en el paquete; su observación sobre Node externo corresponde al kit anterior. La nueva distribución debe incluir también los avisos del Node incorporado. No se promete gratuidad permanente de servicios externos ni se modifican planes o conexiones al instalar.
