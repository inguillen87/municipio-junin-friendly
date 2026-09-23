# Catálogo propio de encuadres para nuevas altas — 103

## Resultado buscado y estado

Personal prepara un catálogo de encuadres en MuniControl, otra persona autorizada lo revisa y, al aprobarlo, lo publica para las altas futuras. El catálogo reúne cuatro clases: convenios, categorías, organizaciones y reparticiones. La publicación es una decisión administrativa expresa; guardar una propuesta no cambia las opciones vigentes del alta.

El cierre técnico quedó publicado el 23/09 en `7285166dea8400e755982a720b2056d7f3fa87b6`: CI de rama `35877506021`, master `35878569712`, migración 103 instalada y verificada independientemente en PG18 y PG17, Vercel READY y recursos publicados cotejados. El recibo privado `catalog-release-closure.private.json` conserva ese cierre. No se incorporaron propuestas ni publicaciones ficticias; la primera aprobación de un catálogo municipal real sigue pendiente. Las pruebas locales o con APIs interceptadas no sustituyen la aceptación municipal.

## Circuito completo

1. Consultar el catálogo vigente y su procedencia. Antes de la primera publicación propia se identifica expresamente la referencia GRH que utiliza el alta existente; no se presenta como catálogo municipal ya revisado.
2. Preparar una propuesta completa con las cuatro clases, códigos, descripciones y relación de cada categoría con su convenio. Revisar el conjunto antes de enviarlo. Se conserva el límite de 1.500 elementos y la exclusión de los convenios 9/10 y sus categorías del alta existente; este sprint no cambia esa política.
3. Enviar la propuesta con fundamento y una clave de intento. Una respuesta incierta conserva el mismo contenido y clave hasta comprobar su resultado. Reenviar no debe crear otra propuesta.
4. Una persona distinta revisa la propuesta y decide aprobar o rechazar. **Aprobar publica** esa revisión para las altas futuras; no existe una segunda publicación implícita ni un catálogo parcialmente aprobado. Una propuesta pendiente o rechazada conserva el catálogo anterior.
5. Abrir una nueva alta y seleccionar sus opciones desde la revisión publicada. Un formulario abierto con otra versión debe actualizar las opciones y revisarlas antes de crear el legajo. El reintento de un alta ya confirmada recupera su recibo original.

Después de la primera publicación propia no se vuelve silenciosamente a GRH ante un error o un catálogo inválido: la operación informa el problema. Las propuestas y decisiones quedan conservadas. La consulta de historia muestra hasta 20 entradas y declara si hay más; ese resumen no se presenta como historia completa cuando está truncado.

## Las cuatro clases y la fuente comprobada

| Clase del catálogo | Campo del alta | Correspondencia de referencia |
|---|---|---|
| Convenios | `agreementCode` | GRH `convenio`, clave `CODI_02`. |
| Categorías o clases | `categoryCode` y su `agreementCode` | GRH `catego`, identidad compuesta `CODI_02` + `CODI_10`; un código de categoría aislado no identifica su convenio. |
| Organizaciones | `organizationId` | GRH `organiza`, identidad `IDORGANIZA`; el extractor distingue ese identificador de `codigoOrganiza`. |
| Reparticiones | `sectorCode` | GRH `sectores`, identidad de fuente `CODI_01` + `CODI_07`; el municipio/empresa se determina en el servidor. |

Estas correspondencias están preservadas en `scripts/extract_rrhh_curated.py` y en el catálogo utilizado por 067/099. El cotejo de menús y formularios GRH del 23/09 confirmó **Repartición → Sectores**. El mismo menú distingue **Área → Costos** y **Lugar de Trabajo → Lupago**: no deben intercambiarse esos términos para completar campos ausentes. La consulta fue sólo de metadatos de formularios; no creó ni modificó catálogos GRH.

Jurisdicción no es una quinta clase de este catálogo. Continúa la declaración explícita 42/55 de 095; no se deduce de convenio, organización o repartición. El dato tampoco homologa una clasificación fiscal.

