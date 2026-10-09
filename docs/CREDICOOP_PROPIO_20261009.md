# Credicoop desde la nómina propia — 09/10/2026

Nómina → Salida bancaria → Credicoop permite preparar el TXT de acreditación de 30 posiciones y descargar Excel/CSV de control. Parte de una emisión propia aprobada, cada cierre original y las cuentas propias aprobadas vigentes en la fecha declarada. No requiere un empleado en GRH ni archivos previamente calculados por ese sistema.

El operador elige expresamente jurisdicción 42 o 55 y todas las cuentas, caja de ahorro o cuenta corriente. El CBU aprobado identifica el destino bancario 191; el tipo de cuenta procede del dato aprobado. La sucursal, cuenta y verificador deben estar declarados en el número aprobado como `SSS-NNNNNN-V`, con constancia y revisión independiente. No se extraen del CBU, del legajo o del nombre, ni se calcula un verificador no documentado. Una corrección se prepara en Cuentas bancarias, conservando el circuito de aprobación e historial existente.

## Diseño y fuentes

Perfil `credicoop-junin-30.202608.v1`, contrastado estructuralmente con las muestras municipales entregadas por Noelia en agosto: registros numéricos de 30 posiciones, código 191, tipos 1/2 y verificador repetido. No se publican sus bytes ni datos personales.

| Posiciones | Campo |
| --- | --- |
| 1 | Tipo: 1 cuenta corriente, 2 caja de ahorro |
| 2–4 | Código 191 del perfil municipal |
| 5–7 | Sucursal declarada, tres dígitos |
| 8–13 | Cuenta declarada, seis dígitos conservando ceros |
| 14–15 | Verificador declarado, repetido |
| 16–30 | Importe exacto en centavos, quince dígitos con ceros a izquierda |

ASCII numérico, sin BOM, CRLF y terminador final. Cada recibo seleccionado conserva un registro separado. La fecha y moneda se declaran para la vigencia y el control; no están codificadas en este diseño. El operador debe confirmar con el banco la admisión del perfil y moneda antes de revisar el TXT.

La [documentación SIU/UNL](https://documentacion.siu.edu.ar/wiki/SIU-Mapuche/Version3.4.4/Documentacion_de_las_operaciones/servicios/acreditacion/exportar_para_bancos) describe esas longitudes, tipos y centavos, pero indica el antiguo código 344. Esa especificación no se sustituye por la muestra municipal 191 como si fueran idénticas, ni acredita la vigencia del convenio. La generación y aceptación bancaria son hechos distintos. Los diseños de transferencias a otros bancos y de Santander requieren sus propios perfiles; no se cambian anchos para hacerlos parecer compatibles.

## Control de población y precisión

La revisión contiene toda la emisión. Cada recibo muestra si se incluye y, en caso contrario, si corresponde a otra entidad, jurisdicción o tipo. Búsqueda y paginación sólo cambian la vista. Excel contiene todas las filas, agrupaciones completas y procedencia, más la selección, campos declarados y observaciones Credicoop. CSV también conserva toda la emisión.

Un destino faltante, tipo Credicoop desconocido o jurisdicción original ausente impide asegurar la selección completa. Dentro de la selección, una cuenta sin diseño válido, neto cero/negativo, fracción de centavo, importe fuera del campo o moneda discordante impiden el TXT; no se omiten filas ni se redondea. Un CBU repetido requiere decisión expresa de mantener cada recibo separado, sin sumarlos. La constancia bancaria y su titularidad no se certifican por un dígito de control.

Los importes y datos identificadores del Excel son texto literal, sin fórmulas o conversión a números de coma flotante. Los totales se concilian con enteros de centavos de cada neto original aprobado. La fuente del control conserva la repartición, jurisdicción y tipo de liquidación originales.

## Descarga y acceso

Cada descarga voluntaria reconsulta emisión, todos los cierres, cuentas y sesión antes y después de generar los bytes. Una fuente, revisión, cuenta, fecha, moneda, jurisdicción, tipo o decisión distinta retira la previa. Ocultar la página, cambiar de tarea, vencer la sesión o retirar permisos borra vistas y confirmación; una respuesta tardía no las restaura. No se usan `localStorage` o `sessionStorage` ni se agregan escrituras desde el panel.

Se conservan BNA GT y la planilla completa anteriores. Este incremento no instala SQL, cambia cuentas reales, presenta remesas, ordena transferencias ni acredita pagos. Su aceptación real por Noelia y el banco sigue pendiente.

Pruebas: `tests/own-bank-output-credicoop.test.js` y las regresiones bancarias previas. `scripts/verify-own-bank-output-ui.mjs` ejecuta el circuito propio SQL/HTTP/Chrome con población exclusivamente sintética, conserva los controles previos y concilia los TXT J42/J55 de cada tipo con cuentas y netos originales mediante un decodificador independiente.
