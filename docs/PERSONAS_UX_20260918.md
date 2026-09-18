# Personas: navegación de ficha y presentación del alta

## Alcance implementado

La ficha de Personas incorpora un índice local de las secciones ya construidas por la pantalla autorizada. El selector permite ir a datos personales, vínculo laboral, registro y otras secciones presentes en esa ficha. No inventa módulos, no abre automáticamente un historial plegado, no cambia la URL ni inicia una operación sobre el legajo. El foco de teclado llega al encabezado elegido.

La carga del índice es opcional y posterior al renderizado de la ficha: una respuesta tardía se descarta si cambió el controlador o se cerró el diálogo. La ficha sigue disponible si falla la carga de este módulo. Abrir otra ficha reconstruye el índice desde su contenido, sin almacenar nombres o identificadores fuera del diálogo.

Se rediseñó la presentación del alta existente: agrupación de identidad/encuadre, espacios, tamaños de controles, tipografía, colores de revisión/error/confirmación y adaptación a pantallas pequeñas. El estado de confirmación pendiente conserva su referencia y sus acciones originales. No se cambió el JavaScript del alta ni su contrato de servidor.

## Qué no incluye

No implementa edición, baja, anulación ni reingreso de un empleado existente. Esas operaciones permanecen en #43 y exigen completar el circuito de servidor, permisos y auditoría. No hay una papelera ni acciones que aparenten estar habilitadas. El intento de escritura de un ayudante para ampliar el flujo fue bloqueado por la herramienta; no se publicó ni se ejecutó esa propuesta.

No modifica tablas, personas, contratos, legajos, permisos, claves, liquidaciones, marcaciones o firmas. No aplica el respaldo de septiembre ni la migración 075. La transición de septiembre y la capacidad de almacenamiento conservan su prioridad en #41/#37; esta entrega de interfaz no sustituye su cierre.

## Verificación

3.624 pruebas de aplicación y compilación aprobadas. Se amplió el recorrido existente `verify-native-employee-browser.mjs`: ocho grupos, con navegación/foco de la ficha, conservación de URL, ausencia de consultas/escrituras adicionales, detalle móvil 320/390 px, alta/revisión existentes, respuesta perdida, duplicado y denegación. El índice no se duplica, no incluye secciones con atributo hidden y no actúa sobre contenido retirado del documento.

Las identidades y API de los recorridos de navegador son sintéticas. No se dio de alta un empleado real como prueba. Las capturas del alta y del índice fueron inspeccionadas en escritorio y móvil. No se declara conformidad WCAG ni aceptación municipal por esas pruebas.

El verificador productivo de legajos existente ahora coteja también los dos assets del índice y el CSS del alta. Se conserva el workflow de publicación, sin otro preview o workflow adicional. La comprobación de los archivos y el recorrido sobre los assets productivos deben registrarse tras el despliegue; el build local no acredita publicación.

## Regresión adicional

El recorrido vigente de preparte aprobó sus ocho grupos con API sintética. La prueba heredada `verify-legajo-workdays-browser.mjs` agotó la espera inicial; se repitió contra los assets de la versión base y falló en el mismo punto. Su fixture responde sólo al recurso antiguo `clock-workdays`, mientras la plataforma ya tiene lectura continua. No se cuenta esa prueba como aprobada ni se modificó para ocultar el fallo. Su actualización queda registrada por separado; este incremento no cambia los módulos de reloj/jornada.
