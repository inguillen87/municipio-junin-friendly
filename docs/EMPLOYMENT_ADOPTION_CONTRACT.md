# Contrato de adopción del padrón — componente en desarrollo

`assets/employment-adoption-contract.js` valida entradas y confirmaciones para una futura adopción explícita de contratos existentes. Es un componente puro: no contiene consultas, escrituras, almacenamiento, llamadas a servicios ni búsqueda de personas. Todavía no existe una API, migración o pantalla de adopción que lo utilice. Este componente no incorpora el padrón ni habilita liquidaciones municipales.

## Identificación y selección completa

La propuesta declara una versión de contexto de fuente, una versión de selección, una versión de catálogo y todos los contratos elegidos. Cada fila contiene únicamente el UUID existente del contrato, su versión y la jurisdicción expresamente seleccionada. No recibe una identidad nueva ni permite modificar DNI, CUIL, nombre, fechas, origen o municipio por declaración del cliente. Los valores de jurisdicción son los admitidos por el contrato nativo existente; este validador no acredita su correspondencia con cada empleado.

Se admiten UUID canónicos aunque no sean de versión 4, conforme a la reparación publicada del padrón. Las filas repetidas se detectan en toda la selección, sin distinción de mayúsculas en el UUID. Entre uno y diez mil contratos se conservan íntegramente; superar ese límite rechaza la propuesta completa. Es un límite de esta representación, no una certificación de capacidad ni una solución a la barrera de 500 registros del escritor TXT.

Acto y motivo se normalizan a NFC y se validan por caracteres Unicode. Todas las estructuras tienen campos cerrados; no admiten campos adicionales, ocultos, simbólicos o accessors. El resultado es una copia inmutable y conserva las versiones e identificadores recibidos.

## Decisión y confirmación

La revisión identifica una propuesta y sus versiones originales, junto con la decisión y el motivo. No puede sustituir filas o identidades. La separación entre proponente y revisor **todavía debe implementarse y comprobarse en el servidor**: esta estructura de datos no acredita quién decide ni sus permisos.

La confirmación exige cantidades exactas, estado coherente y una fecha de decisión válida. Puede cotejarse contra operación, propuesta, versión, estado, cantidad, contexto y catálogo esperados. Una confirmación parcial, de otra propuesta o de otro contexto se rechaza. Los únicos efectos admitidos son la adopción administrativa completa aprobada y conservación de antecedentes; no admite creación de identidades/contratos, cálculo, contabilización o pago. Estos campos son obligaciones del futuro escritor, no pruebas de que ya existan dichos efectos.

Un reintento debe conservar la respuesta de la operación original. La propuesta tiene confirmación pendiente; la decisión tiene su propia confirmación aprobada o rechazada. Consultar el estado posterior de la propuesta será un recurso separado. No se cambia retrospectivamente el cuerpo ni la clave del intento para acomodar una decisión posterior.

## Condiciones pendientes del circuito real

El esquema existente distingue contratos `GRH` referenciados por un lote, sin `tenant_id`, y contratos `MUNICONTROL` con ámbito propio y registro nativo. El literal propio es `MUNICONTROL`; `MUNI` no es un origen válido de ese esquema. La ausencia de municipio en una fila histórica es una condición deliberada del modelo, no una autorización para asignarlo masivamente.

Antes de adoptar hay que demostrar en PostgreSQL de pruebas: sesión y ámbito frescos; autorización y revisión independiente; misma selección completa bajo bloqueo; correspondencia de catálogos y jurisdicción; operación atómica, conservación de IDs y antecedentes; recuperación del mismo intento después de COMMIT; revocación; cantidad/capacidad y recuperación verificadas. La revisión debe incluir los consumidores propios de familia, certificados, licencias, novedades, asistencia y nómina. Conservar claves foráneas no prueba que esos lectores mantengan el significado histórico.

No debe backdatearse un registro para superar las condiciones de historia del cálculo propio, sustituirse una fuente instalada por un respaldo sin decisión ni recrearse el intake/resolvedor/evaluador rechazado. La instalación de infraestructura tampoco autoriza por sí sola una operación nominal real.

## Verificación disponible

`tests/employment-adoption-contract.test.js` usa únicamente selecciones y confirmaciones sintéticas. Comprueba el conjunto completo, el límite sin recorte, duplicados tardíos, campos cerrados, versiones, jurisdicción explícita, copia inmutable, confirmaciones parciales o contradictorias y fechas imposibles. No es una prueba de integración SQL, aceptación municipal o publicación.
