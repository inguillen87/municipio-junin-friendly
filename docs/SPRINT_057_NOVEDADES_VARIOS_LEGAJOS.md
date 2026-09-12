# Sprint 057 · Una novedad para varios legajos, sin archivo

## Requerimiento y alcance
Módulo 5 de Noelia, §5.2 y §5.3: cargar haberes o descuentos masivamente por legajos,
forzados o no, con posibilidad de ingreso manual. La reunión del 09/09/2026 mantiene
el importe como opcional. Esta entrega extiende la carga rápida existente; no cambia
fórmulas, cierres, interpretación del código de concepto ni tablas de GRH.

## Uso
1. Novedades → Carga rápida por legajo.
2. Completar período, tipo, concepto y unidades. Importe manual sólo cuando corresponda.
3. Escribir/pegar números de legajo separados por salto de línea, espacio, coma o punto y coma.
4. Revisar incidencias y datos comunes. Agregar la lista completa al lote.
5. Buscar/quitar filas y validar la totalidad antes de crear el lote trazable.

También se conserva la incorporación de a un legajo. No se permiten rangos, nombres,
notación científica ni corrección silenciosa de ceros iniciales. No se convierte DNI
ni se deduce identidad por la longitud del número. Los identificadores se conservan
como texto. El servidor vigente valida identidad, vínculo, concepto y permisos.

## Controles
- Máximo 500 filas o el límite menor declarado por el servidor; límite de texto 12.000 caracteres.
- Incidencias de toda la lista; duplicados internos y contra lo ya agregado. Incorporación atómica.
- Mismos datos comunes para todos; plantilla bloqueada desde la primera fila.
- Texto pendiente sin incorporar bloquea la revisión: nunca se guarda un subconjunto por omisión.
- Buscar no cambia el lote; quitar sobre un filtro opera sobre el índice original.
- Ningún POST al pegar, agregar o validar. El único guardado usa el comando `prepare` existente,
  `sourceMode: bulk`, clave de idempotencia y revisión posterior. No autoaprueba.
- Campos bloqueados mientras una solicitud está en curso. Reintento conserva cuerpo y clave.
- Cambios de identidad, permisos o límites invalidan la preparación. Pagehide limpia la lista.
- Sin almacenamiento persistente de los nuevos datos en el navegador ni datos de ejemplo publicados.
- Lista acotada en altura, resumen de datos comunes, controles accesibles y movimiento reducido.

## Verificación
`node --test tests/payroll-novelty-legajo-list-057.test.js`
`node scripts/verify-novelty-list-057.mjs`
Más suite completa y regresiones de novedades 056, comparador, legajos, resumen y reportes.
La prueba funcional intercepta todas las API en el navegador, incluidos los POST;
no escribe en la base municipal ni afirma una sesión real con MFA.
La verificación productiva coteja hashes de recursos y rechazo real del acceso anónimo.

## Límites que no resuelve esta entrega
No incorpora selección nominal desde el directorio, valoración por fórmulas, novedades
fijas con vigencia, liquidación salarial ni transmisión bancaria/fiscal. El número de
legajos pegados no acredita un padrón activo ni aptitud laboral. El backend conserva su
circuito de validación y aprobación existente.
