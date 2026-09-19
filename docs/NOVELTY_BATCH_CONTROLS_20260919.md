# Hugo y Noelia: control previo de novedades por concepto

## Corte funcional

En Novedades de nómina > Validar y previsualizar se amplía el control del lote completo. Funciona con los modos de entrada existentes: carga individual, rápida, CSV y planilla; no crea otro circuito de datos.

La revisión muestra la suma aritmética de los importes informados, cobertura parcial cuando falta un importe y el desglose por concepto: filas, legajos distintos, ausencias de importe, forzadas, ceros, negativos y meses de ajuste. La suma usa centavos enteros exactos; no valora unidades, no aplica fórmulas ni representa el neto salarial. Los códigos de concepto no se convierten en nombres o reglas por inferencia.

Desde cada concepto se abre su conjunto exacto de filas. Seleccionar 44 no incluye 144. Se incorporan filtros para cero explícito, importe negativo y mes de ajuste. Buscar, paginar o filtrar no elimina filas del lote ni cambia lo que se guarda. Los legajos presentes en más de un concepto se cuentan una sola vez para el total; no deben sumarse los conteos de conceptos como personas únicas.

La descarga Control previo CSV contiene un resumen del lote y de cada concepto, sin nombres, CUIL, cuentas, legajos nominales ni observaciones libres. Sus columnas indican que no es una liquidación, aprobación o pago. Los negativos y los números de más de 15 cifras se protegen como texto para evitar interpretación como fórmulas o pérdida de precisión al abrirlos en una hoja de cálculo. No es un layout de importación bancaria.

## Conservación de circuitos y privacidad

El contrato de creación, la validación de servidor, la confirmación, la revisión independiente y la clave de idempotencia existente permanecen sin cambios. El control actúa sobre una copia local de las filas estructuralmente validadas. Editar el origen o perder el permiso de preparación limpia tanto las filas nominales como el resumen y las opciones de conceptos.

No se agregan llamadas de red, almacenamiento de navegador, dependencias, endpoints, esquemas o permisos. Se amplían tres archivos de revisión ya incluidos por el build y excluidos de la caché privada. No se modifica el preparte de relojes, sus criterios de horas o la valoración de los conceptos 44/95.

## Verificación de esta entrega

Se añaden 15 pruebas unitarias: importes ausentes/cero/negativos, sumas grandes exactas, conceptos, solapamiento de legajos, límite de 500 filas, entradas inválidas, filtros combinados, no mutación del lote y exportación acotada. La comprobación local de esas pruebas se ejecuta con Node 22 del entorno aislado; no se presenta como sustituto de la rama Node 24 del proyecto.

La aceptación de GitHub Actions usa la versión .nvmrc del repositorio, instalación con lockfile, regresión completa y compilación. Luego ejecuta el verificador previo de entrada/reintentos/permisos y el nuevo recorrido sobre el workbench compilado. Las respuestas de APIs privadas y todos los POST están interceptados con datos sintéticos; no se guardan novedades municipales.

El nuevo recorrido verifica el desglose de 60 filas, filtro exacto entre 44/144, CSV de todo el lote mientras hay filtro, escritorio/390/320 px, preservación de las 60 filas al guardar desde una vista vacía, reintento con la misma clave y limpieza por edición/revocación. El job de producción compara los tres archivos publicados con el build, confirma rechazo anónimo de la API y repite ese recorrido con assets publicados. Sus resultados, capturas y conteos se comprueban después de ejecutar; no se deducen de este documento.

## Límites y continuidad

Esta fase mejora preparación y revisión, no activa cálculo salarial propio, descuentos automáticos, homologación bancaria, cierre de septiembre ni cambio de base. La infraestructura VPN continúa separada: no se contrató servidor ni se modificaron colectores, certificados o conexiones. Los pendientes de Mariano y del Proyecto Integral siguen vigentes.
