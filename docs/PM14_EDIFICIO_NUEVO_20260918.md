# PM-14 · Edificio Nuevo

## Identificación y ubicación

El propietario confirmó el 18/09/2026 el código **PM-14**, nombre **Edificio Nuevo** y domicilio **Román Cano e Hipólito Yrigoyen, Junín, Mendoza**. La dirección también está publicada en el sitio oficial municipal y en la información de ATM. La dirección operativa de red informada se conserva por separado en una nota privada local; no se publica en los assets, el mapa o este documento.

La consulta de Nominatim y la API primaria de OpenStreetMap devolvió el nodo 4373026485: amenity=townhall, nombre Municipalidad de Junín, dirección Román Cano e Hipólito Yrigoyen, latitud **-33.1422201**, longitud **-68.4845214**. Nodo versión 2, actualizado en OSM el 01/05/2024. Se utiliza como referencia cartográfica del edificio, no como medición del lector biométrico, entrada exacta o geocerca aprobada.

Fuentes: https://www.juninmendoza.gov.ar/ ; https://www.mendoza.gov.ar/prensa/la-receptoria-de-junin-traslada-su-atencion-a-la-oficina-ventanilla-unica-de-la-municipalidad/ ; https://api.openstreetmap.org/api/0.6/node/4373026485.json . Atribución: OpenStreetMap contributors, ODbL 1.0.

## Integración desarrollada

El libro P3 y su archivo JSON original conservan sus trece puntos, huellas y recuentos. Una confirmación adicional versionada incorpora PM-14 en la proyección autorizada: **13 puntos de planilla + 1 alta confirmada**, sin atribuir al Excel una fila inexistente. Se mantienen PM-01 a PM-13 y sus coordenadas, especialmente PM-10 Edificio Viejo.

Mapa, nomenclatura de la flota y tablero detallado consumen el mismo catálogo compuesto. El script de etiquetas reconoce `edificio-nuevo` como PM-14, sin utilizar el número del software del proveedor. Esa modificación de código no acredita su ejecución sobre la instalación del colector.

Los marcadores muestran los números de PM, el alta adicional tiene identificación diferenciada y el listado accesible permite ubicar cada punto sin consultar otra vez la API. El ancla `/relojes#pm-14` selecciona el punto dentro del mapa autorizado. Popup y listado identifican la procedencia cartográfica; los acuses siguen correlacionados por código exacto. Una recepción de PM-10 no vuelve conectado a PM-14.

## Límites operativos

No se activó el envío del equipo ni se registró un dispositivo/serie nuevo en Neon. No se confirmó el modelo, firmware o ubicación física del lector. La captura automática, credencial del conector y primer acuse siguen siendo un cierre separado. El punto en el mapa no es una prueba de comunicación.

La lectura operativa de la instalación local fue bloqueada por la herramienta. Se conservó una nota nueva con los datos aportados por el usuario; no se usó otra vía para obtener la configuración bloqueada. Tampoco se modificaron IP, seriales, colas, credenciales o servicios del colector.

## Pruebas

Se conservaron las pruebas del Excel original y se extendió el contrato del inventario compuesto. Los casos nuevos verifican procedencia, PM-14, coordenadas no copiadas, aislamiento por municipio y ausencia de IP/credenciales en la respuesta del mapa. El recorrido cartográfico usa las coordenadas públicas y API/teselas sintéticas, no una sesión municipal ni tráfico hacia los relojes; prueba catorce marcadores, foco accesible, enlace profundo y separación de acuses.

La publicación y sus verificaciones se documentan tras el despliegue. No se modifican septiembre, legajos, liquidaciones, normas o firmas por incorporar esta ubicación.

Validación del código integrado: 3.650 pruebas de aplicación aprobadas, compilación aprobada, diez grupos del mapa y catorce de recepción de flota. Las pruebas usan API sintéticas y no generan registros del municipio. Se comprobó que PM-14 no hereda acuses de PM-10 y que los botones de ubicación no consultan otra vez el servidor.

Las mejoras adicionales preparadas para el tamaño del popup y la disponibilidad del botón de marcaciones no se integraron tras el bloqueo de esas operaciones. Se mantienen el comportamiento previo de consulta y sus errores de disponibilidad; no afirmar que el recorrido completo de marcación del nuevo punto ya está operativo. El cambio confirmado de esta entrega es cartográfico y de identificación.
