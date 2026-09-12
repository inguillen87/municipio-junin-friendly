# Sprint 058 · Buscar legajos activos por nombre al preparar novedades

## Necesidad operativa

Fuente funcional: módulo 5 de Noelia, «Novedades de liquidación», puntos 5.2 y 5.3: carga masiva o individual por legajos, de haberes o descuentos, forzada o no. Reunión del 09/09/2026: importe opcional. Se conserva ese flujo: buscar no asigna importes, no guarda novedades ni aprueba liquidaciones.

Este incremento agrega selección por nombre/legajo al circuito ya publicado en 057. No incorpora ni presume un nuevo maestro de conceptos: la definición y vigencia de conceptos sigue siendo trabajo separado.

## Uso

- Carga individual / rápida: «Buscar por nombre» junto al legajo. Elegir una persona completa el identificador y muestra su nombre/sector; no cambia concepto ni unidades.
- Carga rápida múltiple: «Buscar y elegir legajos activos». La selección atraviesa páginas/búsquedas y se lleva a la lista pendiente. Luego se agrega y valida el lote mediante los controles existentes.
- Planilla en pantalla: «Buscar legajos activos» agrega filas sin concepto/unidades/importe inferidos; cada fila permite buscar su legajo. El grupo con concepto común también ofrece búsqueda dentro del diálogo.
- El selector indica página, coincidencias y corte de la fuente. No hay selección global de resultados ocultos. Al cerrar se descartan resultados, búsquedas y selección del diálogo.

## Datos y controles

Proyección GET `resource=employees&view=novelty-selector`, dentro del mismo gateway administrado y la capacidad `workforce.employee.read`. Exige el binding de origen configurado y certificado, búsqueda explícita de 2–100 caracteres, `administrative_active`, 20 filas/página, sin facetas. No permite elegir tenant, compañía ni otro origen por parámetros. Los comodines de búsqueda se tratan literalmente.

La consulta SQL proyecta sólo identificador de contrato, legajo, nombre, sector, convenio, activo y fecha del estado. La serialización vuelve a aplicar una lista cerrada; no devuelve DNI, CUIL, cuentas, importes o datos familiares. No hay tablas, funciones SQL, permisos ni migraciones nuevas. La vista completa de Personas mantiene su contrato previo.

La condición activo es la del último estado disponible en la base existente. No se certifica vigencia laboral al día ni elegibilidad salarial. El servidor de novedades conserva su comprobación de contrato activo/único al preparar. No se obtienen ni modifican relojes desde esta función.

Los datos personales de consulta permanecen sólo en memoria/DOM de esta pestaña. No hay almacenamiento persistente nuevo ni nombres agregados al payload de novedades. Cambiar el legajo manualmente quita el nombre asociado; cambios de fuente o denegación de directorio limpian las etiquetas anteriores. Cerrar/cambiar modo/cargar otro contexto invalida peticiones en vuelo. Los errores, 401/403 y datos malformados nunca degradan a una consulta sin ámbito.

## Verificación y publicación

- Pruebas puras de consulta/proyección/capacidad e integración del SQL existente con doble de base de datos.
- Navegador sobre la pantalla completa: individual, rápida múltiple, planilla y grupo; cancelación, permisos, entradas literales, capacidad y móvil.
- Regresiones de 055–057 y suite completa antes de fusionar.
- Después de desplegar: huellas de los recursos públicos, rechazo anónimo real y pruebas con recursos publicados/API sintética en el navegador.

Los tests sintéticos no acreditan una sesión municipal real con MFA ni una consulta autorizada contra Neon. No se crean lotes municipales reales en la aceptación automatizada. El permiso para consultar nombres debe existir en la cuenta; este incremento no lo concede.