Los códigos y rótulos que se publiquen en MuniControl son decisiones revisadas del municipio. La migración no inventa filas de GRH, claves de fuente, convenios, equivalencias ni una aprobación por copiar un catálogo histórico.

## Identidad, contratos y autoridad

La persistencia prevista utiliza `native_employment_catalog_proposal` y `native_employment_catalog_review`, con propuestas inmutables y una decisión por propuesta. Las fachadas del circuito son `native_employment_catalog_bootstrap_v1`, `native_employment_catalog_proposal_v1`, `native_employment_catalog_propose_v1`, `native_employment_catalog_review_v1` y `native_employment_catalog_attempt_v1`. El contexto municipal y la identidad del actor se obtienen de la sesión, no del formulario.

La lectura exige `workforce.employee.read`. Proponer y revisar utilizan las capacidades específicas `employee.catalog.propose` y `employee.catalog.approve`. La instalación prevista incorpora esas capacidades únicamente a roles municipales que ya poseen, respectivamente, `employee.record.propose` o `employee.record.approve`; no crea usuarios, membresías ni vínculos laborales. Ese cambio IAM debe estar enumerado y verificado como parte de la migración, no omitido del informe de preservación.

Las escrituras requieren una persona operadora realmente vinculada. La revisión independiente compara persona, membresía y correo: una segunda membresía de la misma persona no convierte una autoaprobación en revisión independiente. Asignar una capacidad no sustituye la comprobación de sesión y pertenencia vigentes.

El catálogo consumido por el alta conserva `items` y `version` y declara `origin`, `revision` y `publishedAt`. El contenido, su revisión de base y la clave de intento deben permanecer enlazados. Una propuesta preparada contra otra publicación requiere revisión explícita; no se reaplica automáticamente sobre una base distinta. `scopeVersion` vincula el envío con municipio, fuente certificada, membresía, persona y correo: otra membresía de la misma cuenta no puede reutilizarlo como un envío nuevo. El historial también conserva sesión, versión de sesión y release certificado de cada decisión.

Crear un alta y publicar un catálogo se coordinan mediante un bloqueo del mismo ámbito. La comprobación de replay del alta precede a la exigencia del nuevo catálogo: publicar no invalida ni altera un alta confirmada con una revisión anterior. Las formas históricas de 13/14 campos y sus comprobantes siguen siendo recuperables.

## Autonomía que aporta y límites

Con un catálogo propio publicado, mantener las opciones de nuevas altas deja de exigir un nuevo respaldo GRH. Se conserva el ámbito municipal certificado y la referencia histórica existente; este incremento no elimina todas las dependencias de los otros módulos.

No rectifica los contratos o identidades ya creados, no cambia retroactivamente su encuadre y no renumera legajos. No agrega montos, escalas, fórmulas, vigencias salariales, elegibilidad de conceptos, cálculo, liquidación, cierre, contabilización o pagos. Una categoría publicada no constituye una escala salarial aprobada.

La [matriz de Noelia, módulo 6](MATRIZ_ACEPTACION_NOELIA.md) conserva el pedido más amplio del manual de Parámetros: maestro de conceptos, auxiliares 88/90, fórmulas por convenio y actualización conjunta de 606/607/612/550. 103 no completa ese módulo. La exclusión de 9/10 de nuevas altas tampoco elimina sus antecedentes históricos; la falta de agentes en 3/8 mencionada para copiar fórmulas no se convierte aquí en otra exclusión automática del catálogo administrativo.

093, 101 y 102 siguen siendo consumidores de los contratos propios para novedades fijas, novedades mensuales y familia/escolaridad. Sus registros y recibos históricos deben preservarse. Sus exportaciones continúan siendo administrativas o de control, sin homologación salarial o bancaria inferida.

## Pruebas y gates de entrega

Comprobación local de interfaz y API: 45 pruebas del modelo/API y 22 grupos de navegador sobre la página Personas compilada; regresión del alta propia con 13 recorridos. Se revisaron capturas de escritorio y móvil, incluidos campos y rótulos completos a 390/320 px. Los recorridos interceptan todas las APIs con datos sintéticos; no representan operaciones municipales reales. El lector de solicitudes preserva los bytes originales en Vercel y rechaza claves JSON duplicadas, texto inválido, cuerpos incompletos y lecturas sin terminar.

