# Cierre de restauracion PostgreSQL 18 - 18/09/2026 Mendoza

## Fase terminada y limite del cierre

Se completo la fase post-data de la copia aislada `municontrol-junin-prod`, proyecto `wild-cake-87689498`, rama `br-plain-dawn-ac8crb1h`. El proceso pg_restore finalizo con codigo 0 en una sola transaccion. Esto cierra la restauracion pendiente; NO significa que se haya cambiado la base que atiende produccion.

Se mantuvo el archivo fuente SHA-256 `1a74440c4e6a06166b354187cf710aac11e71733bb48836d14aceeca0f69d7fa`. La lista revisada conserva los 310 objetos ACL de la aplicacion y omite unicamente volver a ejecutar dos DEFAULT ACL de cloud_admin, previamente comprobados identicos en ambos proyectos. No se uso --no-acl ni se ampliaron privilegios del proveedor.

## Estructura restaurada

- 145 tablas, 346 indices y cero indices invalidos.
- 411 claves foraneas y 131 disparadores de usuario.
- 116 permisos de ejecucion para el rol aplicativo, igual que el origen.
- 2.704 restricciones en el destino: la diferencia frente a las 1.298 del origen se debe al registro de NOT NULL como restricciones de tipo n en PostgreSQL 18. Las restricciones de los tipos preexistentes se compararon por identidad y propiedades.

Se conserva la restriccion CHECK `platform_user_role_revocation_actor_ck` como NOT VALID, exactamente como estaba en el origen. No se modifica ni se declara saneado ese antecedente durante esta migracion.

## Comparacion de permisos y vistas

Se compararon 4.305 entradas del catalogo: relaciones, columnas, restricciones preexistentes, disparadores y propiedades de funciones propias. Se incluyeron propietarios, ACL, opciones de RLS, nulabilidad, tipos y propiedades relevantes. No es una afirmacion de que se haya comparado todo campo posible del catalogo PostgreSQL.

Se normalizaron las ACL implicitas con acldefault y exclusivamente el search_path documentado de las dos funciones de identidad ya reparadas. Se detectaron ocho secuencias cuyo permiso efectivo del propietario diferia y se repusieron SELECT, UPDATE y USAGE exclusivamente a neondb_owner, conforme al origen. La comparacion posterior dio cero diferencias en las 4.305 entradas consideradas.

Se ejecutaron las 13 vistas en origen y destino mediante COPY TO STDOUT, dentro de transacciones de solo lectura. Los conteos y huellas multiconjunto de sus resultados coincidieron. Las diferencias de representacion revisadas muestran conversiones de arrays varchar a text realizadas por elemento en PostgreSQL 18; no se cambiaron las consultas de la aplicacion.

La comprobacion de las 145 tablas del origen contra el respaldo no detecto cambios de contenido en ese control. Esto no congela futuras escrituras: un corte real todavia necesita un ultimo diferencial y una ventana controlada.

## Verificacion final de datos despues de post-data

Se volvio a leer el destino despues de restaurar indices, restricciones, disparadores y permisos. Resultado: 145 tablas, 890.649 registros y 14 secuencias comparados contra la evidencia del archivo; cero diferencias. La comprobacion sigue usando SHA-256 por fila COPY y una huella multiconjunto por tabla, preservando duplicados e independencia del orden fisico.

Las 13 vistas y las 4.305 entradas del catalogo tambien quedaron sin diferencias en los controles descritos. Los resultados detallados se conservaron en el directorio privado de la copia. No se publicaron filas, contrasenas, tokens ni archivos SQL con informacion municipal.

## Pase productivo no realizado

El intento de habilitar una credencial nueva para el rol aplicativo del destino fue bloqueado por los controles de la herramienta, incluido un reintento identico. La consulta de Neon confirmo que el rol sigue como no_login. No se cambio a usar el propietario como sustituto del rol restringido.

Por lo tanto, NO se modificaron las variables de conexion productivas, NO se congelo ni altero la base origen y NO se conecto la aplicacion a la nueva base. El despliegue del registro tecnico de esta fase no debe confundirse con un cambio de base.

Para el corte restante se necesita: habilitacion segura y prueba del rol aplicativo; resolver sin ambiguedades las variables DATABASE_URL/ACTIONS_DATABASE_URL por entorno; prueba autenticada; sincronizacion final o congelamiento controlado del origen; cambio de trafico y comprobacion posterior. Si hubiera escrituras en el destino tras ese cambio, una recuperacion no puede limitarse a volver a apuntar a la base anterior.

El origen y la copia siguen con el nucleo GRH publicado del 06/08/2026 y con las operaciones nativas capturadas. El candidato del 10/09/2026 y la separacion por gestiones NO fueron activados en este cierre. No se modificaron planes o cuotas ni se eliminaron datos.

Referencia del mecanismo: https://www.postgresql.org/docs/18/app-pgrestore.html (seccion post-data, lista de objetos y transaccion unica). La fase tecnica aqui terminada es restauracion mas verificacion; no se declara terminada la migracion productiva.
