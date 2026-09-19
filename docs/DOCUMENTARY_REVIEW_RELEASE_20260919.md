# Revision documental nativa - 19/09/2026

## Corte funcional

Nueva seccion Juridica > Revision documental. Consulta las ultimas versiones registradas del municipio y presenta ocho categorias: todas las fichas, sin articulos transcritos, sin fecha de emision, sin fecha de publicacion, sin fecha de efectos declarada, sin temas, sin resumen y documentos registrados como proyecto.

Los conteos se calculan en PostgreSQL sobre el conjunto autorizado completo; la lista se pagina de a 25 fichas, sin contar las versiones anteriores como normas adicionales. Cada resultado abre su version documental exacta. Las categorias se superponen y no deben sumarse. Un campo ausente no significa incumplimiento, invalidez ni obligacion de publicacion; algunas fechas pueden no corresponder al documento.

La pantalla conserva estado vacio real y descarta filas y conteos anteriores si la respuesta falla o no se verifica. La revocacion del acceso limpia tambien el area privada. No hay escritura de normas, tareas, aprobaciones ni calculos legales. El componente se carga al abrir esta seccion, no al entrar al registro.

## Backend aplicado

Migracion aditiva 078-legal-documentary-review.sql: una funcion nueva, legal_documentary_review_v1(jsonb,jsonb), sin tablas nuevas. Se aplico atomicamente tanto al origen operativo PostgreSQL 17.11 (noisy-poetry-54471701 / br-plain-dust-acpjgebb) como a la copia aislada PostgreSQL 18.6 (wild-cake-87689498 / br-plain-dawn-ac8crb1h).

La funcion exige el contexto municipal gestionado que ya usa el Registro normativo: sesion, MFA, membresia activa y legal.norm.read. La API deriva el contexto autenticado; no admite tenant, responsable ni permisos en los parametros del cliente. Solo GET y filtro/pagina exactos para el recurso documentary_review. Los POST no pueden usar este recurso para mutar datos.

PUBLIC no tiene EXECUTE. El rol aplicativo existente recibe exclusivamente EXECUTE sobre la funcion nueva; no se habilito su inicio de sesion en la copia ni se alteraron cuentas o asignaciones de rol. La huella de pg_get_functiondef coincide entre PostgreSQL 17 y 18: 8e3ea12eab6c85a69c23ceacd992810603d472f3e23abda2ec697d7f8653fd0e. Una llamada sin contexto fue rechazada con LEGAL_SESSION_INVALID.

La lectura posterior del origen confirma 145 tablas, cero normas y cero revisiones registradas. Por lo tanto, la pantalla productiva debe mostrar un registro vacio hasta que se incorporen documentos reales; los ejemplos de las pruebas NO se cargaron alli. El corte GRH publicado sigue en 06/08/2026.

## Evidencia

Regresion final local: 3.727 pruebas aprobadas, cero fallos u omisiones. Incluye 17 nuevas pruebas de contrato/API: conteos, duplicados, pagina/filtro, referencias, denegacion anonima, permisos y aislamiento del contexto. Compilacion aprobada; paquete principal juridico 98.158 bytes gzip, dentro de su limite existente. No se agregaron dependencias ni se ampliaron cuotas.
En PostgreSQL 18 se ejecuto un ensayo en esquema sintetico aislado, con rollback completo y 61 comprobaciones del registro y de la consulta documental. Reutiliza el verificador del registro: el helper previo de separacion de funciones es sintetico, mientras que el contexto de sesion/MFA y los filtros ejecutan las funciones reales adaptadas al esquema QA. El hash que reporta ese ejecutor corresponde a la migracion base 069; la definicion nueva se identifico adicionalmente mediante su huella de catalogo al instalarla. No se declara un ensayo integral de usuarios municipales reales.

Navegador local: ocho controles nuevos del panel y 22 del registro existente. Interfaz y adaptador API reales, sesiones y respuestas SQL sinteticas interceptadas, sin escrituras municipales. Se comprobaron carga diferida, filtros, paginacion, enlace versionado, escritorio, 320/390 px, fallos de servicio, respuesta malformada, vacio real y revocacion. Se inspecciono visualmente la captura movil.

## Limites y continuidad

La propuesta inicial de tareas con fecha, estado e historial quedo fuera de esta entrega: su contrato de escritura no pudo completarse. La migracion 077 de ese borrador NO fue aplicada ni se publica. Esta pantalla es revision documental, no agenda, sistema de notificaciones o seguimiento persistido.

No se cambiaron conexiones productivas, planes, relojes, legajos ni liquidaciones. El candidato de septiembre, la separacion historica y el corte hacia la copia PostgreSQL 18 siguen siendo tareas distintas pendientes. La funcion 078 tambien esta en la copia para no perderla en ese futuro cambio.

La publicacion se efectua mediante un solo commit y despliegue. El estado final y los bytes publicados se comprueban por separado; una compilacion local no equivale a un despliegue confirmado. No se incluyen respaldos, SQL de datos municipales ni credenciales en Git.

Referencias tecnicas primarias consultadas: https://www.postgresql.org/docs/18/sql-createfunction.html y https://www.postgresql.org/docs/18/ddl-rowsecurity.html. El estado de implementacion procede de las lecturas y pruebas del proyecto, no de esas referencias generales.
