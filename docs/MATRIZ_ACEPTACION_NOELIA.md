# MuniControl · Criterios de aceptación derivados de los módulos de Noelia

Esta matriz no declara que el reemplazo de GRH esté completo. Distingue requerimientos de la documentación entregada, avances comprobables en código y funciones pendientes. Los PDF originales y sus capturas permanecen fuera del repositorio; no se publica información nominal ni la firma. Una fórmula visible en una captura no se sustituye por una tasa supuesta.

Actualización al 23/09, sobre la base `e2b4a18`: [mensuales nativas 101](NOELIA_NATIVE_MONTHLY_101.md) y [familia/escolaridad nativas 102](NOELIA_NATIVE_FAMILY_102.md) ya tienen cierre técnico de producción registrado. El [catálogo propio 103](NOELIA_NATIVE_EMPLOYMENT_CATALOG_103.md) está implementado en la rama del incremento; su CI, instalación y publicación se acreditarán por recibo, y todavía no hay un catálogo municipal realmente aprobado. Consultar el [estado integral por responsable](ESTADO_INTEGRAL_NOELIA_HUGO_MARIANO_20260921.md) para la evidencia y los límites. Un paquete de control no equivale a un exportador homologado ni a una liquidación propia terminada.

## 1. Datos del municipio y 2. Reportes
Fuente: `1º-2º MODULO DATOS MUNI- REPORTES`, páginas 1–3; `REUNION 09/09/2026`, páginas 1–2.

| Pedido original | Aceptación funcional | Estado y dependencias |
|---|---|---|
| Desglosar los distintos listados | Elegir reporte, período y alcance, consultar datos conservados y exportar el mismo resultado | 053 integra biblioteca, filtros y agregados de conceptos. No equivale a los formatos bancarios. |
| Bancarización-DPTO | Excel por Credicoop, Santander y Nación, conservando los datos del reporte de origen | Pendiente generación desde cuentas y población del período validadas. |
| Credicoop: todas, caja de ahorro y cuenta corriente | Selector controlado; Excel y TXT para J42/J55 | Pendiente homologación campo por campo. |
| Santander y Nación: caja de ahorro | No ofrecer cuenta corriente como criterio admitido por el pedido | Mantener restricción en el exportador correspondiente. |
| Transferencias varias | Renombrar Credicoop Otros; salidas Excel y TXT como GRH | Pendiente exportador completo, no confundir con validador de archivos. |
| Exportación OSEP y Seguro Mutual | Conservar sus formatos de origen y conciliación | Validadores existentes no acreditan generación terminada. |
| ART Provincia | Excel de todos los agentes liquidados: DNI, CUIL, sexo, días trabajados, sueldo=993+995 | No sustituir días faltantes por 30; falta enlazar población y campos nominales autorizados. |
| Escolaridad | Activos con hijos; presentación y vencimiento de certificados; Excel | Usar padrón activo, no todos los liquidados. La carga manual de certificado desde legajo también fue pedida. |
| F.931 | Tres TXT: total/J42/J55 por mes/año y mensual más suplementarias | Pendiente diseño completo validado, no inferir campos monetarios de un ancho de archivo. |

## 3. Importación de novedades
Fuente: `3º MODULO IMPORTACION DE NOVEDADES`, páginas 1–8.

- Mayor dedicación 44 y Full Time 95: secretarías aportan cantidades que hoy convierten de Excel a TXT. El objetivo MuniControl es registrar la novedad y autorización propias, no obligar a reconstruir un archivo que el sistema puede generar. No confundir códigos del reloj 4/5 con conceptos 44/95.
- OSEP: 601 cuota, 602 voluntarios puros, 603 estudiantes, 605 cuenta corriente; 604 y 685 se describen como automáticos. Conservar descripción y fórmula exacta de cada fuente: la captura bajo el texto de 604 muestra otro código, por lo que esa fórmula exige cotejo con el respaldo antes de usarla.
- Otros descuentos: 614, 638, 639, 641, 650, 651, 665 y 675 usan Formato Junín; 616, 618, 620 y 623 están listados aparte. 617 se describe automático; también figuran 676 APEL y 677 ATE. No agregar porcentajes de memoria.
- 678 Club Junín usa Formato Retro y un TXT preparado desde Excel externo. El dato externo sigue necesitando recepción; automatizar no significa inventarlo.

