# Noelia: conciliacion y paquete bancario de control - 19/09/2026

## Funcionalidad incorporada

Centro de reportes > Planilla bancaria > Generar planilla. Se agrega un bloque de conciliacion de toda la liquidacion autorizada y el boton Descargar paquete de control. Se reutiliza la API bancaria existente y su verificacion de sesion/fuente; no hay cuentas ni datos bancarios editables en este incremento.

El bloque presenta CBU informados en varios legajos, cantidad de legajos involucrados, netos ausentes, cero y negativos. Las coincidencias se revisan contra toda la liquidacion, aunque el filtro muestre solo una persona. Son observaciones de control: un CBU compartido no demuestra irregularidad ni es una regla para excluir o aprobar un pago.

La agrupacion por banco y por jurisdiccion conserva todos los registros, incluyendo grupos sin identificar. Cada agrupacion concilia por separado con la cantidad y suma completa: no se suman bancos mas jurisdicciones como si fueran poblaciones diferentes. Los importes se suman en centavos enteros exactos. Un neto ausente deja total=null y muestra separadamente la suma conocida; no se sustituye por cero.

Las observaciones adicionales tambien se conservan en la tabla nominal y en las descargas Excel/PDF individuales. La pantalla distingue controles de fuente informados de los contrastes adicionales y declara cuando el alcance es completo y cuando corresponde al filtro.

## Paquete en un solo paso

La descarga genera un ZIP privado con seis archivos: planilla.xlsx, control.pdf, conciliacion.csv, observaciones.csv, manifiesto.json y LEEME.txt. Excel/PDF contienen todas las filas del filtro, no solo la pagina; conciliacion.csv corresponde a toda la liquidacion consultada; observaciones.csv contiene los legajos del filtro con observaciones de origen o controles adicionales.

El manifiesto conserva la version del paquete, liquidacion y fuentes, hash del reporte, filtros, cantidad, suma conocida/total, alcance y SHA-256/tamano de cada artefacto restante. La busqueda nominal literal no se duplica en el manifiesto: se conserva solo su presencia y hash; los filtros completos siguen en la hoja Control y el PDF. El ZIP contiene informacion privada y NO esta cifrado. Un hash no es firma digital ni prueba de autorizacion bancaria.

Antes de cada descarga se reconsulta la API. Ahora se comparan tambien todas las filas normalizadas, no solo los hashes declarados: una respuesta distinta con el mismo identificador/hash no emite un archivo desactualizado. Cambiar filtros, modulo o sesion invalida el trabajo pendiente. Una revocacion elimina la tabla, conciliacion y metadatos del DOM; no basta con ocultarlos.

El paquete se construye desde una instantanea normalizada antes de operaciones asincronas. Mismos datos, filtros y fecha de consulta producen mismos bytes. Se verifican archivos binarios sin recodificar XLSX/PDF como texto; la serializacion ZIP previa para entradas de texto conserva su huella. El limite local es 32 MiB. Si falla el PDF por caracteres no compatibles o falla un control, no se descarga un paquete parcial; la descarga individual de Excel sigue disponible cuando corresponde.

## No equivale a una remesa

La salida esta rotulada como CONTROL INTERNO. No contiene TXT de acreditacion, no genera una orden de transferencia, no homologa un layout bancario, no aprueba una liquidacion y no acredita pagos. Tampoco persiste una remesa ni su aprobacion; esos son pasos independientes del plan integral. No se cambian haberes, cuentas, conceptos, reglas, permisos, planes o conexiones.

La lectura agregada actual de Neon confirmo una fuente bancaria y seis liquidaciones detalladas compatibles por tenant/vinculacion/respaldo/empresa/base; el corte de cuentas es 19/08/2026 15:17:09 y la ultima fecha compatible de liquidacion es 31/08/2026. Esto demuestra datos de origen incorporados, no una prueba con la sesion real de Noelia, ni activacion del candidato septiembre.

## Evidencia de pruebas

16 pruebas nuevas del paquete y conciliacion. Regresion completa y compilacion: 3.776 pruebas aprobadas, cero fallos, omisiones o cancelaciones. Se conserva el limite de dependencias existente; no se agrego una biblioteca ni se cambio una version. La ampliacion de ZIP se probo contra una huella fija de entradas de texto anteriores y roundtrip binario.

Navegador local: recorridos completos a 1440, 390 y 320 px, con 12 grupos de comprobaciones. Incluyen fuente completa, filtros/paginacion, Excel/PDF, paquete revalidado con una consulta adicional, SHA-256 de cada archivo, errores 503, cambio de fuente, revocacion 403 y cancelacion de una respuesta tardia tras cambiar de modulo. Las APIs privadas fueron interceptadas con datos sinteticos; no se simulo estar usando las cuentas municipales reales ni se generaron pagos.

La verificacion del paquete sintetico incluyo lectura de ZIP/XML, 26 filas en la hoja Planilla (encabezado mas 25 filtradas), cuentas/CBU/CUIL/legajo como texto y ausencia de formulas ejecutables. PyMuPDF abrio el PDF de seis paginas; se renderizaron y revisaron visualmente las paginas 1, 2 y 6, y se comprobaron el ultimo legajo filtrado, la nota de CBU compartido y huellas en los pies. La primera comprobacion de texto se repitio con escapes Unicode por la codificacion de la consola Windows; no se modificaron artefactos para ocultar un fallo.

El ejecutor de navegador admite --published: compara siete archivos productivos con la compilacion local, comprueba que la API bancaria rechace al anonimo y repite los recorridos sobre assets publicados con API privada simulada. El despliegue y ese resultado se confirman despues de publicar; no se deducen del build local. Las evidencias sinteticas permanecen fuera de Git.

## Continuidad del plan y relojes

Este corte avanza el control previo y entrega documental de Noelia; conserva los circuitos de Hugo, Mariano y los pendientes del proyecto integral. La conciliacion de septiembre, la valoracion salarial propia y los formatos aceptados por bancos no se sustituyen por este paquete.

Se mantiene separada la eleccion de host de relojes hasta recibir el dato de Computos. Una alternativa de arquitectura es ejecutar el colector en nube con una ruta VPN autorizada hacia la red municipal, incluso mediante un router que ya permanezca encendido; no exige por definicion una PC de escritorio adicional. Un cron programa la ejecucion, no crea esa conectividad. No se cambio ni detuvo ningun colector, ni se aprovisiono infraestructura de pago o una VPN en este incremento.

Referencia primaria consultada para el alcance del cron: https://vercel.com/docs/cron-jobs (Vercel dispara una solicitud HTTP a una funcion del despliegue). No se presenta un cron online como si ya pudiera leer las direcciones internas de los relojes.
