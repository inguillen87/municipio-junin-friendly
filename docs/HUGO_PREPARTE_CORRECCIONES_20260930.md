# Hugo → Noelia · correcciones completas del preparte

Incremento local de asistencia y novedades. El preparte ya permitía revisar horas reconocidas, tope declarado y porcentaje por legajo. Al agregar la selección, el control detenía el recorrido en el primer error; el operador debía encontrar las restantes filas entre páginas y filtros.

## Comportamiento implementado

- **Revisar seleccionados** reúne las correcciones de toda la selección: horas, tope, porcentaje, respaldo documental y confirmación. Buscar o cambiar de página no recorta esa revisión.
- **Ir a la fila** retira los filtros, abre la página correspondiente y enfoca el campo indicado. Conserva las horas, topes y porcentajes ingresados. Las observaciones globales llevan al documento, confirmación o consulta que corresponde.
- La lista se actualiza al corregir datos. Cualquier modificación de decisiones o respaldo retira la confirmación documental previa. Una revisión válida informa explícitamente que todavía no agregó filas.
- Si existe una corrección, no se entrega ninguna parte de la selección. El límite vigente de 500 seleccionados sigue siendo una observación global; 501 no se divide ni se recorta.
- Agregar exige confirmar la cantidad completa y consultar nuevamente la evidencia. Una respuesta tardía no traslada decisiones modificadas, otro período/tipo, un corte cambiado, ni una vista retirada o sin acceso. La consulta inicial tampoco repuebla datos después de perder acceso. La planilla mantiene su rechazo atómico de conceptos de mayor dedicación repetidos.
- Al ocultar la página o descartar el preparte se retiran filas, decisiones y correcciones. El workbench conserva su retiro existente por revocación de permisos y navegación. La sección nueva usa texto seguro, botones con nombre accesible, foco visible y distribución móvil.

La revisión utiliza las reglas existentes: horas HH:MM, referencia de puntos exactos sin interpolación, conceptos 44/95 y respaldo de Personal. No homologa reglas, suma fuentes ambiguas ni reconoce automáticamente tiempo observado. Se conserva la salida de diez columnas y la API mutable anterior para consumidores existentes.

## Verificación y estado

Base `a9b7149dd62a4e7f444f33c4129c417a91c6a4cc`, rama `work/codex-autonomy-20260930`. Los sprints locales anteriores y los cambios externos de rutas se conservaron.

Antes de editar: **50 pruebas aprobadas** de preparte e integridad de fuentes. Final: **468 aprobadas, 0 fallos, 0 omitidas**, incluyendo **25 regresiones nuevas** del modelo y panel. Cubren selección de 60 filas en tres páginas, filtro sin recorte, navegación y foco, todas las correcciones, 500/501 seleccionados, datos no canónicos, cambios tardíos, revocación, retiro de vista, origen cambiado, doble clic y duplicados frente a la planilla. Se mantuvieron las pruebas existentes.

Las pruebas ejecutan funciones reales con fuentes sintéticas y dobles de DOM/API/SQL. No acreditan navegador, PostgreSQL real, sesión de Hugo/Noelia ni aceptación municipal. Sintaxis JavaScript y `git diff --check` aprobados. Build y navegador siguen pendientes por la denegación de acceso de esbuild registrada anteriormente y el frente de rutas aplazado; no se reintentaron ni se sustituyeron sus verificadores.

## Continuidad

El resultado y el diff acotado se conservan en `verification/CODEX_PREPARTE_CORRECTION_RESULT_20260930.md` y `verification/preparte-correction-functional.patch`. Este incremento no se publicó: sin commit, push, merge ni deploy.

Quedan pendientes el padrón y guardado nativos completos, OSEP y el límite del escritor, cálculo salarial propio, aprobación persistente de tiempo con reglas homologadas, recibos y comparación presupuestaria anual. No se ejecutaron ni recrearon los borradores rechazados de rutas, SQL, resolvedor o evaluador. Relojes/cloud, VPN, firma, permisos y bases productivas no fueron operados. Esta revisión de preparte no acredita autonomía integral de MuniControl.
