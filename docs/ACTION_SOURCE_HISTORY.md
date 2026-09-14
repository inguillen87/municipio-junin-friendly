# Consulta de acciones de respaldos anteriores

La migración 059 conserva la consulta de licencias y solicitudes de horas extra cuando el contrato pasa a un respaldo posterior y puede demostrarse que sigue correspondiendo a la misma persona. Reutiliza los registros inmutables de `source_staging_row`; no crea una tabla de beneficiarios, no reconstruye identidades mediante nombres de actores y no incorpora otro respaldo.

El estado administrativo guardado, las observaciones, los eventos y sus fechas se conservan. Una solicitud anterior aprobada continúa mostrando ese estado, pero queda disponible sólo para consulta. Este incremento no completa el refresh de GRH ni autoriza una importación o promoción canónica.

## Contrato de lectura

Se reemplazan las cuatro fachadas vigentes: `action_center_tenant_list_v2`, `action_center_tenant_detail_v2`, `action_center_overtime_list_v1` y `action_center_overtime_detail_v1`. Mantienen sus parámetros, paginación, sesión certificada, municipio, fuente vinculada y capacidades existentes.

Cada registro agrega exclusivamente esta información de procedencia:

```text
sourceContext: {
  status: "current" | "historical_read_only",
  sourceCutoffAt: fecha y hora ISO con microsegundos,
  currentCutoffAt: fecha y hora ISO con microsegundos
}
```

Las fechas son cortes de los respaldos, expresados en UTC. No representan la creación de la solicitud ni una certificación del padrón actual. En `current` ambos cortes coinciden; en `historical_read_only` el corte original es estrictamente anterior. El objeto no agrega identificadores, documentos personales ni hashes a la respuesta.

La fuente actual conserva la proyección previa. Para una fuente anterior, el nombre y sector salen del contenido conservado en ese respaldo. Los permisos siguen evaluándose con la sesión vigente y el área registrada en la acción: el traslado posterior a otra área no concede acceso al historial de la anterior. La proyección salarial sigue limitada a las licencias aprobadas y no restringidas; no entrega nombre, legajo, notas ni eventos nominales.

## Continuidad de identidad

El helper privado `action_center_case_source_context_v1` exige, para cada acción histórica:

- Contrato, municipio, empresa y vínculo con la fuente coherentes; ambos lotes publicados pertenecen a la misma base de origen.
- Corridas de importación completadas, con hash y corte coincidentes con cada lote canónico.
- Exactamente una fila de `legajo` por lote y clave de origen, con hash de contenido comprobado. La búsqueda distingue la empresa textual del contenido curado de la empresa numérica de la clave almacenada.
- Empresa y legajo coincidentes; ID de persona de origen normalizado y UUID canónicos de persona y contrato verificables. El contenido del contrato actual debe coincidir con su fila conservada.
- Igualdad de nombre, documento, CUIL y nacimiento, contemplando faltantes; también de `sexCode` cuando está presente. Se exige nombre informado y al menos un documento, CUIL o nacimiento válido. La identidad canónica vigente debe ser coherente con las normalizaciones del importador.
- Organización y sector originales coincidentes con los registrados en la acción.

Una fila ausente, duplicada, alterada o incompatible deja la acción histórica fuera de la consulta. Lo mismo ocurre ante reasignación de persona, corrección de los campos de identidad comparados, corte no posterior o evidencia insuficiente. No se sustituye esa comprobación con el nombre actual ni se adjudica la acción a otra persona. La recuperación de casos con identidad corregida requiere un procedimiento posterior explícito.

La evidencia utilizada es el contenido del respaldo asociado a la acción; no se presenta como un snapshot nuevo capturado al crear cada solicitud. La continuidad depende de la trazabilidad canónica comprobada de esos respaldos.

## Modificaciones y reintentos

Los detalles históricos devuelven `allowedCommands: []`. Además, `action_center_apply_tenant_command` y `action_center_apply_overtime_command_v1` ejecutan la guarda privada `action_center_assert_case_source_current_v1` antes de devolver un reintento confirmado o modificar una acción existente.