## 4. Integración GRH–GAF contable
Fuente: `4º MODULO INTEGRACION SUELDO- GAF CONTABLE`, páginas 1–3.

INSUTACO: conceptos por repartición, partida y cuenta; preservar filtros del período/repartición/concepto. INSULEGA: vincular cada legajo a institucional (lugar de trabajo) y nomenclador (función). Pendiente integración contable operativa. No presentar un reporte de conceptos como imputación contable realizada.

## 5. Novedades de liquidación
Fuente: `5º MODULO NOVEDADDES DE LIQUIDACION`, páginas 1–4.

| Apartado | Criterio que no debe perderse |
|---|---|
| 5.1 Ítem por legajo | Estado docente para la población indicada; mensual, fijo, valor 1. Conservar diferencia entre repartición y convenio. |
| 5.2 Masivas | Haberes/descuentos por varios legajos, forzados o no; validar antes de guardar y mostrar el lote completo. |
| 5.3 Manuales | Presentismo, mayor dedicación, Full Time y demás códigos, sin requerir planilla externa. |
| 5.4 Fijas | Código 80 Responsabilidad jerárquica con alta y vencimiento; documentado 31/12/2050, unidad 1 e importe 1. No extender esa convención a todos los conceptos. |
| 5.5 Eliminación masiva | Resolver errores de concepto, tipo o mes. Diseño nuevo propuesto: baja/corrección auditada con vista previa; no borrar evidencia sin control. |

Incremento 092: [registro y revisión de novedades fijas](NOELIA_NOVEDADES_FIJAS_092.md). Agrega vigencias declaradas, propuestas, decisiones independientes, corrección/anulación individual e historial. Su exportación es de control; no activa consumo salarial automático ni cierra la corrección masiva 5.5. Instalación y publicación sujetas a los gates de su release.

101 ya publicado agrega alta propia → novedad mensual individual por UUID → revisión independiente → exportación de control. Mantiene `export_only`, un registro por lote nativo y tipo mensual; no extiende automáticamente la modalidad masiva a legajos propios ni calcula haberes. La aceptación municipal con casos reales se mantiene separada del cierre técnico.

La reunión pide importe opcional, no obligatorio. La ausencia de importe no se convierte en cero. La valoración depende de fórmulas vigentes, no de ocultar el campo.

## 6. Parámetros
Fuente: `6º MODULO PARAMETROS`, páginas 1–6.

- Maestro: crear/modificar haberes, no remunerativos, descuentos y contribuciones.
- Auxiliares 88 y 90: para convenios 1,4,6, el 88 informa clase 6-D vinculada al concepto 24; 90 informa clase 3-A, actualizado con escala. Para 2,7,11, el 88 usa clase 13-I por 1,50. Son reglas documentadas; importes y vigencias deben provenir de una escala validada.
- Copiar fórmulas: 1,2,4,5,6,7,11,12,13,14. La fuente excluye 3 y 8 por falta de agentes y marca 9/10 obsoletos. No borrarlos del histórico.
- Duplicación: facilitar actualización conjunta de 606,607,612 y 550 sin recorrer todos los convenios. Se requiere vista de impacto/versiones y prueba de comparación, no sustitución masiva ciega.

103 permite preparar y revisar independientemente convenios, categorías, organizaciones y reparticiones para **altas futuras**; aprobar publica ese catálogo administrativo. No es el maestro de conceptos, auxiliares, escalas o fórmulas del módulo 6, ni modifica encuadres de contratos existentes. Su publicación técnica y la primera aprobación municipal se acreditan separadamente mediante evidencia del release y de la revisión municipal.

