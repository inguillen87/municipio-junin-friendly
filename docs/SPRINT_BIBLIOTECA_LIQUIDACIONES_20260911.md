# Biblioteca de liquidaciones detalladas por legajo

## Necesidad operativa
El padrón activo y el historial mensual provienen de un corte de GRH. Las líneas completas se incorporan por conjuntos posteriores independientes. Una liquidación puede tener conceptos disponibles sin una tarjeta en el resumen anterior. No se debe ocultar ese documento ni modificar el resumen para simular la misma fuente.

## Entrega
Acceso `Liquidaciones detalladas` desde la gestión rápida del legajo. Biblioteca derivada de conjuntos realmente incorporados, con año, mes, tipo, cantidad de conceptos, estado informado y procedencia. Filtros sobre el catálogo completo recibido, sin cargar Excel. Selección de documento abre el detalle ya autorizado y sus exportaciones PDF/Excel. El dataset seleccionado queda fijado: si cambia la versión consultada, se exige actualizar la biblioteca.

## Alcance y fuente
Responde a los módulos de Noelia: reportes por mes/año/tipo y detalle de conceptos de haberes y descuentos. Conserva la separación entre liquidación confirmada en la fuente, pago, emisión oficial y firma. No automatiza decisiones laborales, depósitos, cálculos de nómina ni firma en nombre de otra cuenta.

## Seguridad y límites
Lectura nominal y nómina requeridas simultáneamente. Contexto de tenant, vínculo, fuente y sesión revalidado en PostgreSQL. Conexión de ejecución restringida; sin SELECT público sobre tablas privadas. Consulta auditada por contrato y sesión; sin URL nominal de navegación. Catálogo acotado a 1.000 períodos con advertencia explícita si excede el límite. Las descargas conservan la verificación de identidad, snapshot y hashes previa a exportar.

## Verificación
Pruebas unitarias de validación, filtros, ausencia de datos, versiones y alcance. Navegador con datos sintéticos para acceso a períodos sin resumen, filtros, descargas, rechazo de versión cambiada, móvil y cierre durante lectura pendiente. Pruebas separadas de la lectura SQL y rechazo sin sesión. El éxito de estas pruebas no equivale a una sesión real con MFA ni a certificación de pago.

## Fuera de este sprint
Firma DOC-01; cálculo salarial propio; captura continua del reloj; homologación bancaria/fiscal. El importe manual permanece opcional en novedades.
