# Certificados escolares desde los datos propios

Primer incremento de MC-D02 y MC-E02. Responde a los dos pedidos de Noelia: cargar manualmente el certificado en la ficha y obtener los legajos activos con hijos, fechas de presentación y vencimiento. La documentación fuente permanece privada.

## Alcance

El reporte consulta el padrón administrativo de la fuente GRH publicada y el catálogo de vínculos del mismo corte. Incluye HIJO, identificado por ID2 y su etiqueta comprobada; la letra H también existe para PRENATAL y no basta para seleccionar hijos. Cuenta legajos y familiares por separado, incluso cuando una persona tiene más de un contrato. No certifica un padrón actualizado al día ni elegibilidad salarial.

La ficha permite adjuntar PDF de hasta 2 MiB y 30 páginas. Presentación y vencimiento son fechas ingresadas explícitamente por el operador. El vencimiento puede no estar informado o ser anterior a la presentación. La ausencia de un archivo en MuniControl significa que no está registrado aquí; no prueba que el empleado no lo haya presentado. Las fechas históricas PRES_14/VENC_14 conservadas en la fuente no se homologan automáticamente con estos campos.

Este incremento ofrece una carga inicial acotada: los archivos y sus versiones se guardan de forma privada en la misma base operacional existente. La cuota global inicial para PDF es de 8 MiB, con reserva de espacio para el resto del sistema y comprobación serializada antes de guardar. El espacio realmente disponible puede ser menor y se muestra en la ficha. No constituye un archivo documental general para toda la población municipal.

No hay una nueva aplicación, base operacional, importación de GRH ni almacenamiento público. El contenido idéntico se deduplica dentro del municipio; los registros conservan su trazabilidad y no se sobrescriben. La consulta y el Excel siguen disponibles cuando la carga alcanza su límite. Un reintento idéntico de un registro confirmado conserva su acuse aunque el almacenamiento haya llegado al tope.

El proyecto actual de Neon tiene un límite comprobado de 512 MiB. Su almacenamiento de objetos no está disponible en esta región. Ampliar el archivo privado con un destino R2 verificado sigue siendo una dependencia para habilitar cargas generales; no se contrató otro plan ni se reutilizó una credencial administrativa de Cloudflare en la aplicación.

## Conservación y acceso

No hay una clave foránea hacia `grh_family`: su importador reemplaza esa tabla. El certificado conserva contrato, persona, vínculo, lote de origen y huella de la identidad familiar. Un corte nuevo con identidad equivalente conserva el acceso. Si el ID familiar se reutiliza o cambia la persona del contrato, no se reasigna el certificado: la lectura y descarga exigen la identidad actual coincidente. La corrección de identidad y recuperación de documentos requiere un flujo posterior explícito.

La consulta y descarga exigen sesión municipal vigente, fuente certificada, autoridad del municipio y `workforce.employee.read`. Registrar requiere además `employee.record.propose`; no concede nuevas capacidades ni exige que el operador administrativo sea el empleado destinatario. Toda operación se verifica nuevamente en PostgreSQL. El runtime sólo ejecuta las fachadas autorizadas y no obtiene lectura directa de las tablas de archivos.

La carga valida tamaño, hash, estructura PDF, calendario e identidad actual; conserva el formulario ante errores y usa una clave de reintento para evitar altas duplicadas. Los PDF se descargan como adjuntos privados, sin caché ni previsualización automática. Validar estructura no equivale a un análisis antivirus ni a validar el contenido escolar.

## Exportación y límites

La pantalla y el XLSX usan la misma respuesta completa y sus filtros. La consulta falla explícitamente si supera 5.000 familiares; nunca devuelve un informe silenciosamente incompleto. Se incluyen las fechas y el corte de origen, sin DNI ni CUIL. Es un control interno y no una liquidación, recibo firmado, pago o autorización de escolaridad.

## Publicación y reversión

La migración 057 es aditiva. Primero se prueba en PostgreSQL aislado y se conserva una copia privada de la base operacional. La reversión técnica consiste en volver al deployment anterior, conservando los archivos y registros que eventualmente se hayan cargado; no se borran tablas ni se restaura toda la base para revertir una interfaz. Los resultados realmente ejecutados se registran en `13_CONTINUIDAD.md` al cerrar el incremento.
