# 058 — Haberes y descuentos: selección de fuentes y exportación coherente

## Necesidad operativa
Los reportes deben salir de datos ya incorporados, sin pedir otro TXT o Excel. Se mantiene la separación entre consultas de nómina, preparación de novedades, cálculo salarial y emisión oficial. Este cambio no implementa liquidación, bancos, F.931 ni firma.

Base de integración: master fe6c53a8b3cb3cb330558de59ed2e51103c5b9df, incluida la entrega de novedades para varios legajos. No se modifica ese módulo ni la rama paralela de planilla editable.

## Entrega
- Buscar fuentes de liquidación por año, mes, tipo, estado informado y etiqueta o identificador.
- Distinguir fuentes del mismo mes sin elegir silenciosamente un cierre definitivo. Detalle de fecha, tipo, origen, legajos, UUID y huella del conjunto.
- Tipo S con nombre del catálogo canónico existente: Sueldo anual complementario. Los tipos desconocidos mantienen el código original.
- Cantidades separadas de legajos de la fuente, conceptos filtrados y conceptos con importes incompletos. No se transforma ausencia en cero ni se confunde población de una corrida con padrón activo.
- PDF y Excel con identificación de fuente; los tres nombres de descarga, incluido CSV, contienen el identificador del conjunto para distinguir exportaciones del mismo mes.
- El catálogo autenticado existente devuelve hasta 240 fuentes. Se informa cuántas se cargaron y si faltan fuentes anteriores: los filtros son sobre ese catálogo, no sobre toda la base.
- Se conserva la consulta de agentes y F/M desde datos explícitos del legajo.

## Integridad y alcance
Consulta y exportación usan la misma API autenticada y no cambian permisos. Se vuelve a consultar antes de cada descarga, comparando metadatos y contenido, además de huellas. Cambiar de fuente o filtro, cancelar, salir de la tarea o esconder la página cancela la operación. Las respuestas viejas no pueden revivir filas ni pisar mensajes de otra consulta. La denegación de sesión borra datos y metadatos del catálogo en memoria.

Sin migraciones, escrituras salariales, importaciones, aprobaciones, cierres, modificación de GRH ni datos personales de prueba en producción. La rama y el flujo CI deben validarse antes de integración. Las pruebas funcionales de navegador interceptan APIs sintéticas; no prueban una sesión municipal real con MFA. La verificación posterior de archivos canónicos y rechazo anónimo es independiente.

## Verificación ejecutable
- `node --test tests/payroll-source-picker-058.test.js`
- `npm test` y `node scripts/build-friendly.mjs`
- `node scripts/verify-payroll-source-picker-058.mjs`
- Regresiones de reportes, comparador, legajos/PDF, padrón F/M y novedades, incluida la carga de varios legajos.
- `node scripts/verify-payroll-source-picker-production-058.mjs`
- `SOURCE_PICKER_LIVE_ASSETS=1 node scripts/verify-payroll-source-picker-058.mjs`

Las capturas y descargas de los ensayos deben conservar explícitamente su carácter sintético. No llamar “certificado” al cierre informado por un backup, ni “tiempo real” a volver a consultar ese backup.
