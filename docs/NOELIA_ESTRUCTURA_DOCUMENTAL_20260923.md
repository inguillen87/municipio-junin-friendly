# Noelia 10: consulta documental de estructura de cargos

Este incremento incorpora una herramienta operativa en Centro de reportes → Estructura de cargos. Atiende la consulta del reporte detallado y la salida PDF simple/detallada; no declara terminada la comparación entre presupuesto aprobado y liquidación.

## Circuito implementado

La persona autorizada selecciona el PDF original. Un worker local extrae el texto nativo completo y valida páginas, columnas, fecha informada y continuidad de estructuras. El documento no se sube a la API, no ingresa a la base, no modifica el padrón y no se guarda en localStorage/sessionStorage. Sólo se consulta la sesión autorizada.

Se conservan Id, JUR, REG, AGR, TRAM, SUBT, CARGO, Denominación, Cant, Clas, Estado y Vacante. Los ceros iniciales, el detalle que continúa entre páginas y los legajos distintos con nombres iguales no se normalizan ni deduplican. Cant cero no implica cargo vacante.

La búsqueda selecciona estructuras completas, incluso cuando encuentra un legajo en una página posterior. La vista limita el DOM a cinco estructuras y 25 legajos por estructura; la exportación incluye todas las estructuras y todos los legajos del filtro, no solamente la página visible. Se permite orden original, número de legajo y alfabético.

Las salidas PDF incluyen la huella SHA-256 del original, su fecha y página de referencia, filtros y alcance documental. La vista simple omite nombres; la detallada conserva el detalle. Ninguna equivale a firma digital ni a homologación presupuestaria.

## Controles

Se requieren workforce.structure.read y workforce.employee.read. La sesión se verifica antes y después de leer, antes de exportar y al recuperar foco; otra institución o pérdida de permisos retira el contenido. Cancelar destruye el worker y una respuesta tardía no repuebla la pantalla. Los errores de archivo no producen un reporte parcial.

Límites explícitos: 8 MiB, 120 páginas, 1.000 estructuras y 10.000 filas nominales. El adaptador corresponde al formato nativo detallado de Junín; rechaza PDF cifrado, formularios, adjuntos, JavaScript, páginas incompatibles y texto sin estructura reconocida. No usa OCR ni servicios externos.

## Evidencia y cierre pendiente

La lectura local del original recibido del 23/09, SHA-256 b6cff5ce5986b7436b80c2323c50636560d40a9f4444e831afc59d1e2fad25dd, produjo 83 estructuras, 798 filas nominales, 798 números de legajo distintos y 15 estructuras con Cant cero. No se incorporan esos registros ni el PDF privado al repositorio. Son conteos del documento, no dotación municipal certificada ni cupos aprobados.

Pruebas: `node --test tests/budget-structure.test.js` y `node scripts/verify-budget-structure-browser.mjs`, con PDF y sesión sintéticos, worker real, exportaciones leídas nuevamente, revocación, cancelación y móvil. CI y producción se acreditan por separado.

Pendiente del módulo 10: fuente aprobada del ejercicio y su versionado, cruce con corrida salarial concreta, condición activa vigente verificable, diferencias conciliadas, aceptación de Noelia. El original no permite inferir por sí solo el filtro Activos Sí/No/Todos. Los módulos 1–9 y la importación productiva del respaldo conservan sus pendientes previos.


## Incremento del 24/09 · cotejo de estructura y nómina

`NOELIA_COTEJO_ESTRUCTURA_NOMINA_20260924.md` añade presencia agregada de legajos contra una corrida concreta, PDF/CSV completos y revalidación de lectura. No valida el cargo de esa corrida ni el cupo aprobado del ejercicio y no cierra los pendientes de relojes, recibos o respaldo sucesor. CI y publicación se verifican por separado.
