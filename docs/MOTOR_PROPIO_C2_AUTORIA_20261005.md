# C2 · autoría, revisión independiente y cálculo con el programa aprobado

Implementado y probado localmente. La instalación productiva de SQL122/123, CI remoto, publicación y homologación municipal siguen pendientes.

La tarea **Reglas de cálculo**, dentro de Nómina (`/nomina#reglas`), permite preparar el primer programa desde una instalación sin reglas y revisar modificaciones posteriores. El operador consulta el catálogo salarial aprobado, declara convenio, concepto, vigencia, tipo, naturaleza, unidad, fuentes, respaldo y redondeo. El editor cubre todas las operaciones que admite el motor propio, incluidas conversión explícita, comparación y condición. No carga fórmulas municipales inventadas ni interpreta rutinas de GRH.

Las entradas distinguen parámetro, escala, cantidad e importe de novedades mensuales o fijas. Parámetros y escalas deben estar informados y ser únicos. La ausencia completa de novedades sólo equivale a cero cuando se declara expresamente; no se convierte un valor desconocido en cero ni se deducen equivalencias de horas/porcentajes. Cada conversión exige factor exacto y respaldo.

La comparación muestra todas las reglas y entradas antes y después, incluidos los elementos conservados y la precisión de totales. Elegir una regla para editar no recorta el programa. Las reglas aprobadas conservan su historial: el operador cierra su vigencia para reemplazarlas y no puede retirarlas del editor. La propuesta se registra sólo después de revisar y confirmar el conjunto completo; no calcula haberes.

Otra persona habilitada decide sobre la propuesta guardada completa, con su fundamento e historial. El servidor comprueba independencia aun cuando el autor tenga capacidades de preparación y aprobación. Un cambio de programa o catálogo impide aprobar una propuesta desactualizada; puede rechazarse conservando antecedentes. La tarea **Calcular** utiliza la versión efectivamente aprobada por este circuito.

Antes de enviar se releen sesión, permisos y versiones. Una respuesta incierta conserva el cuerpo y clave originales en memoria; la edición queda bloqueada y el reintento no duplica eventos. Sólo un GET que verifica la ausencia del mismo intento habilita revisar nuevamente. Esa acción conserva todo el programa preparado y su fundamento, sin enviar automáticamente y exigiendo otra revisión. Ocultamiento, cambio de tarea, cierre de sesión y revocación retiran las vistas; una respuesta tardía no las repuebla. Otra sesión no recupera ni reenvía un intento ajeno. No hay persistencia de reglas o resultados en localStorage/sessionStorage.

La pantalla usa etiquetas, foco visible, controles de al menos 44px, estado anunciado y tablas completas desplazables por teclado. Se verifican escritorio y anchos móviles de 390px y 320px. Los cuatro módulos/estilos nuevos se incluyen en la lista explícita del build; el workflow existente conserva sus regresiones y agrega el recorrido desde un programa vacío hasta el cálculo real.

## Evidencia y criterios que siguen abiertos

El navegador ejecuta el paquete real construido, handlers y SQL reales con COMMIT, conexiones separadas y datos exclusivamente sintéticos en PostgreSQL 17 y 18. Se crean seis reglas y dos entradas mediante formularios, se compara todo el programa guardado con el esperado, se aprueba independientemente y se modifica/aprueba otra versión. El cálculo posterior usa esa versión exacta. La prueba incluye envío no registrado, respuesta perdida después de COMMIT, mismo cuerpo/clave pese a edición forzada, negativa SQL a autoaprobación, historial, móvil, ocultamiento y revocación SQL efectiva.

El gateway de autenticación, la proyección del directorio, un envío que no llega al escritor y la indisponibilidad del tablero histórico son fixtures declarados. No son una prueba de aceptación municipal ni de la sesión productiva. El resultado se registra en `verification/CODEX_OWN_PROGRAM_UI_RESULT_20261005.md`.

Este incremento completa la pantalla de autoría y su conexión a Calcular en QA. No completa los módulos 6/7 ni la nómina integral. Falta homologar las reglas municipales, auditar e instalar SQL122/123, publicar con CI y SHA exacto, y completar anulación/recálculo/confirmación/cierre, recibos, informes, formatos, OSEP/masivas e imputación/cargos anuales. El parque de 14 relojes mantiene su circuito separado de captura, vínculo temporal, reglas de turnos/recreos/extras y revisión de Hugo; el cálculo salarial no certifica su autonomía cloud. Firmas y expedientes conservan el frente previamente acordado.
