# Adaptadores y crecimiento

MuniControl puede evolucionar hacia un agente para varias familias de dispositivos y varios municipios. La base actual es un lector de relojes con identidad comprobada, cola local y recibo de fuente. **El selector de protocolos describe capacidades; no instala controladores que todavía no existen.**

El catálogo versionado se encuentra en `local-agents/clock-fleet/windows-installer/device-adapters.json`, con `schema: municontrol-device-adapters.v1`. Sólo los elementos con `availability: available` y `selectable: true` pueden configurar una lectura. Los identificadores son estables y no son nombres de ejecutables ni comandos que se descargan o ejecutan dinámicamente.

## Disponibilidad

| Adaptador | Estado actual | Alcance |
|---|---|---|
| ZK40 por TCP | Disponible en el lector actual | Registros de asistencia de 40 bytes, puerto 4370, serie y clave autorizadas, controles de red vigentes. Compatibilidad probada por equipo y firmware, no universal. |
| MQTT | Pendiente de diseño e implementación | Telemetría de sensores; falta especificar broker, certificados o credenciales, temas, mensajes, unidades y tratamiento de duplicados. |
| ONVIF | Pendiente de diseño e implementación | Posibles estados y eventos de cámaras; no hay visualizador, grabador ni análisis de video implementado. |
| Modbus | Pendiente de diseño e implementación | Posibles mediciones de registros; falta definir TCP o serie, mapa, tipos, escala, unidades y calidad. No incluye escritura o actuación sobre equipos. |

Una plaza es una ubicación, no un protocolo. Puede agrupar cámaras, medidores o sensores con conectividad y contratos distintos. El soporte de un sensor no habilita por extensión los demás equipos del lugar.

## Datos distintos para cada familia

El parque de relojes conserva los contratos de cada controlador. Los equipos con archivo de fuentes envían `zk40-delivery.v1` y reciben `clock-source-receipt.v1`, con `payrollModified: false`. PM-10 mantiene su receptor de marcaciones y su acuse original. El panel común no transforma ni intercambia estos recibos; tampoco se cambian para que encajen sensores o cámaras. Ninguno certifica por sí solo asistencia aprobada ni liquidación de haberes.

Para futuras familias se propone un contenedor versionado, todavía **sin endpoint ni esquema de recepción implementados**, con estas responsabilidades:

| Parte del futuro contrato | Contenido y validación |
|---|---|
| Versión y familia | Versión explícita del contrato y tipo de datos; el receptor rechaza familias o versiones desconocidas. |
| Institución y dispositivo | Identidad inscrita de municipio, dispositivo y ubicación; la autoridad proviene del servidor y de la credencial, no de un nombre escrito en el mensaje. |
| Procedencia | Adaptador y versión, identidad comprobada del equipo y referencia a la captura original. |
| Fechas | Hora observada por el dispositivo, si existe, y hora de captura por el agente; zona o incertidumbre declaradas. No convertir una hora local en UTC sin evidencia. |
| Integridad e idempotencia | Identificador estable del envío, huella del contenido y número de secuencia cuando corresponda; reintento exacto recuperable, contenido cambiado rechazado. |
| Datos de la familia | Esquema propio cerrado, límites de tamaño y validación de sus campos. No reinterpretar todos los mensajes como fichadas. |
| Acuse | Versión, identidad y huella del envío confirmado, instante de persistencia y alcance explícito. Un acuse de transporte no es una decisión de negocio. |

Las mediciones necesitan valor, unidad, escala y calidad; un valor ausente no equivale a cero. Los eventos de cámaras necesitan definir qué evento se entrega y si se permiten imágenes, audio o video; ese material exige límites, acceso y retención propios, y no forma parte del receptor de relojes. Los equipos Modbus requieren un mapa de registros aprobado: leer un número sin escala o significado no produce una medición confiable.

No se propone enviar plantillas biométricas, contraseñas, claves de base de datos ni datos ajenos al propósito declarado. Un futuro comando de actuación sería otro contrato con permisos, auditoría y confirmación propios; la recepción de fuentes no debe convertirse en un canal de control remoto.

## Separación entre municipios y API de destino

La evolución debe partir de perfiles autorizados por instalación. Cada perfil vinculará municipio, dispositivos, credenciales y destino permitido; no se debe permitir que un token de una institución llegue a la API de otra por cambiar una URL. El destino deberá verificar el tenant y las identidades actuales en cada recepción, y devolver un recibo ligado al mismo perfil.

La edición actual tiene un endpoint compilado y guardas de red de Junín. Generalizarla requiere revisar esas constantes y sus pruebas de forma expresa, sin desactivarlas como atajo. La interfaz puede mostrar el destino vigente y las integraciones futuras, pero sólo debe ofrecer como operativos los perfiles aceptados por el lector y el receptor. No existe hoy aprovisionamiento genérico de otros municipios desde este asistente.

## Pasos de crecimiento

1. **Cerrar la entrega Windows actual:** EXE y runtime verificables, asistente, panel, instalación controlada, pruebas locales y piloto en el host de destino con un único capturador por equipo.
2. **Separar perfiles institucionales:** configuración versionada, inscripción gobernada, secretos por dispositivo, restricciones de destino, actualización y recuperación probadas. Confirmar aislamiento entre dos instituciones antes de ofrecer el producto como multicliente.
3. **Incorporar una familia nueva por vez:** contrato de datos, lector real, pruebas con equipo o broker autorizado, cola durable, idempotencia, cuota, recibo y visualización adecuados. Un ejemplo simulado no habilita el adaptador del catálogo.
4. **Habilitar operación:** aceptación por dispositivo, comportamiento ante corte de red, reinicio, revocación, disco lleno y traspaso de host. Mantener los originales y los recibos según la política acordada.

Agregar una opción al JSON no completa ninguna de esas etapas. El cambio de `planned` a `available` requiere implementar y verificar el adaptador y su receptor, conservar evidencia y publicar el paquete correspondiente. Los informes deben distinguir siempre código preparado, pruebas simuladas, conexión real, recepción persistente y aceptación del operador.
