# Recibos, firmas y controles de liquidación - evidencia del 05/09/2026

## Alcance de esta revisión

Se leyeron y renderizaron completas las seis páginas de los seis PDF nuevos entregados por el usuario. Se comparó su texto con la representación visual y se reprodujo la aritmética con decimales exactos. No se modificaron los originales, no se extrajo la firma para publicarla, no se consultó ni modificó GRH/PostgreSQL y no se generó un recibo firmado.

El objetivo es convertir estos ejemplos en requisitos verificables para MuniControl, no asumir que cualquier valor o leyenda del PDF constituye una validación del origen. Esta nota evita copiar documentos, cuentas, CUIL, legajos, certificados e importes individuales completos al repositorio.

## Fuentes completas y huellas

Todas están en `C:/Users/guill/Downloads/`. Las huellas corresponden a los bytes recibidos, no a versiones reexportadas.

| Referencia | Archivo | Páginas / formato | SHA-256 |
| --- | --- | --- | --- |
| M1 | GUILLEN- MES.pdf | 1 / A4 | `c7994f51f69337ca899606056f8e2ab68e054d6dc9ba5cbcde82661d3cd44f97` |
| B1 | GUILLEN-BONO.pdf | 1 / A4 | `e757eb5d6970817b83f81bf06ebcc30ed4ed4b16b7d658bdbb1e6a0516624684` |
| B2 | SCERCA NOELIA- BONO.pdf | 1 / A4 | `a2e1076a2479839cc99c33c31d8319e74579c828cfb262b52b433e33928ef646` |
| M2 | SCERCA NOELIA- MES AGOSTO.pdf | 1 / A4 | `67133ec2a13e389b555c5aad1b145fa4309fc91193ff08f9c8eec3eeedc25852` |
| I7 | INFORME LIQUIDACION- REP.07 HCD ADMINISTRATIVOS.pdf | 1 / Legal, 612 x 1008 pt | `3f5b64d1ce99c0d0253229150bed4eae13f2d62903ff7fa791ef294a1fdf2f2c` |
| P7 | PLANILLA SUELDO-REP.07 HCD ADMINISTRATIVOS.pdf | 1 / A4 | `167c683c9801a47034042d19f9926a02f5bf55699fdc841e94f68c01c227c694` |

Método: `pypdf 6.14.2`, `PyMuPDF 1.28.0`, renderizado en memoria y `decimal.Decimal`. No se instalaron dependencias ni se guardaron imágenes de las firmas.

## 1. Mensual y bono son documentos distintos

- Los cuatro recibos corresponden a agosto de 2026. Los bonos indican pago el 14/08 y cero días; los mensuales indican pago el 27/08 y 30 días.
- Para cada persona, el campo **Nro Bono se repite entre mensual y bono**. No sirve como clave única aislada.
- B1 y B2 tienen un haber, concepto 550, denominado `BONO NO REMUN.`. Sus retenciones difieren: B2 contiene además el concepto 682. No corresponde aplicar a todas las personas una lista de descuentos idéntica.
- Los mensuales contienen 4 y 8 renglones de haberes, y 5 y 7 de descuentos respectivamente. El mensual M2 incluye asignaciones familiares separadas.
- Un recibo debe identificar municipio, contrato/persona, período, fecha de liquidación/pago, tipo y la identidad de la corrida de origen cuando exista. Agrupar sólo por mes puede mezclar liquidaciones.
- La etiqueta informal "bono" de los archivos no prueba por sí sola qué código de tipo GRH lo originó. No se homologó automáticamente a `O`, `supplementary` ni otro código en esta revisión.

### Campos de negocio que el diseño debe conservar

Municipio, CUIT y domicilio; período y fecha de pago; legajo y referencia de recibo; nombre y CUIL; fecha de ingreso; área, categoría/clase, situación laboral, estructura y cargo; días; conceptos con código, descripción, cantidad/base y monto; totales de haberes, retenciones y neto; banco y cuenta cuando estén informados; datos de la autoridad firmante y estado documental real.

Estos son requisitos extraídos de los ejemplos. No significa que todos esos campos estén hoy disponibles en el contrato de la API de MuniControl.

## 2. Diferencias que no deben copiarse silenciosamente

Los cálculos siguientes usan exclusivamente importes visibles en los PDF. No identifican la causa subyacente ni sustituyen la liquidación fuente.

