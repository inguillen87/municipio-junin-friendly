# Noelia · detalle nominal y correctivo de perfil

## Entrega de interfaz
En **Estructura → Organizaciones / Sectores → Ver legajos**, el directorio se abre en la misma pantalla. Muestra nombre y apellido, legajo, cargo informado y situación. Permite búsqueda, filtro de activos/inactivos y páginas de 25 filas. Cerrar o pulsar Escape conserva la búsqueda del agrupamiento.

El módulo JavaScript se descarga al abrir el listado. No consulta personas al cargar los agregados, no pide facetas, no consulta cada legajo por separado y cancela una respuesta pendiente al cerrar. No almacena datos nominales en localStorage o sessionStorage. Una denegación o error retira las filas anteriores.

Usa el recurso `employees` ya autorizado por `workforce.employee.read`, con el filtro exacto de organización o sector y el vínculo municipal del servidor. No agrega endpoints, roles ni permisos. Los usuarios sin lectura nominal no reciben el botón.

**Límite del módulo 10:** este detalle es el directorio laboral, no una certificación de ocupación presupuestaria. El módulo aportado por Noelia pide comparar cargos liquidados con el presupuesto anual y emitir el detalle en PDF. Los agregados de GRH, el directorio y el reporte presupuestario conservan sus criterios distintos; no se inventan vacantes ni se da por cerrado ese cruce.

## Causa del bloqueo de familiares y parámetros
La inspección autorizada del perfil activo encontró 89 capacidades efectivas y una incompatibilidad sin contemplar: `employee.catalog.approve` / `employee.catalog.propose`. Las otras doce parejas ya estaban revisadas. El control compartido propagaba ese conflicto a tareas ajenas al catálogo. La función de certificados lo convertía incorrectamente en sesión inválida.

El correctivo `107-operational-profile-catalog.sql` añade exclusivamente esa pareja al perfil integral existente y clasifica los errores de certificados sin atribuir cualquier fallo a sesión vencida. Conserva las funciones de sesión, la validación municipal y de fuente, y los controles de otra persona/cuenta/membresía para revisar propuestas. No añade capacidades ni asigna superadministración.

La prueba de PostgreSQL 17 reproduce primero el rechazo original y después valida el acceso a familiares y parámetros con una identidad sintética. También verifica permiso faltante, perfil distinto, sesión vencida/revocada, MFA ausente, identidad modificada, otro municipio, fuente no verificada y revisión por la misma persona. Todo termina en rollback.

**Aplicación pendiente:** la plataforma bloqueó la creación del programa que iba a preparar/aplicar el correctivo en Neon. No se ejecutó la migración ni se cambió el perfil de Noelia. La escritura de una prueba JavaScript adicional y la integración de esta regresión SQL al CI también fueron rechazadas; no se cuentan como ejecutadas. El ensayo SQL local sí terminó correctamente. El borrador anterior de un helper alternativo por tarea fue retirado y no forma parte del repositorio.

## Aceptación y continuidad
La interfaz nominal cuenta con 16 pruebas unitarias nuevas; junto a las dos regresiones de Estructura sumó 18 aprobadas. El recorrido de navegador cubre carga a demanda, dos páginas, búsqueda, estado, retorno sin perder contexto, móvil de 390 píxeles, denegación y cierre durante respuesta lenta. Las personas de ensayo son sintéticas, no una sesión real de Noelia.

El commit, resultado del CI y comprobación de archivos publicados se registran en la issue #37 al cerrar la publicación. No se actualizan haberes ni datos municipales mediante esta entrega. El candidato del 22/09, el formato receptor TXT 638 AMARU y el circuito completo del módulo 7 siguen pendientes; la antigüedad calendario de la entrega anterior permanece sin cambios. El expediente de proveedores mantiene su diferimiento hasta la autonomía acordada.