La guarda exige que contrato y acción sigan en el mismo lote publicado y dentro del municipio y vínculo autorizados. Retiene bloqueos compartidos sobre contrato y lote hasta finalizar la transacción. Una solicitud anterior se rechaza con `ACTION_CASE_NOT_FOUND`, incluido el reintento de creación o actualización ya registrado, para conservar el límite de existencia entre ámbitos. La contención de esos bloqueos se traduce a `ACTION_SESSION_BUSY`, la respuesta temporal existente que permite reintentar sin continuar con una fuente sin verificar.

Los dos mutadores conservan exactamente las reglas anteriores de preparación, aprobación, separación de responsabilidades, estados y eventos, más estas guardas. No se agregan capacidades ni acceso directo a tablas. Los dos helpers sólo son ejecutables por su propietario; el runtime conserva las seis fachadas existentes.

## Validación registrada y publicación

La comprobación focal de estructura pasó 66 pruebas, incluidas las 17 nuevas de 059. Verifica las seis firmas anteriores, los bloques de autorización y proyección conservados, que los mutadores sólo incorporan las guardas previstas y que la contención se traduce al error temporal existente.

La prueba SQL se ejecutó en PostgreSQL local restaurado con datos sintéticos y terminó en `ROLLBACK`, con conservación del estado de referencia. Cubrió las cuatro lecturas históricas, nombre y sector originales, comandos vacíos, rechazo de los cinco comandos y de reintentos previos de ambos tipos de acción; también reasignación de persona, corrupción de claves/hash/identidad, valores de persona y fecha inválidos, acceso por área, confidencialidad, proyección salarial y revocación de sesión.

La evidencia SQL con fixtures es local. El producto f4913bce90485581a8564a46501b29d849eb49c5 pasó CI34831993004 y SQL059 se aplicó a las 10:14:28.648 UTC del 14/09/2026 sobre la rama operacional existente. La publicación dpl_E1GkfjXcjYE3C8k4HYLQSN1vfdUY quedó READY con ese SHA. Pasaron 14 recorridos sobre siete assets publicados usando APIs sintéticas. La consulta independiente verificó cuatro casos actuales y sus nueve eventos conservados. Una simulación local de corte posterior conservó la lectura de esos cuatro casos y revirtió sin diferencias en las 118 tablas. El cierre completo está en `docs/13_CONTINUIDAD.md`. No se acredita una sesión municipal real, casos históricos productivos ni la promoción de un nuevo respaldo.

## Reversión coordinada de base y aplicación

`scripts/rollback/059-action-source-history.sql` restaura las seis definiciones previas completas. La revisión independiente comprobó sus seis cuerpos contra las huellas anteriores y las migraciones 007/008/017/018. Contiene seis sentencias de definición de funciones y ninguna escritura de datos ejecutable al aplicar el archivo; las operaciones dentro de los mutadores restaurados sólo se ejecutan si posteriormente se invocan esas funciones.

La reversión debe realizarse sobre el destino verificado, con respaldo privado restaurado y dentro de una transacción, coordinando la aplicación anterior para evitar mostrar la interfaz histórica contra un contrato distinto. Antes de confirmar, comprobar cuerpos, propietarios, permisos y conservación de acciones, eventos, fuentes y demás datos propios. Las funciones auxiliares privadas de 059 pueden permanecer sin uso; el registro de migraciones se conserva como evidencia histórica. El aplicador normal rechaza un ledger de 059 cuyos cuerpos hayan sido revertidos: volver a instalarlo exige reconciliar explícitamente ese estado, sin borrar el registro para forzar el procedimiento.

Este rollback también retira las nuevas guardas de modificación y vuelve a ocultar las acciones de lotes anteriores. Si después de publicar se promovió otra fuente y ya existen acciones históricas, no debe tratarse como una reversión automática inocua: restauraría mutadores anteriores que no imponían esta restricción. En ese caso hay que conservar la protección o preparar una reversión específica que la mantenga. No se borran solicitudes, eventos, documentos o marcas, ni se restaura toda la base para revertir una interfaz.
