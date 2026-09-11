# Sprint 053 · centro de reportes y navegación operativa

## Recorridos de trabajo
Reportes se organiza como Biblioteca, Analizar RR.HH., Haberes y descuentos, Controles externos e Informe completo. El catálogo abre tareas reales: sectores, altas/bajas, ausencias, conceptos de nómina, jornadas y documentos por legajo. Una búsqueda ubica el reporte sin bajar por toda la página. El informe agregado anterior y sus descargas permanecen disponibles.

El explorador agrega búsqueda, orden y filtro de años presentes en la fuente. Dotación por sector se refiere a contratos activos al corte; ausencias son eventos administrativos. Las personas afectadas de años diferentes no se suman como personas únicas. Gráfico y tabla comparten el filtro; un clic en la barra localiza su fila, las descargas contienen todo el resultado, no sólo las barras visibles. PDF/Excel/CSV conservan origen, filtros y límites.

## Nómina sin reconstruir archivos
La nueva consulta payroll_source_report_v1 agrega los conceptos del detalle ya guardado en Neon, con sesión, permiso payroll.read, municipio y vinculación de fuente certificados. No consulta datos nominales. Cada reporte corresponde a una corrida elegida; 701 y 703 son importes de origen, no porcentajes aplicados por esta pantalla. Los totalizadores no se suman otra vez. Faltantes no se convierten en cero. Antes de exportar se vuelven a validar permisos y hashes de la fuente.

Los reportes de ART, bancos, OSEP/Mutual y F.931 requeridos por Noelia conservan sus requisitos y homologaciones pendientes. El nuevo agregado no sustituye esos formatos ni presenta información ante organismos. Las herramientas de archivos se separan en Controles externos/Migración; no se disfrazan como generación automática.

## Correcciones
El PDF blanco del resumen acepta la fecha civil e ISO devuelta por la API sin trasladarla al día anterior por huso horario. Mensajes de avance/error están dentro de la tarjeta visible. Nómina muestra meses legibles y una botonera para ver un área a la vez, sin recrear formularios ni perder sus valores. Novedades no se anuncia validada antes de validar y mantiene importe opcional; cero se distingue de vacío y no autoriza un descuento.

## Evidencia y alcance
Pruebas unitarias, API parametrizada, límites de fila/monto, privacidad de exportación, navegación por teclado/móvil/reduced-motion y descargas en navegador con personas sintéticas. El lector SQL compara sus conteos con el conjunto de origen y audita la lectura. No se modifican liquidaciones, fichadas, firmas ni aprobaciones. La prueba de acceso anónimo denegado no sustituye un ingreso municipal real con MFA.