| Control | M1 | B1 | B2 | M2 |
| --- | ---: | ---: | ---: | ---: |
| Renglones de haberes | 4 | 1 | 1 | 8 |
| Renglones de descuentos | 5 | 3 | 4 | 7 |
| Suma de haberes visibles menos total impreso | +$0,04 | $0,00 | $0,00 | -$0,04 |
| Suma de descuentos visibles menos total impreso | -$0,05 | $0,00 | $0,00 | +$0,07 |
| Haberes totales menos descuentos totales menos neto del encabezado | -$0,10 | $0,00 | $0,00 | +$0,25 |

Los dos bonos concilian exactamente. En los dos mensuales no hay igualdad completa entre renglones, totales y neto. No se puede afirmar que se trate solamente de redondeo, que exista un pago incorrecto ni qué importe hay que reemplazar. Hay que contrastar la corrida de origen, su precisión y reglas con la contadora.

Requisito para MuniControl: un único cálculo en centavos para renglones, subtotales, pie, encabezado y exportaciones. Si el origen ya trae una diferencia, mostrar **"Revisar diferencia"** con sus componentes; conservar el original y no corregirlo sin evidencia. Separar el neto informado del neto calculado para control.

### Informe y planilla de la repartición 07

Ambos documentos muestran agosto de 2026 y H.C.D. Administrativos. El informe comunica 3 liquidaciones; la planilla contiene 3 bloques de personas. Comparten el alcance aparente, pero los PDF no acreditan una misma corrida o fecha de corte exacta.

| Total agregado | Informe I7 | Planilla P7 | P7 menos I7 |
| --- | ---: | ---: | ---: |
| Haberes | $6.082.731,52 | $6.082.731,70 | +$0,18 |
| Retenciones | $1.243.134,36 | $1.243.134,34 | -$0,02 |
| Neto impreso | $4.839.597,16 | $4.839.597,20 | +$0,04 |

- I7 concilia exactamente remunerativos + salario familiar = haberes; suma de retenciones; suma de contribuciones; haberes - retenciones = neto; haberes + contribuciones = costo salarial.
- En P7, la suma de los tres subtotales de haberes y descuentos coincide con cada pie respectivo. La suma de los tres netos visibles coincide con el neto del pie.
- Sin embargo, haberes menos descuentos de P7 da $4.839.597,36: $0,16 más que el neto impreso de la misma planilla.
- P7 muestra varios importes y netos individuales con un solo decimal. Esa presentación pierde precisión para el control; no permite recuperar el valor original de dos decimales por inferencia.
- I7 informa 2 liquidaciones con salario familiar; P7 sólo presenta un renglón visible de asignación familiar, concepto 300. Es otra diferencia de alcance/conteo a contrastar, no una conclusión de error en la base.

Requisito: informe ejecutivo y planilla detallada deben proceder de la misma corrida y huella, aplicar exactamente los mismos filtros y usar dos decimales siempre. El PDF de informe puede ser breve y la planilla detallada paginada; no deben ser cálculos independientes.

## 3. Qué contienen realmente las firmas

| Fuente | Campos de firma `/Sig` | Rangos `/ByteRange` | Evidencia visual |
| --- | ---: | ---: | --- |
| M1 / B1 | 0 / 0 | 0 / 0 | No se observa firma |
| B2 | 2 | 2 | Dos leyendas rojas de firma electrónica |
| M2 | 3 | 3 | Tres leyendas en el contenido; dos están exactamente superpuestas |
| I7 | 0 | 0 | No se observa firma |
| P7 | 0 | 0 | Imagen de firma manuscrita con nombre/cargo al pie |

### Inspección estructural, no validación criptográfica

- Los campos de B2 y M2 declaran `/Filter /Adobe.PPKLite` y `/SubFilter /adbe.pkcs7.detached`.
- Los dos campos de B2 declaran tiempos UTC del 14/08/2026; los tres de M2 del 27/08/2026. Las fechas declaradas no son por sí mismas un sellado de tiempo verificado.
- En B2 los rangos declarados terminan en los bytes 19.998 y 29.301; el archivo tiene 29.301 bytes. En M2 terminan en 20.469, 26.550 y 35.855; el archivo tiene 35.855 bytes.
- Ambos archivos tienen un solo marcador EOF y no exponen `/Prev` en el trailer actual. No se infiere una cadena de revisiones incrementales válida sólo a partir de esos rangos.
- El árbol de campos contiene las firmas citadas, pero la página lista sólo un widget de firma y no se detectó un appearance `/AP /N` allí. Las leyendas visibles están en el contenido de página.
- Sus metadatos Creator/Producer dicen `pdf-lib`. No hay evidencia suficiente para atribuir esas operaciones de firma al motor original de GRH.
- P7 fue generado con JasperReports 5.6.0 / iText 2.1.7 según metadatos. La firma visual es una imagen de 200 x 70 píxeles colocada al pie, sin campos `/Sig`.

