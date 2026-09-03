# Requerimientos de reportes de liquidación — evidencia de Noelia (2026-09-03)

## Objetivo y regla de lectura

Este documento convierte dos entregables de trabajo municipal en requerimientos trazables para MuniControl:

- `MODULO DATOS MUNI- REPORTES.pdf`, leído completo: 3 páginas.
- `AGOSTO-20260902T125117Z-1-001 (1).zip`, inventariado de forma recursiva, incluidos sus dos ZIP anidados.

Los adjuntos fueron analizados en modo de solo lectura. No se reproducen credenciales, nombres de empleados, documentos, cuentas bancarias, domicilios ni otros datos personales. Las capturas y archivos prueban formatos y prácticas del período observado; no certifican por sí solos una regla legal, contable o laboral general.

Se usan tres niveles de evidencia:

- **Requerimiento explícito**: pedido escrito en el PDF.
- **Regla observada**: estructura, fórmula o formato presente en los archivos de agosto.
- **Propuesta**: decisión de producto que debe validarse antes de considerarla obligación municipal.

## Requerimientos explícitos del PDF

La página 1 ubica el trabajo en `Liquidación de sueldos → Reportes → Ejecutar reportes`. Las páginas 2 y 3 solicitan:

| ID | Requerimiento explícito | Salida y alcance |
|---|---|---|
| REP-01 | Bancarización por departamento | Excel para Credicoop, Santander y Banco Nación Control, con los mismos datos hoy obtenidos de GRH |
| REP-02 | Acreditación Banco Credicoop | TXT con el formato exacto del archivo de acreditación, separado para jurisdicciones 42 y 55 |
| REP-03 | Acreditación Banco Nación | Salida equivalente a GRH Web, separada para jurisdicciones 42 y 55 |
| REP-04 | Transferencias varias | Renombrar `Credicoop Otros` a `Transferencias varias`; generar Excel y TXT como GRH |
| REP-05 | Exportación OSEP | Salida equivalente a GRH |
| REP-06 | Exportación Seguro Mutual | Salida equivalente a GRH |
| REP-07 | ART Provincia | Excel con DNI, CUIL, sexo, días trabajados y sueldo. El sueldo se define como concepto 993, bruto sujeto a descuento, más concepto 995, asignaciones familiares |
| REP-08 | Control de escolaridades | Planilla Excel |
| REP-09 | F.931 ARCA | Tres TXT según mes, año y tipos de liquidación —mensual más suplementarias del período—, actividad todas y separación por jurisdicciones 42 y 55 |

El pedido dice “igual que GRH” en varios puntos. Eso define una meta de compatibilidad, no autoriza a asumir el esquema: cada salida debe fijarse mediante un perfil versionado y una muestra de conformidad.

## Feedback de audio del 3 de septiembre

Los audios `18.45.47` y `18.46.58` agregan dos pedidos funcionales. Se registran como requisitos de descubrimiento y no como reglas ya homologadas:

- **Importación por código**: Noelia solicita un módulo para importar archivos cuyo formato cambia según el código. Debe existir un catálogo versionado `código → perfil`, previsualización, validación de filas, informe de rechazados, confirmación humana y auditoría. Noelia enviará capturas y muestras para fijar los diseños.
- **Impacto en Mayores**: Noelia tiene pendiente una reunión con GRH para confirmar cómo impactan esas cargas en Mayores. Hasta recibir esa definición, MuniControl puede validar y preparar borradores, pero no debe generar asientos ni afirmar una integración contable.
- **Anulación y nueva liquidación**: el segundo audio pide un módulo para “anular y liquidar la liquidación”; la palabra final podría ser “reliquidar”. Antes de automatizarlo hay que confirmar el término y el circuito. En cualquier variante, el original debe conservarse, el motivo debe ser obligatorio, la nueva versión debe quedar vinculada y la ejecución debe requerir autoridad explícita.

