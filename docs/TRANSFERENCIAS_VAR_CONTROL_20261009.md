# Transferencias varias: control local de campos e incidencias

## Incremento funcional

Nómina → Archivos bancarios → Transferencias varias permite revisar el TXT completo y descargar un CSV de incidencias. La revisión no depende de una conexión a GRH. No genera instrucciones bancarias, presenta archivos, acredita pagos ni modifica liquidaciones.

El diseño de 167 posiciones fue contrastado con la muestra municipal y la definición del reporte original. Esta evidencia identifica los campos observados; falta validar el servicio bancario receptor para habilitar un generador oficial de este formato.

La planilla Excel de control de los bancarizados se obtiene en Nómina → Salida bancaria, desde una emisión propia aprobada y vigente. Conserva apellido y nombre, legajo, repartición original, cuenta y neto exacto, además del resumen por repartición y banco. El CSV de incidencias de esta revisión conserva sólo observaciones no nominales; no sustituye esa planilla ni acredita un TXT bancario presentado.

| Posiciones, inclusive | Campo observado | Control |
|---|---|---|
| 1–22 | CBU | Exactamente 22 dígitos. No certifica titularidad ni cuenta habilitada. |
| 23–32 | Importe | Diez dígitos de centavos enteros; suma exacta con `BigInt`. |
| 33–54 | CUIL | Once dígitos y once espacios finales. No certifica identidad fiscal. |
| 55–94 | Apellido y nombre | Cuarenta posiciones, contenido presente y sin espacio inicial. |
| 95–104 | Legajo | Diez dígitos, conservando ceros iniciales. |
| 105–164 | Referencia | `HABERES mes-año` y espacios finales; mes de 1 a 12 sin cero inicial, año de cuatro dígitos distinto de 0000. |
| 165–167 | Concepto | Literal exacto `VAR`. |

Windows-1252 imprimible, sin BOM, ancho por byte y CRLF en todas las filas, incluida la última. No se convierte el archivo ni se corrigen valores automáticamente. La compatibilidad de bytes no prueba qué codificación eligió el programa que los produjo.

La suma y el período se muestran sólo cuando toda la revisión carece de observaciones. Una mezcla de períodos es una incidencia global: no se divide el TXT ni se informa un total parcial. Los tres controles agregados opcionales se conservan; cuando están completos, también se contrasta el total realmente leído contra ambos importes declarados. Igualdad aritmética no demuestra aprobación de una liquidación.

## Descarga y privacidad

El CSV voluntario incluye número de fila de origen, estado, campo/posiciones y acción sugerida. No contiene CBU, CUIL, nombres, legajos, importes, texto del archivo o su huella. Sus mensajes son constantes; celdas entre comillas, separador punto y coma, UTF-8 con BOM y CRLF. Sin observaciones se informa un estado global explícito.

La descarga aparece junto al resumen. El detalle desplegable muestra las primeras 25 observaciones y la descarga incluye todas, también por encima de los 200 diagnósticos físicos de la vista estructural anterior. Cambiar archivo, perfil, ámbito o controles declarados invalida la revisión. Limpiar, ocultar la página, el cambio de capacidades de la sesión o la denegación del gate existente retiran la vista y deshabilitan la descarga. Las lecturas tardías no restauran una revisión retirada. Los buffers propios se limpian al completar la lectura; no se envían a ninguna API ni se persisten.

Se mantienen los límites globales existentes de 4 MiB y 10.000 registros. El exceso rechaza el archivo completo y no habilita una descarga parcial. Este incremento no modifica el límite de importación de novedades ni los guardados pendientes.

## Referencia del sistema anterior

El código 4 de **Forma de pago** del sistema anterior tiene la etiqueta “Transferencia a Caja de Ahorro”. Es una clasificación de pago; no equivale al código de banco ni al tipo de cuenta 1/2 de otro TXT de Credicoop. El “tipo 1” mencionado en el audio no quedó asignado a un campo con evidencia suficiente.

Los reportes históricos “CREDICOP OTROS” y “CREDICOP OTROS2” comparten el literal `VAR`, pero difieren en el tratamiento de Nación y la columna de repartición. No se fusionan sus filtros ni se convierte el reporte ampliado en un TXT de 167 bytes. Estas referencias no gobiernan el padrón o las cuentas propias de MuniControl.

## Validación reproducible

Pruebas focales:

```text
node --test tests/payroll-bank-fixed-width-profiles.test.js tests/payroll-bank-report-workbench.test.js tests/payroll-transfers-var-review.test.js
```

Después de `npm run build`, navegador local con fixtures sintéticos:

```text
node scripts/verify-transfers-var-review-ui.mjs --browser=chrome --output=verification/transfers-var-local-nuevo
```

El verificador usa la sección, CSS y módulos realmente construidos, con servidor local sin API. No sustituye una sesión municipal autenticada o aceptación de Noelia/banco. El workflow bancario existente agrega la misma regresión en Chromium y conserva sus pruebas SQL/HTTP, servicios, permisos y gates originales.
