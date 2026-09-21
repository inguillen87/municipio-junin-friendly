# Envio multirreloj y traslado al host municipal

## Alcance de esta entrega

Se agrega el envio de las colas existentes de Compras, Galpon, La Colonia, Polideportivo La Colonia y Edificio Nuevo. Cada equipo conserva serie, conector, credencial, cola, reintentos y acuses independientes. El lector y receptor PM10 mantienen sus contratos existentes.

El remitente lee `clock-local-batch.v1` sin convertir ni borrar originales. Envia `zk40-delivery.v1` al receptor existente, hasta cuatro partes de 500 registros por equipo y ciclo. Una respuesta solo confirma entrega si contiene el acuse completo del equipo y sus hashes/cantidades coinciden; el acuse se guarda antes de publicar exito. El reenvio tras una respuesta perdida usa la misma identidad de parte.

Las fallas de autorizacion, identidad o integridad detienen ese equipo para revision. Los errores transitorios usan espera persistida. Reiniciar el servicio no libera bloqueos. Las marcaciones recibidas mantienen la revision administrativa pendiente; no liquidan ni aprueban asistencia.

## Evidencia recuperada el 21/09/2026

La VPN municipal y el transporte SSH del servidor respondieron; la clave publica del host coincide con la registrada. No se obtuvo una sesion administrativa autenticada ni se determino el sistema operativo. La VPN por si sola no permite instalar software.

Los cinco lectores adicionales y PM10 siguen ejecutandose en la PC actual. No se detuvieron ni se trasladaron durante la preparacion. A las 22:54 UTC, una validacion local de solo lectura comprobo 299 lotes y 78.871 registros unicos de los cinco equipos, con identidad y hashes coherentes. Esa validacion no envio datos ni modifico colas. La evidencia detallada queda en la carpeta privada de verificacion; los registros nominales no se incluyen en Git ni en el paquete.

La instalacion municipal y la automatizacion con la PC personal apagada siguen pendientes. No se modifican planes, conexiones, configuracion de relojes ni servicios GRH. No se crean registros municipales de prueba.

## Paquete verificable

Desde el commit que haya pasado CI:

```text
node scripts/build-municipal-clock-release.mjs --output verification/municipal-clock-release
node scripts/verify-municipal-clock-release.mjs <ruta-absoluta-del-paquete>
```

El paquete contiene codigo, instaladores, licencia y documentacion mediante una lista explicita. Excluye configuraciones, secretos, colas y binarios de Node. El manifiesto identifica el commit, si habia cambios locales y la huella de cada archivo. No sobrescribe un destino existente. Los instaladores rechazan paquetes construidos con cambios locales pendientes.

Comparar el commit y la huella con el artefacto de CI antes de ejecutar en el municipio. Las huellas acreditan igualdad de archivos; no sustituyen la procedencia del paquete. Preparar el runtime firmado/verificado adecuado al sistema operativo real.

## Secuencia de activacion

1. Comprobar sistema operativo, espacio, permisos y cuenta tecnica del host mediante el acceso administrativo habilitado por Computos.
2. Inscribir solo las identidades reales comprobadas y asignar credenciales independientes. Verificar previamente la capacidad disponible en Neon para los historicos; el limite por ciclo no garantiza espacio total.
3. Preparar el paquete y configuracion privada en el destino, inicialmente deshabilitado. Ejecutar la comprobacion bajo la cuenta de servicio.
4. Detener ordenadamente el origen antes de transferir colas completas, acuses y estados con sus hashes. No trasladar bloqueos de proceso como propiedad activa del nuevo host. Ningun bloqueo de seguridad se borra automaticamente.
5. Activar un punto, verificar captura y acuse, y comprobar una nueva marcacion real con la PC personal apagada. Ensayar reinicio, cierre de sesion, interrupcion de red y recuperacion sin duplicados antes de extender al resto.

El control detallado de Windows/Linux y la recuperacion estan en `local-agents/clock-fleet/MUNICIPAL_HOST.md`. La habilitacion de firmas digitales anunciada para el 22/09/2026 se registra por separado en DOC-01 como pendiente de evidencia.
