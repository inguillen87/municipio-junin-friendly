# Recepción multirreloj 070 · continuidad de #37 y #41

Este incremento prepara el receptor HTTPS `attendance-zk40` y su inscripción por dispositivo. No instala procesos en Windows, no genera tokens, no registra puntos físicos ni envía filas por sí solo. La migración debe registrarse y comprobarse en Neon; la existencia del archivo SQL no acredita su aplicación.

Se reutiliza el motor de recepción de PM-10 bajo otra función, verificando antes la huella exacta del motor revisado. El original no se reemplaza. La inscripción exige la misma combinación municipio/dispositivo/conector/serie/punto. La sesión del operador no sustituye la credencial específica del conector. La clave numérica de comunicación del reloj no es el token del API.

Recepción en partes de hasta 500 registros fuente de 40 bytes, hashes y orden fuente verificados, acuse por parte persistida, reintento idempotente, aislamiento por equipo y municipio. Los datos originales se conservan; ambiguos, desconocidos o inválidos no se convierten automáticamente en asistencia aprobada. No modifica haberes. Las funciones de consulta conservan su autorización; no hay una exportación nominal pública.

## Cola instalada: no convertir ni sustituir
La central instalada utiliza `clock-local-batch.v1`, `clockId` y `serial`, no el formato alternativo `deviceBinding` de un borrador descartado. Su clave local incorpora identidad antes de los hashes. El transporte usa otra clave determinista de snapshot/records, dentro del conector aislado. El adaptador debe verificar ambas sin editar manifest.json ni records.bin. Las confirmaciones se guardan por equipo, separadas de la captura.

El adaptador local de envío fue preparado como trabajo separado; su publicación e instalación NO forman parte de este corte del receptor. No iniciar otro lector para resolver el envío. Preservar PM-10 y su token.

## Activación de cada sede
1. Recuperar evidencia privada de serie, firmware y captura completa; comprobar la identidad de la cola instalada.
2. Reconciliar el punto con el inventario municipal. Las coordenadas declaradas se distinguen de una verificación física. Edificio Nuevo requiere su punto propio; no heredar coordenadas de Edificio Viejo.
3. Crear conector y token independientes en almacenamiento privado, registrar inscripción y aprobación, sin publicar credenciales.
4. Instalar sólo el envío compatible, ensayar una parte autorizada, verificar acuse en Neon y relectura, después habilitar repetición.
5. Conciliar total original, aceptado, observado y duplicado; recién entonces declarar recepción y habilitar consulta por sede.

La central necesita un host encendido y ruta municipal. Desktop Commander desconectado no demuestra apagado del host, pero impide instalar y verificar allí. No afirmar envío automático, conexión en tiempo real o ubicación física por un acuse histórico. La pantalla debe separar captura local, cola, última recepción, errores y actualización de consulta.

La mejora comercial conserva un solo núcleo con instalación local y panel web; el paquete autónomo podrá ofrecer captura/consulta sin nómina, sin duplicar implementación. Windows sin sesión, instalador firmado y operación permanente siguen siendo aceptación aparte. Los frentes jurídico/legislativo y salarial continúan; este corte no cierra contratos, expedientes, IA, turnos o liquidación propia.
