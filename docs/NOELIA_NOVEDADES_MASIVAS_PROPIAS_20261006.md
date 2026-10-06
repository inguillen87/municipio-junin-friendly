# Novedades masivas propias — módulo 5.2 y revisión de 5.3/5.5

La carga de novedades propias admite varios legajos y conceptos en **un único lote completo**, con borrador, envío, decisión independiente, cancelación conservando antecedentes y consumo por una corrida propia. Se construye sobre contratos registrados en MuniControl y la identidad verificada de cada contrato. Un empleado propio no necesita un movimiento ni un registro anterior en GRH.

## Recorrido

1. En **Novedades → Un lote para varios legajos**, actualizar el acceso y consultar las altas propias activas completas.
2. Declarar período y tipo de liquidación. Seleccionar legajos en una o varias páginas. Buscar no elimina la selección anterior; **Seleccionar todas** incluye las altas propias activas de todas las páginas.
3. Informar concepto y cantidad o importe manual; agregar los destinos seleccionados al mismo lote. Se admiten varios conceptos por contrato. La edición de fila conserva los otros destinos. Una fila repetida por contrato/concepto/centro/ajuste/movimiento rechaza el conjunto completo.
4. Verificar el lote completo, revisar todas sus filas y confirmar voluntariamente. Se guardan todas las filas; la página no define el alcance. Los vacíos siguen sin informar, distintos de cero; no se redondean cantidades ni centavos durante la carga.
5. Enviar el borrador a revisión. Otra persona con membresía independiente aprueba o rechaza. **Importes forzados requieren fundamento y dos revisores distintos, además del preparador**; una primera revisión mantiene el lote pendiente.
6. Los lotes propios aprobados integran **Cálculo propio**, según período, tipo y alcance explícitos: legajos, convenio, repartición o todos. La captura conserva el lote original completo, incluso al calcular un legajo. Sólo las filas del alcance declarado se consumen; una búsqueda de pantalla nunca selecciona la población del cálculo.
7. Descargar voluntariamente el CSV completo de revisión, con legajo, valores exactos, estado y los campos administrativos. Tiene comillas, escapes y protección de fórmulas de planilla; no contiene DNI, nombre, contrato UUID ni token de identidad. Es una salida de revisión, no un formato de importación homologado. No abrir y volver a guardar con Excel para usarlo como fuente.

## Conservación y autorización

Cada operación guarda un antecedente inmutable y una respuesta original. Ante pérdida de respuesta, **Recuperar el mismo intento** consulta lo ya confirmado; reintentar mantiene exactamente el cuerpo y la clave originales. No se habilita una nueva preparación hasta recuperar la respuesta o comprobar expresamente que el intento no fue registrado. Cambios de identidad o estado invalidan la revisión. Ocultar la página o retirar permisos elimina las vistas nominales y la descarga; un intento incierto sólo se conserva en memoria, sin almacenamiento del navegador.

La cancelación retira todas las filas del lote y conserva su historia. Si alguna corrida ya lo capturó, se exige revisar el circuito de corrección de esa liquidación; no se altera una fuente de un resultado guardado. No se realizan anulaciones ni recálculos municipales por efecto de esta instalación.

SQL130 crea una tabla vacía de eventos, 16 funciones con cuatro fachadas privadas, un control de conflicto con la carga individual publicada y adapta la captura existente de cálculo para leer el nuevo origen. La instalación no agrega usuarios, asignaciones de roles, definiciones de capacidad, bases de datos, empleados, novedades o resultados; verifica los datos y objetos anteriores y la durabilidad en una conexión independiente. V1/V2 y sus cuerpos, claves y límites se conservan.

## Capacidades y límites pendientes

El lote nuevo admite hasta **10.000 filas**, un máximo global de **4 MiB de envío** y un comprobante completo —contenido original e identidades verificadas— de hasta 4 MiB, con margen para su respuesta. El censo admite 10.000 altas propias activas; una consulta admite 1.000 lotes. El tamaño de los eventos tiene límite global. Al alcanzarlos se rechaza el conjunto, sin división ni omisión. La captura de cálculo conserva su límite global publicado de 4 MiB: un lote administrativamente registrado puede requerir revisar esa capacidad antes de calcularlo.

Este incremento **no resuelve el escritor TXT de 500 registros ni el resolvedor de importación rechazado**, y no interpreta OSEP, DNI ni archivos privados. Es carga explícita de contratos propios ya verificados. La migración del padrón histórico al padrón propio continúa pendiente; los empleados históricos sin registro propio no se convierten mediante esta pantalla.

Registrar o aprobar un código no certifica su elegibilidad salarial. El motor exige catálogo y programa propios aprobados, unidades, convenio, vigencia, redondeo y tratamiento de cada fuente. No inventa reglas para 88/95 u otros códigos. Los forzados, ajustes retroactivos y vigencias parciales requieren políticas de cálculo expresas; la carga administrativa no las sustituye. Los ejemplos y ensayos usan únicamente datos sintéticos y PostgreSQL local. Publicación y aceptación por Noelia deben registrarse por separado en la evidencia de la entrega.