No se verificaron digest CMS, integridad de cada revisión, cadena de certificados, identidad de titular, confianza, revocación, sello de tiempo ni efectos jurídicos. No corresponde etiquetar estas firmas como criptográficamente válidas o inválidas a partir de esta inspección.

### Requisitos de implementación

1. Diferenciar **firma visual incorporada** de **PDF firmado criptográficamente**. Un dibujo o leyenda no convierte el PDF en una firma digital validada.
2. Registrar autoridad, municipio, cargo, vigencia y permiso de uso de la firma gráfica; almacenar el activo fuera de recursos públicos. No tomar una imagen del PDF y agregarla automáticamente a cualquier documento.
3. Para firma del servidor se necesita un firmante y material de firma autorizado, no sólo estos PDF. No se puede reconstruir una clave privada a partir de un recibo.
4. Firmar los bytes finales de una versión inmutable y cerrada. No reexportar ni alterar el documento después de firmarlo; una corrección genera una nueva versión con relación a la anterior.
5. Cada acción de emisión/firma debe ser idempotente: una reimpresión no agrega otra firma ni leyendas repetidas. Si hay varios firmantes, deben ser etapas y zonas distintas.
6. Mostrar una sola zona limpia al pie, separada del banco y del neto. M2 tiene leyendas superpuestas y una zona de firma que invade el bloque bancario; no reproducir ese defecto.
7. Conservar hash del PDF, identidad de corrida, actor, fecha, versión de plantilla y resultado de firma/validación. Descargar mediante el circuito autenticado del municipio y del empleado autorizado.

## 4. Situación del producto antes y después de este incremento

### Lo que existe

`assets/payroll-receipt-preview.js` genera un **resumen individual de control**, no el recibo oficial. Exige cierre conciliado, usa importes decimales exactos y conserva contexto municipal. Expone correctamente `officialReceipt: false`, `conceptLinesAvailable: false`, `signed: false`.

`assets/payroll-receipt-center.js` permite buscar una ficha, ver períodos, revisar totales y descargar ese resumen. No obtiene el detalle por concepto, la firma ni evidencia de publicación del recibo. El recurso `employeepayroll` de `api/internal-data.js` devuelve agregados por contrato/fecha/tipo; no expone un ID de corrida/recibo.

### Corrección implementada y probada en este incremento

El nombre anterior usaba solamente mes y legajo, por lo que las descargas mensual y adicional podían tener el mismo nombre. Ahora conserva **fecha completa, tipo legible, código de origen GRH cuando existe y legajo**. La metadata Title del PDF también incluye el tipo y el código de origen.

Las pruebas cubren distintas fechas del mismo mes, los tipos GRH M/O/S/P/V/F, códigos históricos X/Y con la misma etiqueta pendiente y nombres estables al volver a descargar. No cambian importes, permisos ni las declaraciones de documento no oficial/no firmado. No se inventó un ID de liquidación ausente en la API.

La clave del modelo sigue necesitando una identidad de corrida para distinguir futuras liquidaciones del mismo contrato, fecha y tipo. El cambio de nombre resuelve los casos cubiertos, no crea esa granularidad de datos ni un certificado.

## 5. Próximo vertical completo recomendado

**Recibo por corrida con conceptos y control automático**, dentro del recorrido actual:

1. Elegir persona y liquidación concreta; diferenciar mensual, bono/adicional, SAC y otras con fecha/tipo visibles.
2. Recuperar un snapshot consistente con renglones, cantidades, clasificación e identidad de corrida; no usar OCR/PDF como fuente canónica para pagar.
3. Reproducir renglones y totales con una regla única de precisión. Si no cierran, mostrar una comparación concreta y no habilitar emisión definitiva.
4. Ofrecer un PDF profesional único, legible, con detalle, dos decimales, encabezado claro y trazabilidad compacta. Evitar el gran espacio vacío y letra diminuta de los recibos fuente.
5. Añadir la zona gráfica autorizada y luego la firma de servidor cuando exista el firmante configurado; distinguir estados `borrador`, `revisado`, `emitido`, `firmado` y `publicado`.
6. Reutilizar la misma corrida para la planilla por repartición y el informe agregado. Prueba automática: suma de recibos = planilla = informe bajo idénticos filtros.

La lectura de los ejemplos y el arreglo de nombres no completan ese vertical. No deben presentarse como recibos oficiales firmados ni como sustitución de la liquidación fuente.
