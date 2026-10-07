# Noelia · control de la fase completa antes de producción

El workflow `noelia-payroll-circuit.yml` ejecuta en PostgreSQL17 y18 el mismo circuito sintético completo que se verifica localmente: contratos propios y antecedentes adoptados, novedades completas, revisión independiente, cálculo, confirmación, anulación por legajo exacto, recálculo, comparación, cierre, jurisdicciones42/55, planillas, recibos y cotejo anual de cargos. Conserva todos los controles anteriores y ejecuta el build completo antes del navegador. No publica una Preview ni realiza operaciones municipales.

El transporte CI es explícito y requiere el contexto de GitHub Actions, el mismo workspace y el SHA revisado. Usa exclusivamente el servicio desechable `own_payroll_run_qa`, loopback, puertos55417/55418, guardas de versión/destino, esquema aleatorio y credencial sintética fija. Rechaza clientes alternativos, ajustes ambientales de PostgreSQL y cambios de host o URL por argumentos. El modo local conserva los binarios existentes del worktree; no cambia dependencias compartidas.

La prueba mantiene las transacciones reales conCOMMIT, conexiones independientes, huellas de conservación, instalaciones fallidas conrollback, permisos separados, reintentos con cuerpo/clave originales y retiro por revocación. Descarga conjuntos completos con páginas y búsquedas, verifica320/390px y conserva el histórico anterior aSQL143. Los artefactos CI son sólo resultados, pruebas de conservación y capturas sintéticas; no incluyen fuentes municipales, respaldos, SQL nominal o secretos.

## Cierre de publicación de cada sprint

1. Reconciliar rama, cambios ajenos y master; completar pruebas focales, build y circuito completo sobre el mismo conjunto de archivos.
2. Revisar el diff y exigirCI aprobado para el SHA exacto. Una corrida local aprobada no equivale aCI ejecutado.
3. Contrastar el proyecto/equipo Vercel, la entrega Production y las dos bases existentes; verificar los prerrequisitos de cada lote. ParaSQL143 publicar primero el lector compatiblev1/v2 y verificarlo; después instalar el lote compuesto conservador. No instalar el archivo143 aislado ni las variantes deQA en las bases municipales.
4. VerificarREADY, dominio `municontrol.com`, SHA y recursos servidos; después validar el recorrido autorizado con Noelia. Preview, publicación y aceptación municipal se acreditan por separado.

La autorización de Marcelo para publicar después de cada sprint está vigente. El contraste del07/10 a04:50UTC devolvió NeonUNAUTHORIZED y Vercel403 para el equipo existente. Ese punto impide instalar/publicar/verificar desde la conexión actual; no demuestra una limitación del plan gratuito ni autoriza cambiar identidad o ejecutor.

Este incremento agrega el control de integración de la fase. No declara homologadas las fórmulas municipales, resueltos OSEP/otros diseños ni aceptados los diez módulos. No modifica relojes, firmas, usuarios o pagos. Los resultados ejecutados y pendientes concretos se registran en `verification/CODEX_NOELIA_CIRCUIT_CI_RESULT_20261007.md`.

## Regresiones detectadas en la primera ejecución de CI

La primera ejecución del SHA97ccecb pasó15 workflows y falló6. Los controles de grupos fijos todavía exigían «Alta propia» donde el producto dice «Registro propio», que también comprende adopciones. Se conserva la comprobación de ambas procedencias y los diez campos. Familia y encuadre esperaban controles de una ficha que el retiro de permiso nominal o la ocultación destruyen; ahora verifican cierre, borrado completo, aborto de la respuesta retenida y reconsulta autorizada. Familia restaura la alteración sintética de procedencia después de comprobar el rechazo. La comparación histórica abre voluntariamente su apartado accesible y mantiene las pruebas de descargas, teclado y navegación.

El circuito completo en Linux detectó una descarga/reapertura de cargos sin confirmar. La limpieza anterior buscaba clientes por dirección127.0.0.1, que cambia porNAT en el contenedor. Ahora cada esquema tiene un `application_name` exclusivo de menos de63 bytes y se espera sólo a sus conexiones, sin terminar sesiones. Se cierra el navegador del circuito ya completado antes de empezar cargos, retirando sus consultas periódicas. Una falla conserva estado no nominal y tiempos/estadosHTTP de la prueba sintética. Estos cambios no aumentan los límites de espera ni omiten verificaciones;CI debe ejecutarse otra vez y acreditar el resultado.