La prioridad derivada es construir primero el importador guiado y su catálogo de formatos. El impacto contable y la anulación/reliquidación permanecen bloqueados por definición funcional, no por una limitación técnica de la interfaz.

## Inventario agregado del ZIP

### Volumen y formatos

| Tipo | Cantidad |
|---|---:|
| PDF | 187 |
| TXT | 81 |
| XLSX | 50 |
| XLS | 7 |
| DOC | 10 |
| DOCX | 4 |
| ZIP anidado | 2 |
| Extensión atípica/no verificada | 1 |
| **Total** | **342** |

- Tamaño del contenedor: aproximadamente 42,8 MB.
- Payloads únicos por hash: 262.
- Grupos con contenido duplicado: 60; copias redundantes: 80.
- La duplicación se concentra, entre otros lugares, en carpetas de `ACREDITACION` y `ACREDITACION- PLANILLAS`, y en planillas repetidas entre liquidación y rendición.
- Los dos ZIP anidados contienen 13 y 48 archivos respectivamente y repiten en gran medida material que también aparece extraído en carpetas hermanas.

MuniControl no debe almacenar cada copia como un nuevo artefacto. La propuesta es conservar una única evidencia por hash y relacionarla con los procesos o carpetas de origen.

### Distribución funcional principal

Las agrupaciones más voluminosas son:

| Agrupación observada | Archivos |
|---|---:|
| Liquidación mensual / descuentos | 85 |
| Liquidación mensual / acreditación-planillas | 49 |
| Liquidación mensual / planillas de liquidación | 29 |
| Preliquidación SEOS / planillas previas | 19 |
| Liquidación mensual / acreditación | 19 |
| Rendición jardines / planillas de liquidación | 17 |
| Liquidación mensual / Casa de Gobierno | 16 |
| Acreditación de bono/vacaciones | 14 |
| Mayores / Full | 11 |
| Comprobantes de capacitación | 10 |
| ART mensual | 9 |

### PDFs

Los 187 PDF suman 2.225 páginas y pudieron leerse sin errores de estructura.

| Familia | Archivos | Páginas |
|---|---:|---:|
| Planillas de liquidación | 104 | 547 |
| Recibos | 2 | 1.367 |
| Resúmenes | 23 | 49 |
| Informes de liquidación | 5 | 34 |
| Soportes de descuentos | 16 | 29 |
| Rendiciones | 6 | 160 |
| F.931 | 6 | 6 |
| Comprobantes | 5 | 6 |
| Carátulas | 5 | 5 |
| Otros | 15 | 22 |

Evidencia representativa:

- `RESUMEN GRAL 08.2026- TODAS LIQUIDACIONES.pdf`, 3 páginas: estadística por concepto con ocurrencia, cantidad, haberes con y sin retención, asignaciones familiares, retenciones y contribuciones; ofrece exportación Excel, XML y PDF y calcula totales de haberes menos retenciones y haberes más contribuciones.
- `TOTAL GENERAL CASA DE GOBIERNO.pdf`, 3 páginas: total general y cortes por jurisdicción 42/55, aportes personales, contribuciones patronales y controles obligatorios.
- `INFORMES LIQUIDACION/J42/REP.01 A REP.16.pdf`, 10 páginas: desglose por repartición con metadatos de liquidación, cantidad de empleados, conceptos, neto y costo salarial.
- `Reporte-ART (1).pdf`, 1 página: constancia de presentación con período, cantidad de empleados, masa salarial, cuota y total a pagar.

Los documentos DOC/DOCX son plantillas de notas relacionadas con ART, SEOS, novedades, presentismo, embargos y mutual. Son candidatos a automatización documental posterior, no una fuente suficiente para programar cálculos.

## Perfiles de exportación TXT observados

Los 81 TXT no conforman un único formato. Predominan registros de ancho fijo, con mezcla de UTF-8 con BOM y Windows-1252. No deben tratarse como CSV genérico.

