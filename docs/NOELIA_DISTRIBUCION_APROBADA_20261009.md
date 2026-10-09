# Distribución aprobada de una liquidación propia

En **Nómina → Imputación propia**, una distribución aprobada y vigente puede descargarse para control interno. El archivo conserva cada concepto del grupo cerrado completo, sus importes o valores exactos, destinos anuales, institución, función y documentos de respaldo. La búsqueda y las páginas sólo modifican la vista.

1. Consultar período y tipo de liquidación.
2. Elegir una propuesta aprobada y abrir su revisión completa.
3. Comprobar su estado y pulsar **Descargar distribución aprobada · CSV**.

El archivo contiene legajos e importes; corresponde al circuito municipal autorizado. Omite nombres, DNI, UUID, identidades de los revisores y los motivos libres de las decisiones. Incluye las huellas del cierre y de la distribución para identificar el conjunto original. Los auxiliares figuran como valores sin movimiento monetario, con sus destinos vacíos. Una referencia ausente queda vacía; un cero explícito permanece como tal.

Los campos de texto, códigos e importes llevan un marcador literal de texto para evitar fórmulas de planilla y conservar ceros iniciales y toda la precisión original. Se usan punto decimal, separador punto y coma, comillas escapadas, UTF-8 y líneas CRLF. Es una copia para control; no constituye un formato bancario, fiscal o de intercambio contable.

Antes de descargar se vuelve a leer la propuesta íntegra y verificar sus hashes, aprobación vigente, revisión actual, configuración contable y estado cerrado. La sesión se comprueba nuevamente después de preparar el archivo y antes de habilitarlo. Un cambio de selección, cuenta, permiso, tarea o visibilidad retira la vista y la descarga. Una respuesta tardía no restituye datos retirados.

Un envío pendiente mantiene su cuerpo y clave y bloquea la descarga. El botón no registra otra operación ni cambia ese intento. Las propuestas pendientes, rechazadas, reemplazadas o cuyo cierre se reabrió conservan su historia, pero no habilitan una copia aprobada vigente. No hay persistencia en el navegador ni una API nueva.

Esta salida no genera asientos, concilia bancos, paga sueldos ni resuelve la homologación salarial. La adopción municipal del padrón, las reglas salariales y la aceptación real de Noelia siguen siendo cierres distintos.
