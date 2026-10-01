# Padrón propio · consulta y listado completo

Incremento de la fase 1, posterior a PR #71. En Personas y legajos, «Padrón propio de MuniControl» permite consultar las altas propias, abrir la ficha por UUID y descargar Excel o CSV del conjunto completo elegido. Es una herramienta administrativa de consulta; no agrega rectificación, baja, reingreso ni licencias propias.

Filtros: nombre/legajo/DNI/CUIL, situación (incluido ingreso futuro), jurisdicción declarada, sector, repartición y convenio. Se cuentan legajos y personas por separado. Contratos con el mismo legajo permanecen separados. Los valores ausentes, incluida la jurisdicción no declarada por clientes anteriores, no se completan por inferencia.

Una sola consulta PostgreSQL lee contratos, identidades y registros de alta propios y arma filas, cantidades y filtros del mismo estado. Usa el validador nativo de sesión/municipio/vínculo existente y la capacidad `workforce.employee.read`. No consulta vistas GRH, resuelve identidades por DNI o modifica permisos. Conserva la exigencia del gateway de plano de datos y binding certificado. El retiro integral de esas dependencias de configuración no se acredita con este incremento.

La tabla pagina localmente y las descargas contienen todas las filas del filtro. Excel tiene identificadores como texto, encabezado fijo, autofiltro y hoja de control/procedencia. CSV protege prefijos de fórmulas y conserva comillas/CRLF; no exporta importes. No hay escritura municipal, almacenamiento local ni API externa.

Antes de descargar se relee el listado completo. Si cambia, se presenta la versión nueva para revisar y hace falta otra descarga voluntaria. Un cambio de municipio/membresía/vínculo retira la consulta anterior. Cerrar, ocultar o retirar permisos elimina las filas visibles y descarta respuestas tardías. El permiso de lectura sigue siendo obligatorio también para Superadministración.

Después de aprobar y verificar una rectificación propia, también se retira la revisión anterior del padrón. Conserva los filtros y pide consultar nuevamente antes de descargar; ninguna respuesta tardía de la consulta o descarga anterior repone sus filas ni desbloquea una consulta más nueva. El aviso sólo contiene el UUID del contrato y sirve para invalidar, no para autorizar una lectura. Se invalida el conjunto aunque ese contrato no estuviera en el filtro, porque pueden cambiar pertenencia y cantidades. Proponer o rechazar conserva el encuadre vigente; una confirmación incierta conserva el intento original hasta verificarlo.

La respuesta completa admite hasta 10.000 contratos y 3,5 MB. Superar cualquiera de esos límites produce una incidencia global; no descarga un padrón parcial. No cambia el límite de 500 del escritor de importación ni completa OSEP, cálculo salarial, asistencia o autonomía de relojes.

Validación: modelo/exportadores, handler real con SQL sintético, navegador local/publicado y consulta ejecutada en PG17/18 de CI dentro de las fixtures aisladas existentes. No se crean migraciones ni se ejecutan borradores rechazados. Pruebas y SHA de publicación se registran en el resultado del incremento; aceptación humana separada.
