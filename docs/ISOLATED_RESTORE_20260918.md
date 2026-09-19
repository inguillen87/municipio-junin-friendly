# Copia aislada PostgreSQL 18 - 18/09/2026 (Mendoza)

## Alcance y estado

Origen: proyecto Neon `noisy-poetry-54471701`, rama `br-plain-dust-acpjgebb`, PostgreSQL 17.11. Destino de ensayo: `wild-cake-87689498`, rama `br-plain-dawn-ac8crb1h`, PostgreSQL 18.6, recurso `municontrol-junin-prod`. El nombre prod no significa que atienda usuarios. No se cambiaron conexiones de Vercel ni fuentes operativas, planes o cuotas.

Se capturo de nuevo el origen completo, sin filtros de tablas ni fechas, mediante pg_dump 17.11 y sesion de solo lectura. La captura termino el 19/09/2026 a las 01:42:45 UTC (18/09 a las 22:42:45 en Mendoza). Contiene el estado publicado de GRH y los desarrollos/datos nativos presentes en esa captura; NO activa el candidato GRH de septiembre.

Archivo privado: 73.330.203 bytes; SHA-256 `1a74440c4e6a06166b354187cf710aac11e71733bb48836d14aceeca0f69d7fa`. El archivo anterior del ensayo se conservo. El indice del archivo nuevo contiene 145 definiciones de tabla, 145 secciones de datos y 312 entradas ACL/default ACL. El respaldo, SQL extraido, credenciales y evidencias con detalle permanecen fuera del repositorio.

## Restauracion realizada

La seccion pre-data termino sin errores en una transaccion. Se aplico en el destino la reparacion ya versionada `075-restore-safe-identity-functions.sql`, despues de verificar sus dos huellas esperadas. Solo fija el search_path de normalize_digits e is_valid_cuil; conserva cuerpo, propietario, permisos y propiedades. No se aplico esa reparacion al origen.

El rol `municontrol_actions_runtime_app` se creo en el destino como NOLOGIN, NOINHERIT, NOSUPERUSER y NOBYPASSRLS. No se copio ni habilito una contrasena de acceso. No es una certificacion del acceso aplicativo: el cierre de privilegios sigue pendiente.

El intento atomico de datos mas post-data se detuvo al ejecutar ALTER DEFAULT PRIVILEGES del propietario cloud_admin. Los dos defaults implicados (tablas y secuencias en public para neon_superuser) ya existen identicos en origen y destino. No se concedieron privilegios administrativos adicionales, ni se uso --no-acl. La creacion de una lista revisada que evitara repetir esas dos instrucciones fue bloqueada por la herramienta, incluido un reintento identico; esa lista NO fue creada ni utilizada.

Despues se ejecuto exclusivamente --section=data, con --single-transaction y --exit-on-error. Finalizo con codigo 0 a las 01:51:29 UTC. Esto copia los registros y valores de secuencia, pero NO completa la seccion post-data. El destino no debe conectarse a produccion: faltan finalizar/verificar indices, restricciones poscarga, disparadores y permisos.

## Definiciones revisadas

Las 315 funciones propias tienen la misma huella agregada de definicion en ambos proyectos, normalizando exclusivamente la linea search_path de las dos funciones reparadas: `87762a85e97b8d017bf1cd1beae5188bd6857ba581bd5c8cf1ebcaa131331e25`. Esto no acredita que sus ACL poscarga esten terminadas.

El destino usa pgcrypto 1.4, frente a 1.3 del origen; agrega una funcion de extension (37 frente a 36), por lo que el total de funciones pasa de 354 a 355 sin perder las propias. Hay 13 vistas; ocho coinciden textualmente al consultar pg_get_viewdef y cinco presentan diferencias de representacion que requieren revision. No se declaran equivalentes por tener el mismo nombre o el mismo numero de filas.

## Comprobacion del contenido de la copia

Se extrajo localmente la seccion de datos del archivo inmutable y se identificaron 145 bloques COPY con 890.649 registros. Para cada tabla se calculo SHA-256 de cada fila COPY completa; se ordenaron las huellas y se calculo otra SHA-256 sobre su concatenacion. El metodo conserva multiplicidades y no depende del orden fisico de las filas. Los controles sinteticos del analisis verificaron cambio de orden, duplicados y fragmentacion de registros durante la lectura.

El destino se leyo mediante COPY TO STDOUT, con las columnas explicitas del archivo, en una transaccion REPEATABLE READ y READ ONLY. Se verificaron proyecto, rama y modo de solo lectura antes de consultar. Resultado: **145 tablas comparadas, 890.649 registros, cero diferencias de cantidad o huella por tabla**. Tambien coincidieron los 14 pares last_value/is_called de las secuencias exportadas. Ningun registro individual ni credencial se imprimio o publico.

Esta comprobacion corresponde a los datos del respaldo fechado, no a todas las novedades que sigan ingresando al origen despues de la captura. Antes del corte definitivo sera obligatorio reconciliar ese diferencial, ademas del candidato GRH de septiembre y su cierre. No se certifica aqui una liquidacion nativa ni continuidad productiva despues de un cambio de conexion.

Los resultados detallados quedan en evidencia privada. El analisis fue ejecutado en una sesion local temporal; el nuevo archivo de automatizacion integral de verificacion no pudo guardarse por un bloqueo de la herramienta. No se lo presenta como un comando de migracion versionado y reutilizable.

## Pendientes que impiden el uso productivo

1. Completar post-data sin intentar modificar los dos defaults del proveedor que ya coinciden, sin omitir las ACL de la aplicacion y sin ampliar privilegios administrativos. Confirmar indices, claves, restricciones, disparadores, RLS y accesos efectivos. La lista de importacion revisada sigue sin aplicarse.
2. Revisar las cinco vistas cuya representacion difiere y probar sus resultados/circuitos. La igualdad de filas base no certifica por si sola todos los informes o permisos.
3. Integrar el candidato GRH de septiembre de forma conciliada, preservando las operaciones propias. Luego medir y separar el detalle historico conforme a los ciclos aprobados, con su archivo verificado.
4. Probar la aplicacion contra el destino, incluyendo perfiles, MFA, relojes, legajos y liquidacion paralela; preparar diferencial final y recuperacion antes de cambiar la conexion.

No se cargaron datos en `municontrol-junin-historica`, no se retiraron registros antiguos y no se ejecuto limpieza en produccion. El tamano actual del destino no representa el tamano final: todavia falta post-data. No se declara ahorro de almacenamiento ni capacidad final garantizada.

Referencia tecnica: PostgreSQL distingue las secciones pre-data, data y post-data, y permite restaurarlas separadamente; el exito de una seccion no certifica las restantes. https://www.postgresql.org/docs/18/app-pgrestore.html

## Ultima comprobacion del estado aislado

La lectura final confirma 145 tablas, 0 indices, 0 claves foraneas y 0 disparadores de usuario en el destino. Es el resultado esperado de haber completado pre-data/data, pero no post-data; constituye una condicion expresa de NO habilitacion productiva. El rol de aplicacion mantiene rolcanlogin=false y el corte GRH publicado sigue en 06/08/2026.

Esta entrega versiona solo el registro tecnico de la ejecucion. No agrega codigo de aplicacion ni presenta pruebas unitarias anteriores como certificacion nueva: la evidencia nueva es la restauracion por fases y la comparacion real del contenido y secuencias de las 145 tablas. No se publico una interfaz nueva.
