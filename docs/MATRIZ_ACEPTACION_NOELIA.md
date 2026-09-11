# MuniControl · Criterios de aceptación derivados de los módulos de Noelia

Esta matriz no declara que el reemplazo de GRH esté completo. Distingue requerimientos de la documentación entregada, avances comprobables en código y funciones pendientes. Los PDF originales y sus capturas permanecen fuera del repositorio; no se publica información nominal ni la firma. Una fórmula visible en una captura no se sustituye por una tasa supuesta.

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

La reunión pide importe opcional, no obligatorio. La ausencia de importe no se convierte en cero. La valoración depende de fórmulas vigentes, no de ocultar el campo.

## 6. Parámetros
Fuente: `6º MODULO PARAMETROS`, páginas 1–6.

- Maestro: crear/modificar haberes, no remunerativos, descuentos y contribuciones.
- Auxiliares 88 y 90: para convenios 1,4,6, el 88 informa clase 6-D vinculada al concepto 24; 90 informa clase 3-A, actualizado con escala. Para 2,7,11, el 88 usa clase 13-I por 1,50. Son reglas documentadas; importes y vigencias deben provenir de una escala validada.
- Copiar fórmulas: 1,2,4,5,6,7,11,12,13,14. La fuente excluye 3 y 8 por falta de agentes y marca 9/10 obsoletos. No borrarlos del histórico.
- Duplicación: facilitar actualización conjunta de 606,607,612 y 550 sin recorrer todos los convenios. Se requiere vista de impacto/versiones y prueba de comparación, no sustitución masiva ciega.

## 7. Liquidación
Fuente: `7º MODULO LIQUIDACION`, páginas 1–3.

Conservar anulación, cambiar el nombre Proceso por Confirmar liquidación y respetar sus alcances por legajo/convenio/repartición/todos y tipos indicados en capturas. Cierre mantiene histórico e imputación contable. Cierre de origen, coincidencia aritmética, autorización administrativa y pago son hechos distintos.

## Corte de entrega 053
Pruebas a cerrar: botón blanco PDF con fecha ISO real; navegación por tarea sin perder formularios; filtros/exportación del resultado completo; consulta de conceptos desde Neon; prueba negativa de sesión; ninguna modificación de importes originales. Firma DOC-01, motor de próxima nómina, reportes bancarios/fiscales y colector autónomo no se dan por cerrados por este sprint.