| Perfil observado | Registros de muestra | Ancho por registro |
|---|---:|---:|
| Credicoop, jurisdicción 42 | 165 | 30 |
| Credicoop, jurisdicción 55 | 8 | 30 |
| Control Credicoop, jurisdicción 42 | 165 | 66 |
| Control Credicoop, jurisdicción 55 | 8 | 66 |
| Santander/Nación `GT_PAGOS`, jurisdicción 42 | 394 | 200 |
| Santander/Nación `GT_PAGOS`, jurisdicción 55 | 85 | 200 |
| Transferencias varias | 47 | 167 |
| OSEP, dos poblaciones | 731 / 111 | 206 |
| OSEP, perfil alternativo | 759 | 185 |
| Seguro Mutual, jurisdicciones 42/55 | 672 / 107 | 121 |
| F.931 general | 790 | 463 |
| F.931 por jurisdicción | 742 / 112 | 463 |
| F.931, tres salidas adicionales | 742 / 147 / 111 | 463 |
| Mayores / Full | variable | 13 / 14 |
| Entidades y descuentos | variable | 18, 49, 52, 54/55, 58, 62, 76 u 80 |

Los conteos F.931 no prueban que los tres archivos sean una partición simple del general: las poblaciones pueden superponerse o responder a filtros distintos. La semántica exacta debe validarse campo por campo.

Cada perfil de exportación debe declarar y probar:

- versión y vigencia;
- fuente y filtros;
- ancho, posición, relleno y alineación de cada campo;
- encoding, BOM y fin de línea;
- formato de fechas y decimales;
- nombre del archivo;
- cantidad de registros y total de control;
- hash del artefacto;
- muestra de referencia y prueba byte a byte.

## Planillas y fórmulas observadas

### Inventario técnico

- 50 entradas XLSX, 45 contenidos únicos.
- 148 hojas entre los contenidos únicos.
- 10.532 fórmulas.
- 42 fórmulas con vínculos a otros libros, señal de fragilidad y dependencia manual.
- Los 7 XLS legacy pudieron abrirse e inventariarse por hojas, dimensiones y valores cacheados. La herramienta disponible no expone las expresiones de fórmula de XLS, por lo que esas fórmulas quedan **no verificadas**.

### Estructuras relevantes

1. `PLANILLA CONTROL GENERAL 08.2026.xlsx`
   - Ocho hojas: Credicoop J42/J55, Santander J42/J55, Transferencias funcionarios, Transferencias varias y Banco Nación J42/J55.
   - Columnas recurrentes: secuencia, CUIL, apellido y nombre, neto a pagar y reparto; algunas hojas agregan datos de cuenta.
   - Usa secuencias y subtotales manuales por reparto o jardín.
   - Una hoja conserva formato hasta la fila máxima de Excel aunque el rango real es mucho menor. La importación debe detectar celdas efectivamente usadas, no confiar en `max_row`.

2. `CONTROL DE JURISDICCION.xlsx`
   - Una hoja `CONTROL`, con totales de jurisdicciones 42 y 55 y una diferencia de conciliación.

3. Plantilla de acreditación Santander
   - Hojas: Ayuda, Pagos, Beneficiarios, Liquidaciones y Retenciones.
   - En `Pagos`: orden de pago, razón social, tipo de documento, CUIT/CUIL, fecha, importe, fecha de emisión, total de liquidación, retenciones y pago.
   - Se observaron ajustes manuales de centavos incorporados directamente en fórmulas. Deben reemplazarse por una regla explícita de redondeo y un ajuste auditado.

4. Plantillas ART
   - `plantilla_presentacion_extra-suss (5).xlsx`: 793 filas y 8 columnas; incluye CUIL, nombre, sexo, días trabajados, fecha de nacimiento y sueldo.
   - `PLANILLA GALENO ART AGOSTO 2026.xlsx`: 866 filas y 9 columnas.
   - `Planilla de ART AGOOSTO 2026.xls`: hoja mensual de 18 x 23 con totales remunerativos, no remunerativos y asignaciones familiares; fórmulas legacy no verificadas.
   - `PLANILLA RESUMEN ART...xls`: resumen de 23 x 7 con categorías y totales; fórmulas legacy no verificadas.