Para que Personal opere enteramente con legajos propios siguen pendientes los circuitos de **rectificación, baja y reingreso nativos**, y la ampliación de **licencias a contratos nativos**, con identidad, permisos e historial. El alta actual ofrece creación y recuperación del intento; no deben presentarse esos otros movimientos como implementados. El motor de liquidación propio tampoco está homologado: requiere reglas aprobadas, cálculo reproducible y conciliación.

## 7. Liquidación
Fuente: `7º MODULO LIQUIDACION`, páginas 1–3.

Conservar anulación, cambiar el nombre Proceso por Confirmar liquidación y respetar sus alcances por legajo/convenio/repartición/todos y tipos indicados en capturas. Cierre mantiene histórico e imputación contable. Cierre de origen, coincidencia aritmética, autorización administrativa y pago son hechos distintos.

## Corte de entrega 053
Pruebas a cerrar: botón blanco PDF con fecha ISO real; navegación por tarea sin perder formularios; filtros/exportación del resultado completo; consulta de conceptos desde Neon; prueba negativa de sesión; ninguna modificación de importes originales. Firma DOC-01, motor de próxima nómina, reportes bancarios/fiscales y colector autónomo no se dan por cerrados por este sprint.

## Ampliación expresa del 15/09/2026 · certificados asistidos y conexiones

Detalle y criterios de aceptación: [Directivas de certificados IA y conexión de relojes](DIRECTIVAS_CERTIFICADOS_IA_Y_CONEXION_RELOJES_20260915.md). Esta ampliación agrega requisitos; no declara nuevas funciones en producción ni sustituye los módulos anteriores.

| Referencia | Resultado esperado | Estado |
|---|---|---|
| ESC-IA-01 | Completar registro manual de nivel, curso, ciclo, presentación y vencimiento; distinguir declaración en papel de archivo adjunto | 091 aporta registro inmutable, papel/PDF, historial y Excel. 102 ya publicado extiende el circuito a alta propia → hijo/a declarado → escolaridad, con procedencia municipal y sin inventar corte GRH. No incluye cónyuge/prenatal, fotografía, IA o autoservicio. Ver [091](NOELIA_ESCOLARIDAD_MANUAL_091.md) y [102](NOELIA_NATIVE_FAMILY_102.md). |
| ESC-IA-02 | Foto o PDF desde móvil, captura guiada y almacenamiento privado con recuperación sin duplicados | Requisito incorporado; la carga PDF acotada existente no certifica soporte de fotos ni capacidad general. |
| ESC-IA-03 | Extraer campos explícitos con evidencia y precompletar; revisar y confirmar sin volver a transcribir | Requisito incorporado; proveedor y pruebas de precisión pendientes. No inventar fechas, curso o identidad. |
| ESC-IA-04 | Empleado presenta para sus familiares y Noelia/RR.HH. revisa desde bandeja con permisos propios | Requisito incorporado; no ampliar permisos administrativos para simular autoservicio. |
| ESC-IA-05 | Exportar planilla desde datos revisados y emitir avisos por fechas comprobadas | Pendiente de conectar el circuito completo; conservar activos con hijos y fechas del pedido original. |
| CLK-IP | Respetar todos los PM actuales; usar la planilla sólo como lista de destinos IP/puerto | Directiva obligatoria. No renumerar, crear, eliminar ni asociar PM por orden, nombre o ID del software anterior. |

La emisión del documento, su presentación administrativa, la carga digital y su vencimiento son fechas diferentes. El dato extraído no es una aprobación ni modifica una liquidación. La IA propone y el operador confirma; la carga manual queda disponible cuando sea necesaria.

Las IP no reemplazan la identidad estable del equipo: se usan para conectarlo, verificando la serie esperada antes de aceptar eventos para una asociación existente. Cambiar el orden o los IDs de la planilla de conexiones no debe cambiar ningún PM ni su histórico.
