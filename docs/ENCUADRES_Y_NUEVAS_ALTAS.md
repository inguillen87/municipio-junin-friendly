# Encuadres propios y nuevas altas

El catálogo conserva convenios, categorías, sectores y reparticiones que necesitan los contratos existentes y las referencias salariales. Cada opción de una versión nueva declara por separado si puede utilizarse para una nueva alta. Cerrar una opción para nuevas altas no cambia el contrato de una persona ni elimina su referencia salarial.

En Personas, **Catálogo de encuadres** permite consultar, preparar cambios, comparar el conjunto completo y enviarlo a una persona diferente para su revisión. **Permite nuevas altas** es una declaración explícita. Una categoría no puede habilitarse si su convenio está cerrado. Las opciones agregadas comienzan cerradas; cambiar un código exige volver a declarar su uso.

Los catálogos anteriores conservan sus campos y restricciones originales. La primera declaración explícita aparece en la comparación de revisión. No se modifica una propuesta pendiente ni la referencia de un intento de alta anterior.

La carga por CSV trabaja en el borrador local. La plantilla contiene `tipo`, `codigo`, `descripcion`, `convenio` y `nuevas_altas` (`si` / `no`). El archivo incluye las cuatro clases completas, aun con búsqueda o paginación. Admite hasta 1.500 opciones y 2 MiB; los límites rechazan el conjunto y nunca recortan filas. Las celdas descargadas llevan un marcador de texto literal para impedir la evaluación de fórmulas al abrirlas en una planilla.

Comparar no guarda ni publica. Cambiar el borrador invalida la comparación; ocultar la página o retirar el acceso retira el archivo y su comparación. Los permisos se comprueban en la API y en PostgreSQL. La confirmación de una nueva alta vuelve a comprobar el catálogo; un envío forzado de una opción cerrada se rechaza sin crear persona ni contrato.

La adaptación técnica SQL167 sustituye únicamente cinco cuerpos de funciones existentes, con metadatos y hashes exactos, conservación de todos los registros y ACL, lectura durable y repetición verificadora. Reutiliza la identidad administrativa auditada existente; no añade permisos ni permite que la misma persona apruebe su propuesta.

Este incremento no adopta el padrón real de 855 contratos, aprueba escalas, ejecuta haberes municipales ni habilita relojes. Esas operaciones conservan sus circuitos y decisiones. La prueba funcional usa exclusivamente empleados, encuadres y cálculos sintéticos en las bases locales de QA.