5. `TOPE 45_.xlsx`
   - 1.000 filas, 11 columnas y 5.123 fórmulas.
   - Encabezados observados: legajo, persona, remunerativo sin salario/concepto 993, descuentos de ley 16,5 %, subtotal y retenciones GRH/concepto 996.
   - Fórmulas observadas: descuentos de ley = remunerativo × 0,165; subtotal = remunerativo − descuentos; referencia de tope = subtotal × 0,45.
   - Es una regla observada, no una norma homologada. Debe parametrizarse por vigencia y contar con aprobación contable/legal antes de afectar liquidaciones.

6. `Escala Salarial 08.2026.xlsx`
   - 57 filas, 14 columnas y 116 fórmulas.
   - Aplica incrementos porcentuales encadenados. Requiere versionado por fecha efectiva, cargo/convenio y fuente del acto administrativo.

7. Descuentos por entidad
   - Estructura frecuente: legajo, persona, documento, concepto e importe, con hojas General/J42/J55 y total por suma.

8. `TOTAL GENERAL CASA DE GOBIERNO.xlsx`
   - Hojas Total general, J42 y J55.
   - Combina jurisdicciones y referencias externas; incluye offsets manuales no explicados. Esos ajustes deben convertirse en conceptos nombrados, con fundamento y auditoría.

9. OSEP y Seguro Mutual
   - Control OSEP: poblaciones de 747 y 113 filas, 13 columnas, incluidos haberes sujetos a descuento y neto.
   - Control Seguro Mutual: hojas J42/J55, secuencias y totales.

10. Garantías, cláusulas y Mayores/Full
    - Planillas de garantías: horas, concepto 993, bruto ajustado y diferencias.
    - Preliquidación de cláusulas: siete hojas por grupo; se observan comparaciones contra objetivo y factor 0,81. El significado y alcance de ese factor no están certificados.
    - Mayores/Full: hoja de novedades más salidas calculadas; algunos campos multiplican porcentajes por 100 antes de producir TXT de 13/14 caracteres.

11. Rendiciones y declaraciones
    - Cajas asistenciales: concepto, descuentos, contribuciones, retenciones y total a depositar.
    - Jardines: 17 hojas por establecimiento con cargos, horas y suplencias.
    - SEOS: importes recibidos, nómina, totales y novedades.
    - Capacitaciones: 14 hojas municipales con participantes, centro, documento, importe y total.

12. Embargos
    - Embargos alimentarios: 19 hojas individuales más resumen, porcentajes y restas manuales variables.
    - Embargos comerciales: hojas J42/J55 con cuenta, CBU, importe y datos identificatorios.
    - Es información sensible y de alto impacto. No debe automatizarse desde nombres de hojas ni reglas implícitas. Requiere expediente/instrumento, base, porcentaje o monto fijo, ítems protegidos, vigencia, prioridad, beneficiario, destino bancario, doble aprobación y correcciones compensatorias.

## Reglas de negocio trazables

### Explícitas

- ART: `sueldo reportado = concepto 993 + concepto 995`.
- Acreditaciones y reportes deben poder separarse por jurisdicciones 42 y 55.
- F.931 considera período, mensual y suplementarias del mes, actividad todas y tres salidas TXT.
- Transferencias varias debe reemplazar el nombre anterior en pantalla y salida.

### Observadas, pendientes de homologación

- Descuentos de ley calculados al 16,5 % en la planilla de tope.
- Base posterior a descuentos y referencia del 45 % para comparar retenciones.
- Incrementos salariales encadenados por período.
- Subtotales por reparto, jardín, banco, concepto y jurisdicción.
- Ajustes manuales de centavos y offsets de consolidación.
- Factor 0,81 en planillas de cláusulas/garantías.
- Porcentajes particulares por expediente en embargos.