El generador SQL utiliza el cuerpo instalado de referencia 099, conservado en `tests/fixtures/native-employee-catalog-installed-099.json`, cuyo contenido es únicamente código. Su huella y las sustituciones 099 se cotejan antes de probar el catálogo propio. Las migraciones históricas no se editan para hacer coincidir esta variante del cuerpo original.

Los siguientes controles constituyen la matriz de cierre; sus resultados completos se acreditan con CI y los recibos del release:

- Modelo/API: cuatro clases completas, relación categoría-convenio, duplicados, códigos inválidos, límite, campos extra, procedencia, revisión exacta y respuesta inválida sin degradación a GRH.
- Autoridad: municipio y binding diferentes, sesión revocada, operador sin vínculo, lectura sin escritura, autoaprobación por la misma persona con otra membresía y ausencia de acceso directo del runtime a las tablas.
- Idempotencia/concurrencia: misma clave y contenido recuperan el recibo original; otra solicitud con la misma clave se rechaza; revisión única; propuestas obsoletas; publicación concurrente con un alta; recuperación de altas anteriores a 103.
- Interfaz: preparar, revisar, rechazar y aprobar/publicar; diferencias y fuente visibles; borrador conservado ante error; bloqueo del intento incierto; revocación y respuesta tardía; escritorio y móviles de 390/320 px. Las APIs interceptadas prueban comportamiento, no aceptación municipal.
- PostgreSQL 17 y 18 reales y descartables: instalación y reaplicación, pines de prerrequisitos, RLS/ACL/restricciones, cambios no autorizados de metadatos y aislamiento de dos conexiones. Los datos sintéticos se revierten y se comprueba su ausencia.
- Regresión del alta 067/095/099 y consumidores 093/101/102: identidad, comprobantes, catálogo anterior, familia, certificados y novedades conservados.

Orden de release: commit exacto y CI verde → instalación transaccional revisada en PG18 y PG17 → comprobación independiente de esquema, permisos y preservación → promoción del mismo código → Vercel correcto y comparación de recursos publicados → verificación separada con una sesión municipal y un catálogo real aprobado. Ninguna aprobación real se fabrica para completar una prueba.

## Adaptación del operador privado de instalación

El operador de 102 sirve como referencia de los controles, no como manifiesto reutilizable sin cambios. Para 103 debe derivarse un inventario exacto de nuevas tablas, funciones, funciones reemplazadas, helpers privados, capacidades y concesiones. Las listas de familia/escolaridad de 102 no corresponden a este dominio.

Conservar la comprobación del repositorio limpio y commit exacto, CI correcto con las tres tareas exigidas, bytes Git de la migración, conexión y rama previstas, versión PostgreSQL y propietario. Antes y después deben cotejarse cuerpos, firmas completas, argumentos/defaults, retornos, volatilidad, `search_path`, OID de funciones reemplazadas, RLS, restricciones, triggers y ACL. Los helpers no se conceden al runtime por compartir prefijo con las fachadas.

Las filas municipales existentes se preservan mediante huellas agregadas sin datos nominales. El único cambio IAM admisible es el delta explícito de capacidades y concesiones de 103; no puede sustituirse por una excepción general para cambios de permisos. La instalación deja las nuevas tablas sin propuestas ni publicaciones de negocio y conserva las membresías, sesiones y recibos existentes. Debe medir todas las bases del proyecto y mantener la reserva de capacidad aplicada al release.

Si falla antes de COMMIT, se comprueba la reversión de esa transacción. Si COMMIT fue solicitado pero no se recibió su respuesta, el resultado es incierto: un ROLLBACK posterior no acredita deshacerlo y no autoriza reinstalar a ciegas. Se inspecciona desde otra conexión de sólo lectura y se exige coincidencia exacta antes de declarar durabilidad. Un esquema parcial o diferente se detiene para diagnóstico. Los recibos privados sólo incluyen metadatos y huellas; nunca credenciales, cuerpos nominales o errores SQL sin filtrar.
