# Planilla bancaria completa — 5 de septiembre de 2026

## Necesidad y salida implementada

Incremento de REP-01 de Noelia: desde **Reportes → Bancarización**, “Preparar planillas” construye un Excel nominal completo además de las salidas agregadas ya existentes. La fuente es su `PLANILLA CONTROL GENERAL 08.2026.xlsx`, dentro de la carpeta de acreditación de agosto que entregó. No se inventan datos ni se confunde este archivo con una liquidación nueva desde PostgreSQL.

- Ocho hojas: Credicoop 42/55, Santander 42/55, Nación 42/55, transferencias de funcionarios y transferencias varias.
- CUIL y nombre, importe neto, repartición y jurisdicción. Cuenta y CBU se incluyen como texto sólo cuando existen en la hoja de origen; Nación no informa cuentas en esta muestra.
- Subtotales por repartición/jurisdicción y total por hoja, recalculados en centavos exactos, con fórmulas Excel y valores cacheados. La selección nominal y el control agregado usan el mismo universo validado.
- Cabeceras fijas, filtros, títulos repetidos al imprimir, impresión horizontal y ancho de una página. Identificación del archivo de origen y su SHA-256 en cada hoja.
- No se duplican códigos de repartición que ya forman parte de su descripción. Los valores de texto no se ejecutan como fórmulas y los identificadores conservan sus ceros iniciales en el XLSX.
- La interfaz muestra primero descargas y totales. El detalle por repartición y la trazabilidad están bajo un desplegable. Cambiar de tarea conserva el resultado; limpiar o cambiar el archivo/período/cuentas lo descarta.

## Límites de esta entrega

Es una planilla nominal de control de la fuente mensual recibida, **no un archivo TXT de acreditación**, una orden de pago ni una presentación aceptada por una entidad. Cuenta/CBU se copian de la fuente: no se certifican con el banco ni se reconstruyen números ausentes o ya dañados en el origen. No reemplaza todavía la producción de esta fuente desde la nómina canónica.

El XLSX se genera en el navegador. Los datos personales no se incorporan al DOM, a la caché PWA ni a Neon: únicamente permanecen en el archivo descargable preparado en memoria. No hay nuevas dependencias, servicios de pago, migraciones, cambios de permisos ni conexiones bancarias. El circuito agregado anterior mantiene su contrato sin datos personales.

## Comprobaciones

- Pruebas unitarias del nuevo exportador: ocho hojas reales leídas por `read-excel-file`, todos los importes y operaciones, fórmulas de subtotal/total, texto literal, ceros iniciales, precisión y rechazo de totales inconsistentes. Un nombre que comienza por “Subtotal” no puede excluir una operación nominal ni duplicar sumas.
- Revisión visual de ocho hojas sintéticas mediante importación/renderizado, sin modificar ni reexportar el XLSX. Cabeceras, separación, nombres largos y subtotales legibles. Limitación del visor utilizado: convierte textos numéricos al mostrarlos; la conservación exacta de identificadores se comprueba mediante XML, lector XLSX independiente y comparación con la fuente, no mediante esa imagen.
- Navegación y recuperación del informe a 320, 390, 768 y 1280 px; generación de PDF y Excel RRHH existente conservada.
- 1.685 pruebas generales aprobadas. `verify-payroll-bank-control-browser.mjs` procesa el ZIP real y comprueba 842 operaciones (731 J42 y 111 J55), ocho hojas, 76 grupos y las diez descargas agregadas anteriores. Navegar y volver conserva idénticos bytes de descarga; limpiar o cargar un archivo inválido impide descargar resultados anteriores. Cero solicitudes externas o de escritura.
- `verify-payroll-bank-nominal-source.py`: lector OOXML independiente con `zipfile`, `ElementTree` y `Decimal`, sin importar analizadores de la aplicación. Coinciden los multiconjuntos de CUIL, nombre, importe, cuenta, CBU, repartición y jurisdicción de las 842 filas con el origen; se verifican 76 subtotales, ocho totales, fórmulas/cache y archivo/huella fuente. Seis alteraciones deliberadas de nombre, jurisdicción, cuenta, subtotal/fórmula/total fueron rechazadas. Las fórmulas auxiliares del original no se ejecutan.
- Revisión visual del resultado real: se corrigió el quiebre de importes grandes en escritorio. La suite comprueba que ningún importe se parta o desborde a 320, 390, 768 y 1280 px.
- Una copia conciliada se conserva fuera del repositorio, en Descargas/MuniControl, para revisión municipal. No se publica como recurso estático.

## Publicación

La publicación se realiza después de estas comprobaciones. El commit, deployment y resultado de la comprobación del alias se registran en el cierre de la sesión; no debe interpretarse este documento por sí solo como evidencia de que cualquier alias esté actualizado.

## Referencia GRH comprobada en esta sesión

Manual en vivo consultado: [Recibos de sueldo](http://172.100.96.4:8080/GRH_WEB/Manuales/Guias/WebHelp/__Recibos_de_sueldo.htm), respuesta HTTP 200. El recorrido documentado es Nómina → Informes → Recibo de sueldo; distingue legajo, fecha de liquidación, mes, año, tipo y salida en pantalla/impresa. Enumera Liquidación Final, Mes, Otros conceptos, Primera quincena, SAC y Vacaciones.

Se conserva esa separación funcional como referencia para próximos incrementos de recibos. No se afirma haber recorrido todos los menús de ambos sistemas en esta entrega ni haber validado nuevamente todos los audios, las fórmulas o las presentaciones oficiales pendientes.