Ninguna regla observada debe modificar nómina o generar un envío oficial hasta que tenga dueño funcional, fuente normativa, fecha de vigencia, pruebas de regresión y aprobación.

## Requerimientos funcionales priorizados

### P0 — demostrable y de riesgo controlado

1. **Centro de reportes de Liquidación**
   - Filtros: mes, año, tipos de liquidación, actividad, jurisdicción, repartición, banco/entidad.
   - Estados honestos: disponible, requiere datos, en validación o no implementado.
   - Previsualización, advertencias, totales y fuente/corte visibles.

2. **Generador ART Provincia**
   - Tabla previa con los campos explícitamente pedidos.
   - Cálculo versionado 993 + 995.
   - Validación de documentos, sexo, días, conceptos faltantes y duplicados.
   - Exportación XLSX compatible y PDF profesional de control.

3. **Ejecución auditable de reportes**
   - Actor, tenant, filtros, versión de fórmula/perfil, corte, conteos, totales, validaciones, hash y estado de aprobación.
   - No guardar PII en logs operativos.

### P1 — automatización del trabajo repetitivo

4. **Paquete de bancarización**
   - Credicoop, Santander, Nación y Transferencias varias.
   - Excel de control más TXT de ancho fijo.
   - Separación J42/J55 y conciliación contra neto de liquidación.

5. **OSEP y Seguro Mutual**
   - Perfiles versionados y controles de totales por concepto/jurisdicción.

6. **Resumen por concepto y jurisdicción**
   - Ocurrencias, cantidades, haberes, asignaciones, retenciones, contribuciones, neto y costo salarial.
   - Excel y PDF; XML sólo si se valida un consumidor real.

### P2 — compatibilidad regulatoria y rendiciones

7. **F.931 ARCA**
   - Tres TXT de 463 caracteres por registro sólo después de fijar layout, filtros y muestra aprobada.
   - Pruebas byte a byte, conciliación y doble aprobación.

8. **Escolaridades, SEOS, jardines, Cajas asistenciales y Mayores/Full**
   - Captura estructurada de novedades, generación de planillas y documentos, y seguimiento de rendición.

### P3 — casos sensibles

9. **Embargos, escalas y garantías**
   - Modelo por instrumento y vigencia, maker-checker, simulación y auditoría inmutable.
   - Nunca inferir una obligación desde una planilla personal o un nombre de archivo.

## Primer incremento implementable

### Alcance: Generador ART + catálogo de reportes

Este incremento combina el pedido más específico del PDF con dos plantillas reales y evita comenzar por transferencias bancarias o F.931, que tienen mayor riesgo operativo.

Flujo propuesto:

1. Elegir mes, año y ámbito: Todo, J42 o J55.
2. Mostrar una vista previa autorizada con DNI, CUIL, sexo, días trabajados, concepto 993, concepto 995 y sueldo calculado.
3. Señalar faltantes, duplicados e inconsistencias sin corregirlos silenciosamente.
4. Conciliar cantidad de empleados y masa salarial contra el resumen del mismo corte.
5. Generar Excel con el orden de columnas validado y un PDF de control legible.
6. Registrar ejecución, versión de fórmula, filtros, totales, resultado de validaciones y hash.
7. Requerir aprobación autorizada antes de habilitar la descarga final.

### Criterios de aceptación

