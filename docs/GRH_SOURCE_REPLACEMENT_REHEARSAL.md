# Revisión de septiembre y reemplazo transaccional de fuentes

Este incremento identifica S11, compara sus cinco salidas de nómina y ensaya el reemplazo de datos curados e identidades **en la restauración local existente, con reversión obligatoria**. No incorpora septiembre a Neon y no habilita una actualización desde la pantalla.

## Perfiles y procedencia

`scripts/lib/grh-source-profiles.json` fija los dos cortes conocidos: 6 de agosto y 10 de septiembre de 2026. Contiene la huella del SQL lógico, tamaño, base, corte, cantidades, mes de nómina, estado de cierre y cohortes esperadas. La huella del gzip es independiente. El candidato exige selección explícita; cambiar el perfil predeterminado no autoriza escrituras.

Ambos extractores admiten SQL o gzip, verifican los bytes de la lectura real y rechazan fuentes truncadas, archivos cambiantes, bases distintas, claves duplicadas y expectativas divergentes. La excepción para fixtures sintéticas exige dos indicadores y sólo admite el perfil de agosto. S11 siempre exige sus controles completos.

Las pruebas reales leyeron los respaldos desde almacenamiento privado. Git, CI y Vercel contienen código, perfiles agregados y fixtures sintéticas; no contienen SQL, JSON nominales, informes privados ni credenciales.

## Qué se reemplaza y qué se conserva

`replaceCuratedWithinTransaction` exige una conexión con transacción activa, cuatro bloqueos comunes, corrida y lote base explícitos y proyecciones completas. Bloquea contratos antes de familiares, compara la base y su staging inmutable, valida claves después de convertirlas a tipos PostgreSQL y crea la nueva corrida dentro de la misma transacción.

Elimina exclusivamente las filas de las cinco proyecciones curadas pertenecientes a la corrida seleccionada e inserta el candidato. No trunca tablas, reinicia secuencias, borra registros de importación ni modifica staging anterior. Un resultado parcial obliga a revertir toda la transacción.

La promoción exige `expectedBaseline` para un lote nuevo, conserva identidades canónicas existentes y rechaza legajos desaparecidos o reasignados. Rota sólo las referencias GRH seleccionadas. Las assertions conservan el perfil natural aceptado: un DNI inválido que el maestro mantiene vacío no se transforma en identidad elegible. Los valores crudos proceden de la proyección curada; por ejemplo, su fecha de nacimiento ya pasó por la normalización del extractor.

El ensayo verifica contenido y cantidades de todas las tablas antes y después. PostgreSQL no revierte `nextval`: el resultado separa `tablesUnchanged`, `sequencesUnchanged` y los avances observados dentro de límites declarados. Nunca ejecuta `setval` para disimular esos avances. Una reversión sin el centinela original no se considera comprobada.

## Resultado de la comparación real

La comparación de las salidas completas encontró:

| Dominio | Iguales | Modificados | Nuevos | Ausentes |
|---|---:|---:|---:|---:|
| Corridas | 618 | 2 | 4 | 0 |
| Snapshot mensual | 0 | 0 | 847 | 854 |
| Movimientos | 489.444 | 2 | 5.791 | 13 |
| Hechos mensuales | 213.352 | 811 | 2.248 | 1 |
| Conciliación administrativa | 1.595 | 855 | 2 | 0 |

Los 811 hechos mensuales modificados y el ausente corresponden a agosto de 2026, tipo M. El registro ausente conserva otros hechos históricos; no corresponde eliminar su historia. Los identificadores del snapshot se renuevan entre meses: las filas ausentes no equivalen a bajas laborales.

Septiembre presenta 847 integrantes del snapshot y 875 activos administrativos. El cálculo mensual contiene 848 pares empresa-legajo de tipo M: 847 del snapshot y uno administrativamente inactivo. La unión M/O/V contiene 855 pares, incluidos ocho inactivos. Estas diferencias se conservan como evidencia; no se excluyen automáticamente ni prueban pagos. Los 28 activos restantes no aparecen en esos cálculos del mes.

El reporte `grh-core-artifact-comparison.v1` devuelve sólo cantidades, huellas y límites de interpretación. Verifica el digest de los mismos bytes que produjeron los registros comparados. Los tamaños de payload JSON no son mediciones del almacenamiento PostgreSQL. La pantalla mantiene la revisión local, con sesión y permiso de trazabilidad, sin enviar el archivo al servidor.

## Controles todavía necesarios para publicar una fuente nueva

1. Versionar los hechos mensuales y su procedencia sin sobreescribir historia ni sumar dos copias del mismo mes. La clave primaria actual omite el lote y 214.163 claves coinciden entre cortes. Las vistas y consumidores actuales tampoco aíslan todas las versiones de fuente.
2. Medir el crecimiento del diseño definitivo y asegurar capacidad. Al comenzar este incremento la base operacional ocupaba 484.040.704 bytes y el límite configurado de rama era 536.870.912 bytes. No se cambió el plan ni se autorizó gasto.
3. Alinear el guard histórico de acciones 059 con ambos perfiles completos de DNI. La consulta de los cuatro casos actuales se prueba en el ensayo; eso no cubre futuros casos sobre identidades cuyo DNI de nueve dígitos fue rechazado por el maestro.
4. Certificar conservación y consulta de documentos propios existentes y sus referencias familiares. El entorno operacional tenía cero certificados: preservar una tabla vacía no acredita todos los escenarios de certificados reales.
5. Ensayar la transacción completa del núcleo, fallos, repetición, acceso con sesión municipal, respaldo y reversión antes de cambiar datos operacionales.

El guard del núcleo rechaza S11 antes del primer INSERT. El importador curado independiente también permanece limitado al perfil de escritura anterior. La publicación técnica de esta herramienta no concede aprobación de sueldos, firmas, pagos, cierres ni aceptación municipal. PM10 sigue requiriendo host municipal y clave comprobados, más una fichada nueva en Neon y pantalla con la computadora personal apagada.
