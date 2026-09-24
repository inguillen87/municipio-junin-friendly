# Revisión completa de datos de personal y núcleo salarial

## Incremento implementado

`compare-grh-curated-successor.mjs` compara los quince archivos de personal de los respaldos conocidos del 10/09 y 22/09. Se verifican perfil, fecha, identidad lógica, conteos de origen, claves distintas y huellas de los bytes realmente leídos. La extracción estricta existente sigue validando los respaldos SQL/gzip completos; no se ejecuta su SQL. El nuevo comparador no habilita el importador anterior ni tiene modo de aplicación.

El panel **Integración → Revisar un respaldo antes de incorporarlo** incorpora dos formatos: revisión de quince archivos de personal e informe coordinado con el núcleo salarial. Conserva los otros tres formatos, el permiso de trazabilidad y el límite de 256 KiB. Permite mostrar todos los archivos o sólo aquellos con diferencias. Los cinco conjuntos salariales y los quince archivos de personal mantienen tablas y totales separados; no se suman como empleados únicos.

El informe coordinado exige coincidencia exacta del perfil, huella del respaldo y fecha de corte entre ambos informes. Usa el informe salarial anterior validado y relee los quince archivos de personal; no afirma haber repetido la lectura de los artefactos salariales. Cambiar de archivo, limpiar o perder autorización retira ambas partes del resultado.

## Comparación real ejecutada

Se generaron nuevamente los quince artefactos de cada respaldo mediante el extractor estricto, en una carpeta privada fuera del repositorio. El respaldo base corresponde a `5A604ACFE5EA32832B630D8AAB29E494038D4C8940B231E283A53D14112665C7`; el candidato a `8FD91C34E3757A19F3F772631F5734D4934050D4823BC6127B61220236155A8E`.

| Archivo | Base | Candidato | Nuevos | Ausentes | Modificados |
|---|---:|---:|---:|---:|---:|
| Legajos | 2.452 | 2.452 | 0 | 0 | 50 |
| Ausencias | 31.702 | 31.750 | 48 | 0 | 1 |
| Familiares | 3.649 | 3.650 | 1 | 0 | 1 |
| Categorías | 156 | 156 | 0 | 0 | 1 |
| Afiliaciones gremiales | 844 | 845 | 1 | 0 | 0 |

Los otros diez archivos no tienen diferencias de contenido. En los legajos cambian datos laborales en tres registros, identificación en uno, cantidades relacionadas en 46 y afiliaciones en uno. Esas categorías se superponen: no deben sumarse como personas distintas. La diferencia de categoría corresponde a `baseSalary`; no se publica su importe nominal. La diferencia de familiar existente corresponde a su fecha de fin, sin inferir la causa.

## Precisión y límites

Los números de los JSON se comparan conservando sus tokens decimales, antes de cualquier redondeo binario adicional. Nulo, cero, cadena y campo ausente son distintos. Esta verificación de archivos extraídos no es una certificación de cálculos salariales, pago o situación laboral vigente.

La salida sólo contiene cantidades, nombres de campos admitidos, fechas y huellas. No incluye personas, salarios, rutas locales, credenciales ni documentos. El navegador no envía el informe; las pruebas de interfaz utilizan datos y API sintéticos. Los respaldos reales, sus extracciones y el informe agregado de esta ejecución quedan fuera de Git.

**Esta entrega no promueve la fuente del 22/09 ni modifica Neon.** Sigue pendiente la selección sucesora versionada, la conciliación contra la base operativa y la preservación de registros nativos, con aceptación de capacidad y restauración. El requisito del módulo 10 de Noelia —cargos liquidados contra el presupuesto del ejercicio— y la emisión de recibos del módulo 9 no se sustituyen por esta revisión de fuentes.