- El sueldo de cada fila reproduce `993 + 995` con una versión de regla visible.
- Los ámbitos Todo/J42/J55 producen poblaciones y totales reproducibles.
- Un documento, sexo, cantidad de días o concepto obligatorio faltante bloquea la exportación final y muestra el motivo.
- No hay duplicados silenciosos por persona, liquidación y período.
- Excel abre sin reparación y conserva orden, tipo y formato de campos acordado.
- El PDF incluye período, ámbito, fuente, corte, cantidad, total, estado y aprobaciones, sin publicar información innecesaria.
- Repetir la ejecución con los mismos datos y versión produce el mismo contenido y hash.
- Los logs técnicos no contienen documentos completos, cuentas ni nombres.
- Pruebas con fixture anonimizado de agosto cubren cálculo, división jurisdiccional, totales, faltantes y duplicados.

### Modelo mínimo sugerido

- `report_definition`: catálogo, versión, ámbito y estado.
- `report_export_profile`: campos, posiciones, encoding, formato y vigencia.
- `report_run`: tenant, período, filtros, fuente/corte, actor, estado y aprobación.
- `report_validation`: regla, severidad, conteo y resultado.
- `report_artifact`: tipo, nombre, tamaño, hash y retención; no duplicar contenido con el mismo hash.

Estas entidades son una propuesta de implementación, no una estructura observada en GRH.

## Orden de sprints sugerido

1. **Sprint A**: catálogo de reportes, Generador ART, validaciones, Excel/PDF y auditoría.
2. **Sprint B**: perfiles Credicoop 30/66, Transferencias 167 y `GT_PAGOS` 200; conciliación bancaria y J42/J55.
3. **Sprint C**: OSEP 185/206, Seguro Mutual 121 y resumen por conceptos.
4. **Sprint D**: F.931 463 con muestra aprobada y pruebas byte a byte.
5. **Sprint E**: escolaridades, rendiciones, declaraciones y documentos automáticos.
6. **Sprint F**: embargos, escalas y garantías sólo con reglas homologadas y doble control.

## Riesgos y límites

- **Compatibilidad**: “igual que GRH” no reemplaza una especificación de campos.
- **Regulación**: F.931, embargos y aportes exigen validación contable/legal y no deben enviarse automáticamente en el primer incremento.
- **Redondeo**: existen correcciones manuales de centavos; deben explicitarse y auditarse.
- **Fórmulas externas**: 42 referencias entre libros pueden quedar rotas o apuntar a un período equivocado.
- **Datos sensibles**: recibos, embargos y archivos bancarios requieren acceso por rol, cifrado, retención limitada y ausencia de PII en logs.
- **Duplicación**: 80 copias redundantes pueden producir doble conteo si se importa por ruta en lugar de hash y clave de negocio.
- **XLS legacy**: las expresiones de fórmula no quedaron verificadas; no se deben migrar como regla hasta leerlas con una herramienta compatible o recibir una versión XLSX.
- **Costo**: almacenar metadatos, hashes y artefactos finales evita persistir copias redundantes o recalcular reportes idénticos.
- **Veracidad de producto**: un botón o reporte sin backend y validaciones debe mostrarse como pendiente, no como operativo.

## Validaciones pendientes con el área contable

1. Layout campo por campo y encoding de cada TXT.
2. Semántica de las tres salidas F.931 y relación entre sus poblaciones.
3. Regla oficial de redondeo y tratamiento de diferencias de centavos.
4. Fuente normativa y vigencia del 16,5 %, 45 %, 0,81 y cada offset manual.
5. Inclusión de liquidaciones suplementarias, retroactivos, bonos y vacaciones por reporte.
6. Definición exacta de días trabajados y sexo para ART.
7. Claves de conciliación entre persona, legajo, jurisdicción, reparto, banco y liquidación.
8. Qué XML tiene un consumidor real y qué documentos sólo se conservan por archivo.
9. Roles que preparan, revisan, aprueban, descargan y eventualmente envían cada salida.

## Definición de terminado

Un reporte está terminado cuando parte de un corte identificado, reproduce las reglas aprobadas, informa toda inconsistencia, concilia cantidades y totales, genera un artefacto conforme, conserva trazabilidad y puede regenerarse con el mismo resultado. La similitud visual o la presencia de un botón no constituyen terminación.
