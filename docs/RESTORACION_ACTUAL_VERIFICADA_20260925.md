# D1.4 · recuperación comprobada de la base actual

## Referencia y alcance

Se continúa desde `ecf11c3e7ce9fddd49f53a8b2c2c34c4484eba44`, contrastado con GitHub master y el alias real de producción antes de retomar el trabajo. El cargador transaccional del paquete sucesor ya publicado permanece sin cambios. Este incremento verifica la recuperabilidad de la base operativa; no selecciona el respaldo de GRH del 22/09.

El 25/09/2026 a las 02:05:53 UTC terminó la captura privada de un archivo custom de PostgreSQL 17.11: **77.856.985 bytes**, SHA-256 `762d5a5f350849814b7a97400eea47bed71317e903312b2c407152e68a644fa2`. El dump y las huellas de las tablas se obtuvieron del mismo snapshot exportado, en una transacción REPEATABLE READ de sólo lectura. No se volcaron filas municipales a GitHub, CI ni al frontend.

## Restauración real

Se restauraron las secciones pre-data, data y post-data con salida de error estricta en una instancia PostgreSQL 17 aislada, accesible sólo por loopback. Se cotejaron:

| Objetos | Resultado |
| --- | --- |
| 176 tablas | Conteos y huellas SHA-256 de todas sus filas coinciden con el snapshot. |
| 447 funciones/procedimientos | Definiciones y propietarios cotejados; dos configuraciones locales de restauración identificadas por separado. |
| 28 vistas | Definiciones cotejadas. |
| 431 índices | Definiciones, validez y estado cotejados. |
| 14 secuencias | Valores restaurados verificados dentro de los límites observados al capturar el archivo. |

Se incluyen las tablas públicas y los tres esquemas privados de respaldo de migraciones. La huella de tabla contiene columnas, defaults, restricciones, índices, triggers, políticas RLS, propietario y ACL a nivel tabla. No se certifica la reproducción del plano administrativo de Neon, contraseñas de conexión, permisos globales, conexiones de la aplicación ni almacenamiento externo de documentos. Los roles locales se crearon sin acceso de red habilitado salvo el administrador efímero del ensayo.

## Diferencias controladas, no ocultadas

La carga de `person_identity` necesita la corrección ya existente 075 porque una validación utiliza una función sin esquema durante la restauración. Se aplicó **únicamente en la copia local** y se comprobó que permanecen el cuerpo, propietario y permisos de las dos funciones. No se declara instalada 075 en producción.

La comparación textual detectó **92 objetos** cuya representación SQL reconstruida difiere aunque preserve la operación. El verificador conserva las huellas originales y acepta exclusivamente dos transformaciones comprobadas: arrays de constantes varchar sin límite convertidos a text, y reagrupación de operandos parentizados del mismo AND/OR conservando su orden. No elimina casts generales, tipados con longitud, operadores mixtos, literales, comentarios, restricciones ni permisos. Cualquier otra diferencia bloquea la comprobación.

La evidencia suplementaria vuelve a leer las definiciones y exige que su huella cruda coincida con la capturada antes de comparar. No sustituye una fuente cambiada por otra más conveniente. El resultado final tiene cero discrepancias pendientes y registra `rawDefinitionsIdentical=false`: no se presenta una igualdad de bytes inexistente.

## Capacidad: condición independiente

La lectura previa midió 477.224.960 bytes en la base y 500.154.368 bytes sumando todas las bases del clúster. Con el techo de seguridad configurado en el cargador (512 MiB), reserva de 16 MiB y crecimiento previsto de 24 MiB, quedan 19.939.328 bytes utilizables: **no alcanza el margen exigido**. Es una evaluación del presupuesto configurado, no una certificación del plan comercial contratado con Neon.

La base restaurada ocupa 458.102.451 bytes. Esa diferencia física no es ahorro obtenido en producción: reconstruir índices y restaurar tienen distribuciones distintas. No se ejecutó compactación, eliminación de históricos, cambio de cuotas ni instalación del staging en Neon.

## Código y aceptación

Se incorporan los módulos `grh-restoration-proof`, `grh-restoration-definitions` y `grh-restoration-expression`. La utilidad `verify-grh-restoration.mjs` compara archivos de evidencia privados y el respaldo original: exige rutas absolutas, tamaños acotados, huellas, vínculo explícito entre archivo y snapshot, y autorización explícita de la reparación local. No contiene una conexión a base ni una operación de publicación.

Se añadieron **85 pruebas** de diferencias de filas/objetos, destinos equivocados, corrupción, límites, casts y lógica ternaria, protección de cadenas/comentarios, cancelación y evidencias mezcladas. El ensayo SQL comprueba ocho condiciones usando TRUE/FALSE/NULL, caracteres escapados y Unicode, orden de filas y detección de cambios; sólo usa datos sintéticos y termina con ROLLBACK. Aprobó en PostgreSQL 17 local. El CI lo repite en su matriz 17/18, cuyo resultado debe acreditarse por el commit publicado.

Los scripts privados de captura y restauración no se publican con credenciales ni identificadores de sesión. El archivo municipal permanece en su carpeta privada con ACL restringida. La evidencia pública de entrega contiene sólo totales y huellas.

Comandos reproducibles de regresión: `node --test tests/grh-restoration-*.test.js`, `npm run build` y `node scripts/verify-grh-restoration-postgres.mjs --expected-major=17 --write-sql=verification/restoration-expression.sql`. La utilidad offline requiere `--source-image`, `--restored-image`, `--backup-receipt`, `--archive`, `--expect-archive-sha256` y, cuando corresponda, las dos evidencias de definiciones y `--allow-identity-repair`.

## Criterio cerrado y pendientes

Se cierra la captura consistente y el cotejo de una restauración real de la base actual. No se declara cerrado un ensayo de recuperación del servicio completo ni aplicada la sucesión de GRH. Siguen pendientes capacidad gobernada, preservación/revisión de dependencias nativas, ensayo del staging con este estado, selección explícita y validación posterior de consumidores. Relojes, reglas, novedades, recibos firmados y aceptación de Noelia/Hugo mantienen sus cierres específicos. El expediente de proveedores continúa diferido hasta G-AUT-01.

Referencias técnicas: PostgreSQL 17, `pg_dump`, `pg_restore`, §9.27 (las funciones pg_get_* reconstruyen SQL; no devuelven necesariamente el texto original) y §9.1 (lógica ternaria). Son contexto técnico del verificador, no requisitos atribuidos a los documentos de Noelia.

## Cierre local de la entrega

`npm run build` terminó con 5.238 pruebas aprobadas, cero fallos y dos omitidas. La comparación offline volvió a verificar los bytes del archivo, su relación con el snapshot y ambas evidencias de definiciones: coincidencia completa bajo el alcance declarado. Los 14 valores de secuencia se acreditan con la ejecución local separada, no con la utilidad offline.

La nueva lectura de capacidad de las 02:48:29 UTC confirma el margen de 19.939.328 bytes y que el esquema de staging sigue sin instalar. La copia local de PostgreSQL se detuvo y eliminó después de verificarla, preservando el archivo original y todas las evidencias. Eso libera espacio del equipo, no de Neon. No se declara una copia fuera del equipo de este archivo recién capturado.
