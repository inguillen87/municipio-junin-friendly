# Noelia · M8: jurisdicción histórica de liquidaciones propias

Incremento implementado para pruebas locales. Su instalación en las bases municipales, publicación y aceptación se comprueban por separado en `verification/CODEX_OWN_JURISDICTION_RESULT_20261007.md`. No declara cerrado M8, los diez módulos ni la autonomía integral.

## Necesidad y recorrido

M8 pide planillas y estadísticas por jurisdicción, además de convenio, repartición, concepto, período y tipo. SQL095 ya conserva la declaración expresa 42/55 de cada alta propia; las capturas y cierres de nómina todavía no conservaban ese dato histórico. Un padrón actual no sirve para reinterpretar una liquidación anterior.

En **Nómina → Informes → Consultar histórico propio**, el selector inicia en **Todas las jurisdicciones**. Ofrece 42, 55, **Sin informar en el alta** y **No capturada en el cálculo**. La agrupación de estadísticas incorpora jurisdicción; las planillas, resúmenes y conceptos muestran la clasificación conservada cuando hay fuentes v2. Los informes íntegramente v1 mantienen sus ocho columnas originales.

La clasificación se conserva al crear una captura nueva, dentro de `payload.sourceInventory.jurisdictions`, ligada a todos los contratos, registros e identidades de la población seleccionada. Forma parte de su hash. El resultado financiero, fórmulas, precisión, entrada de cálculo y comando del operador mantienen su contrato anterior. No se cambia el algoritmo salarial para agregar una dimensión de consulta.

El cierre nuevo produce `own-close-snapshot.v2`; cada participación conserva el código y el hash de su captura. Los cierres v1 y sus recibos continúan siendo legibles. Reabrir un cierre conserva su copia original. Recuperar o repetir un cálculo anterior devuelve el mismo cuerpo, clave, captura, entrada y resultado; no agrega jurisdicción retroactivamente.

La huella de revisión del cierre incluye la versión del protocolo. Si una decisión todavía no registrada se preparó antes de la instalación, el servidor la rechaza por revisión cambiada, sin alterar su cuerpo o clave ni efectuar el cierre/reapertura. El operador conserva la recuperación y revisión expresa existentes. Un intento ya registrado se recupera primero con su comprobante original.

## Integridad del alcance

- No se deduce jurisdicción desde convenio, repartición, legajo, un total, una tabla de GRH ni la vista actual del empleado. 42/55 es una declaración administrativa: no certifica encuadre fiscal, F931, firma, imputación o pago.
- Un alta histórica propia sin declaración conserva un código nulo con procedencia capturada. Un cálculo anterior sin esta captura conserva la procedencia **no capturada**. Son situaciones distintas; ninguna significa cero o 42/55.
- Si el alcance previo a filtrar jurisdicción incluye participaciones desconocidas, 42/55 se bloquea con una explicación. No excluye silenciosamente filas de clasificación desconocida. Se puede consultar todo, revisar esas participaciones o elegir contratos exactos conocidos.
- PDF, Excel y CSV contienen todo el alcance declarado. La búsqueda y página sólo cambian la pantalla. Los valores originales se agregan con aritmética decimal exacta, sin reevaluar conceptos. CSV neutraliza fórmulas; Excel conserva cadenas decimales; PDF rechaza caracteres no representables.
- Antes de mostrar y descargar se verifica el histórico completo y sus versiones. Cambiar jurisdicción durante una descarga la cancela; ocultar la página, cambiar tarea/cuenta o retirar permisos elimina los resultados. No se agregan POST de informes ni persistencia nominal en localStorage.

## Instalación conservadora

`scripts/lib/own-payroll-jurisdiction-installation.mjs` compone las fuentes exactas propias 130/132–142, 125 y 143. SQL143 aislado contiene sólo el validador privado: **no se instala como sustituto del lote compuesto**.

El lote adapta cinco cuerpos existentes: captura de corrida, detalle de cierre, copia de cierre, fuente de recibos y comprobación de disponibilidad de adopción. Conserva firmas, OID, propietario, atributos, configuración y ACL. Agrega un validador privado; no crea tablas, concede permisos existentes, modifica filas anteriores ni ejecuta operaciones municipales. Verifica hashes antes/después y huella de todo el estado anterior; una mezcla inesperada de funciones se rechaza. Se exige transacción REPEATABLE READ y durabilidad desde otra conexión; repetir el lote comprobado no produce nuevas modificaciones.

La fuente de recibos admite cierres v1/v2; su estructura de recibo no cambia. La composición mantiene todos los controles de revisión independiente, límites, recuperación y guardas existentes.

## Siguientes cierres

1. Contrastar los prerrequisitos, capacidad y estado real de ambas bases existentes. El conector Neon sigue sin autenticación usable tras los dos avisos de reconexión documentados; no se cambia de credencial, transporte o base para eludir ese fallo. No hay evidencia que atribuya esta limitación al plan gratuito.
2. Con los prerrequisitos propios 130/132–142 y CI verdes, publicar primero el SHA de aplicación compatible con v1/v2 en Production. Verificar que sigue consultando cierres v1; después instalar únicamente el lote143 compuesto revisado y verificar conservación/durabilidad. Comprobar el mismo dominio/SHA y el circuito v2. Instalar143 antes de publicar una API compatible haría fallar lectores antiguos: ese orden queda excluido. Una reversión de aplicación debe mantener lectura v2 si ya hay cierres v2 registrados. La autorización del usuario para publicar después de cada sprint está vigente; la comprobación Vercel anterior devolvió 403 de equipo. No confundir un build local con ese cierre.
3. Homologar códigos y programas con Noelia, completar formatos de salida propios, antigüedad y planillas institucionales con las fuentes documentadas. La firma de recibos y expedientes corresponde al frente separado autorizado. Continúan pendientes los diez módulos completos, asistencia/relojes, imputación y actores; Mariano queda después de Noelia.
