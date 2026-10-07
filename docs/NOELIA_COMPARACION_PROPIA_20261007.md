# Noelia · comparar cálculos propios por legajo y concepto

Implementado y probado localmente. Producción y aceptación municipal pendientes; este incremento no declara completados los módulos 1–10 ni la autonomía integral.

En Nómina → Comparar liquidaciones y Centro de reportes → Comparar liquidaciones, la herramienta principal consulta cálculos guardados de MuniControl. La comparación de liquidaciones incorporadas desde respaldos continúa disponible en un apartado desplegable.

El operador elige dos resultados distintos del mismo tipo. Se revisa la unión completa por contrato propio y concepto, además de los totales originales por legajo. Una participación o concepto ausente se informa como «No figura», con diferencia no evaluable. El cero conserva su significado. Legajos con letras, símbolos o ceros iniciales permanecen exactos y no se enlazan por conversión numérica.

La diferencia es comparada menos base con aritmética decimal exacta, hasta ocho decimales. Si cambia naturaleza o unidad no se resta. Cambios de regla, respaldo, convenio, repartición o número de legajo se señalan para revisión, incluso sin variación de importe. Las reglas originales se pueden desplegar; no se reevalúan ni se inventan fórmulas, escalas, porcentajes o equivalencias. Los auxiliares no se suman como haberes.

Buscar, mostrar un estado y paginar afectan sólo la pantalla. PDF, Excel y CSV descargan el detalle completo elegido: conceptos o totales. Conservan los dos períodos y hashes de resultados originales. Excel mantiene los valores como texto exacto; CSV neutraliza expresiones; un carácter no representable en la fuente del PDF impide esa salida y permite conservarlo con Excel/CSV. El límite de 250.000 filas es global y explícito, sin recortar ni dividir una comparación. Continúa el límite de respuesta completo de la API existente.

Se reutilizan exclusivamente GET de la consulta de liquidaciones existente: catálogo y detalle. La recuperación de intentos conserva su restricción a la cuenta original. Para consultar cálculos de otra persona se exige el permiso de revisión ya existente, tanto en SQL/API como al revalidar la sesión y retirar capacidades. Este incremento no añade API, SQL, tablas, permisos, guardados ni dependencias.

Antes de mostrar o descargar se verifican las dos capturas y resultados, catálogo completo, identidad municipal, permisos y versiones de decisiones. Ambas fuentes se releen para detectar cambios durante la consulta. Cambio de selección, cuenta, vínculo, permisos, tarea u ocultamiento retira la vista; una respuesta alterada o incompleta impide la descarga. No se persiste información salarial en localStorage/sessionStorage.

Pruebas: regresiones unitarias del comparador; controles existentes de corridas, decisiones, informes y comparación de respaldos; build completo; circuito HTTP/SQL con COMMIT en PostgreSQL 17 y 18 y navegador Chrome construido en PG17. Los actores, reglas e importes son sintéticos. La autenticación y las fallas de transporte del navegador se declaran como fixtures. La huella integral de objetos/filas comprueba que comparar y exportar no modifica resultados, cuerpos ni claves anteriores. La evidencia, el diff, la preservación de cambios ajenos y el resultado del proveedor quedan en verification.

Siguen pendientes la instalación/publicación de paquetes anteriores que la requieran, homologación municipal y aceptación, formatos OSEP/bancarios/fiscales e imputación propios, los demás puntos del plan de los diez módulos y operación física autónoma de todos los relojes. Noelia conserva prioridad; Mariano y los expedientes firmados siguen en su orden posterior. No se ejecutan ni reconstruyen borradores rechazados.
