# D1.2 · comparación contra la fuente operativa y dependencias nativas

## Referencia comprobada

El trabajo comenzó desde `6478f9abdf61e4da133fac06f6c6171dc1bb92d8`: GitHub `master`, el alias real de producción de Vercel y la copia limpia de trabajo coincidían. No se utilizó una carpeta antigua como referencia ni se instaló software desde un respaldo.

D1.1 construye las diferencias entre las fuentes 10/09 y 22/09. Este incremento verifica su correspondencia con **la versión realmente seleccionada en Neon**, sin dar por hecho que compartir fecha, cantidad o nombre de archivo significa compartir contenido.

## Qué comprueba la herramienta

El destino exige proyecto, rama, base, municipio, vínculo de fuente, versiones de núcleo/personal y huella de publicación explícitos. La lectura debe ocurrir en una única transacción PostgreSQL `READ ONLY`, aislamiento `REPEATABLE READ`. Se comprueba la misma selección al principio y al final; no hay selección implícita de la última fecha ni de la rama por defecto.

Para cada uno de los diez dominios se contrasta la proyección SHA-256 de D1.1 con la evidencia guardada al sellar la versión activa. A continuación se reconstruyen las filas activas y se recalcula su huella SQL, comparándola con el sello. Esto diferencia la identidad del manifiesto de extracción de la identidad de sus filas proyectadas.

Cada agregado debe tener una clave nueva. Cada reemplazo o ausencia debe encontrar exactamente su registro anterior; una discrepancia queda informada como incompatible. La propuesta se calcula en una CTE, no en una tabla de preparación: permite obtener su huella SQL y verificar cantidades y claves duplicadas sin insertar nada. Las asignaciones de captura también se agrupan por compañía, legajo, fecha, período, mes y tipo para detectar duplicación semántica.

Se registra la cohorte canónica de contratos y el estado agregado de trece grupos de cabeceras nativas: altas propias, familiares, certificados, registros escolares, solicitudes, asignaciones y novedades fijas, lotes de novedades, parámetros, cierre mensual, reprocesos y propuestas/revisiones de catálogos laborales. Cuando existe un vínculo de contrato se cuenta su intersección con las referencias afectadas; cuando no existe se informa `null`, no un cero que simule ausencia de relación.

Esta inspección de cabeceras no es una conciliación de todas las decisiones, adjuntos ni eventos históricos. Las dependencias detectadas deben conservarse y validarse en la integración posterior. Que haya una solicitud o un lote no significa que esté equivocado ni que pueda descartarse.

## Resultado observado en Neon

La ejecución del 25/09/2026 a las 00:19 UTC devolvió compatibilidad en **10 de 10 dominios**, con **3.260 diferencias comprobadas**, sin imágenes anteriores incompatibles ni claves agregadas ya existentes. Los sellos SQL recalculados coincidieron con los guardados.

Se observaron **2.452 contratos** del conjunto certificado, ninguno asociado a otro lote dentro de esa cohorte. **851 referencias de origen** están alcanzadas por alguna diferencia; no representan 851 altas o bajas de personal. Los cambios de formato de las asignaciones de captura explican parte de ese alcance.

En los grupos nativos se encontraron **4 solicitudes**, **2 lotes de novedades** y **1 expediente de reproceso**. Las cuatro solicitudes refieren a contratos dentro del alcance del paquete. Se marca revisión/preservación pendiente; no se anulan ni se cambian de fuente para forzar la actualización.

El manifiesto de núcleo reconstruido localmente tiene una huella distinta del manifiesto almacenado, pero las diez proyecciones y los sellos de filas resultaron compatibles; la diferencia se conserva en el informe. El manifiesto de personal sí coincide. No se atribuye una causa a esa variación sin inspeccionar ambos manifiestos.

## Límites y aceptación

En la inspección la migración 106 no estaba instalada. Se observó un tamaño de base de 477.224.960 bytes; esa medida puntual no certifica cuota disponible, crecimiento de índices, capacidad de restauración o costo. No se creó una rama paga, no se cambió el plan de Neon y no se escribió ninguna fila.

El resultado conserva `readOnly=true`, `stagingLoadAuthorized=false`, `publicationAuthorized=false`, `nativeConflictsResolved=false`, `capacityCertified=false` y `restorationTested=false`. Las huellas SQL siguen el contrato existente de sellos, que usa MD5; sirven para comprobación de consistencia, no como firma digital o autorización. La identidad del paquete y de las proyecciones conserva SHA-256.

La inspección es puntual. La transacción de carga posterior deberá volver a comprobar selección, imágenes anteriores y dependencias bajo sus propios controles. No puede usar el JSON de este preflight como una autorización permanente ni asumir que no hubo trabajo municipal después del snapshot.

Quedan implementados el plan de consulta, la evaluación del resultado y una herramienta CLI explícita. No hay endpoint público, cambio de permisos ni una nueva pantalla. El CLI requiere un archivo de destino acotado, las cuatro rutas de extracción y `--read-only`; la conexión se entrega mediante `MC_SUCCESSOR_READ_DATABASE_URL`, nunca como argumento impreso. Se rechazan opciones de carga. La salida contiene sólo conteos, identificadores técnicos, huellas y hallazgos: no cuerpos, nombres ni importes.

## Pruebas

Las 39 pruebas nuevas cubren destino incorrecto, selección mixta, aislamiento insuficiente, fuente distinta, proyección y sello incompatibles, colisiones de clave y asignación, resultado incompleto, cambio de snapshot, manifiesto distinto con contenido equivalente, dependencias nativas, argumentos de carga prohibidos y cancelación. El build local completo aprobó 5.081 pruebas, cero fallos y dos omitidas; los conteos del CI se verifican por separado.

La prueba real de lectura usa el paquete reconstruido y verificado desde los respaldos en cada ejecución. La evaluación unitaria utiliza datos sintéticos; no se confunde con la lectura real de Neon ni con una prueba de aceptación de Noelia o Hugo. No se registraron solicitudes de prueba ni se modificaron haberes.

La verificación queda enlazada al workflow existente del sucesor GRH. La condición de autonomía G-AUT-01 y el diferimiento de EXP-PROV-01 permanecen intactos. El próximo cierre sigue siendo preservación/resolución de dependencias en la integración → capacidad y restauración → carga sellada de preparación → selección sucesora explícita.
