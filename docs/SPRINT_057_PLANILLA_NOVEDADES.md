# 057 · Planilla de novedades en pantalla

## Pedido atendido
El módulo 5.2 de Noelia pide cargar códigos de haberes o descuentos para varios legajos, forzados o no. El módulo 3 describe la conversión de planillas de mayor dedicación (44) y full time (95) a TXT. La reunión del 09/09/2026 aclara que informar importe debe ser opcional.

Esta entrega agrega **Planilla en pantalla** a Novedades, preservando carga individual, rápida y CSV. No intenta reemplazar toda la liquidación de GRH ni adjudica cantidades a partir de fichadas.

## Recorrido
1. Elegir período y tipo de liquidación habilitado por la API.
2. Agregar filas o un grupo de legajos, uno por línea, con concepto y unidades iniciales opcionales. No pide un archivo ni asigna importe por defecto.
3. Editar por fila legajo, concepto, unidades y campos adicionales: centro, ajuste, movimiento, instrumento, fundamento, importe manual y modo forzado.
4. Validar todas las filas mediante el mismo `rowFromValues` usado en la carga individual y CSV. Los errores impiden crear un lote parcial. Los duplicados no se borran silenciosamente.
5. Revisar el lote completo con las herramientas del sprint 056. **Crear lote trazable** envía el payload gobernado `sourceMode: bulk`, no una tabla de importes recalculados. El servidor vuelve a validar contrato GRH activo y único, conceptos, ámbito, permisos, duplicados e idempotencia.

## Límites y controles
- Hasta 500 filas. Páginas de edición de 10, 25 o 50; revisión conserva 25, 50 o 100. La página o el filtro no recortan lo guardado.
- Números de legajo como texto exacto, sin comas, puntos, ceros iniciales ni rangos. DNI no reemplaza al legajo en esta entrada.
- Importe vacío permanece ausente; cero informado es distinto. Forzado requiere importe y fundamento según el validador vigente. Unidades no se convierten automáticamente en importe.
- Quitar fila puede deshacerse; vaciar la planilla pide confirmación. No modifica lotes ya persistidos.
- Edición invalida la revisión previa. Mientras se guarda, el editor y período/tipo permanecen bloqueados. Un fallo mantiene las filas y la misma clave para reintentar.
- Al cambiar identidad, perder capacidad de preparación, cerrar sesión o salir de la página se descarta el editor nominal. No se guardan filas en localStorage ni sessionStorage.
- No se cambian API, SQL, permisos, fórmulas, cierres, firmas ni relojes.

## Validación
`tests/payroll-novelty-sheet-057.test.js`: modelo puro. `scripts/verify-novelty-sheet-057.mjs`: página completa, éxito, corrección, duplicados, edición, reversión, paginación, importes, modo forzado, reintento y cambios de identidad/permisos. Todos los POST del navegador se interceptan con datos sintéticos; no se crean lotes municipales de prueba.

Se ejecuta además la suite general y regresiones de novedades 056, comparador, PDF de legajos y reportes. El verificador de producción exige igualdad SHA-256 de recursos y rechazo anónimo. No equivale a probar una sesión municipal real con MFA.

## Fuera de este alcance
Selector nominal de agentes por sector con permiso y ámbito certificado, catálogo de conceptos gobernado, cálculo salarial propio, aplicación laboral del reloj y presentación de archivos bancarios/fiscales. Los códigos de la planilla se validan en el servidor, no por un catálogo artificial del navegador.
