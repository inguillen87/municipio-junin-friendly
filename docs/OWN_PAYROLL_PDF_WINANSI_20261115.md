# PDF propio: WinAnsi completo y error por legajo

Cambio prospectivo sobre PR291 `113cc26590ec2eb89517a9854765b148b0355305`. Responde al hallazgo de Claude en [PR270, comentario 6902417451](https://github.com/inguillen87/municipio-junin-friendly/pull/270#issuecomment-6902417451).

## Fuentes primarias

- [Unicode: CP1252.TXT, tabla 2.01](https://www.unicode.org/Public/MAPPINGS/VENDORS/MICSFT/WINDOWS/CP1252.TXT): define 27 asignaciones en 0x80–0x9F; 0x81, 0x8D, 0x8F, 0x90 y 0x9D no están definidas. La elipsis U+2026 corresponde a 0x85.
- [Adobe PDF Reference 1.6, apéndice D, tabla D.1 y §D.1, pp. 924–928](https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/pdfreference1.6.pdf): identifica WinAnsi con Windows Code Page 1252 y documenta las posiciones de sus glifos para las fuentes latinas estándar. La elipsis ocupa 205 octal, equivalente a 0x85.

## Implementación

`assets/own-payroll-pdf-kit.js` completa las 27 asignaciones. Conserva los bytes imprimibles ASCII 0x20–0x7E, Latin-1 0xA0–0xFF, las asignaciones previas y el alias existente U+2212→0x2D. Las tablas de anchos de Helvetica y Helvetica-Bold permanecen intactas.

El codificador rechaza C0, DEL y C1 como caracteres Unicode crudos; no los reinterpreta como glifos WinAnsi. `fit` comprueba esos controles antes de separar espacios y valida cada palabra después. Conserva la distribución previa de espacios Unicode, incluidos U+2003, U+2028 y U+FEFF interiores: en una línea se imprimen con la misma separación ASCII de antes. La codificación y medición directas siguen rechazando esos caracteres fuera de una distribución de líneas. Los glifos fuera de la codificación, como «→», siguen rechazados con `OWN_PDF_UNSUPPORTED_CHARACTER`, también si forman una palabra de un solo carácter. No se agregan transliteraciones de glifos ni se omiten recibos.

`assets/own-payroll-receipt-pdf.js` contextualiza los errores de texto y cantidad en el límite de generación de cada registro completo: encabezado, cargo, conceptos, notas y pie. El mensaje empieza una sola vez con `Legajo N: `. Se elimina el prefijo interior de `entry`, conservando el código y texto de los errores de cantidad.

El cargo `Técnico… de redes` ya se imprime. `Auxiliar → Obras` conserva su valor en el contrato de datos y detiene la generación del PDF con el legajo exacto, también cuando es el segundo registro del lote. No devuelve un PDF parcial. No se modifican contratos de cargo, importes ni cantidades.

## Verificación pura

**23/23 casos focales PASS, sin omisiones:** 9 nuevos de codificación/contexto, 7 de origen de recibos y 7 de columna de cantidades. Incluyen las 27 asignaciones, fuentes regular/negrita, coherencia de hex/ancho/ajuste, los 65 controles C0/DEL/C1, rechazo de glifos no representables, compatibilidad de espacios Unicode, V6 con elipsis y fallo del segundo recibo con legajo exacto. Los datos se generan sólo con fixtures sintéticas existentes.

Comando reproducible:

```sh
node --test tests/own-payroll-pdf-winansi.test.js tests/own-payroll-receipt-origin.test.js tests/own-payroll-receipt-quantity-column.test.js
```

El kit también es compartido por las planillas. La verificación integrada agregó sus pruebas de exportación y disposición: **57/57 PASS**, cero fallos y cero omitidas.

```sh
node --test tests/own-payroll-pdf-winansi.test.js tests/own-payroll-receipt-origin.test.js tests/own-payroll-receipt-quantity-column.test.js tests/own-payroll-receipt-planilla.test.js tests/own-payroll-planilla-layout.test.js
```

La revisión independiente contrastó las 27 posiciones, el wrapper por registro, la conservación de espacios y la ausencia de cambios de importes, sin encontrar bloqueantes.

Los cinco golden V1–V5 de PR287 conservan exactamente sus SHA-256:

| Versión | SHA-256 del PDF sintético |
| --- | --- |
| V1 | `56f4097f0441292bc294bca9fce7c8d1eabc9ac1e6d04a5af07001f547774f83` |
| V2 | `2b017e4c73ad4b255256c0dabd3fcbde87b82dce2ed538cdd2c5d765d5f1dc20` |
| V3 | `56f4097f0441292bc294bca9fce7c8d1eabc9ac1e6d04a5af07001f547774f83` |
| V4 | `f720ced61c0c34639649c81399044e4cd2954c9c9224323ce9e0e27989af0e9d` |
| V5 | `b301ec87e9f9260ac0c78d8f5d9484ae8b66f05d6fe2b71086c93811bf96dcf2` |

No se ejecutaron SQL, CI, host ni instalaciones, ni se abrieron PDFs o datos municipales.
