# 059.1.1 · Preflight y pausa sin ruta municipal

## Petición y decisión
El propietario pidió instalar autónomamente el colector sin interferir con otros sistemas. No se confundió una dirección libre con un host utilizable. Se conserva como primera opción la dirección actual de un equipo municipal asignado; para VM nueva, DHCP/reserva municipal tras revisar sus asignaciones. No se seleccionó una IP mediante ping ni escaneo.

## Acceso efectivo durante este trabajo
Se leyó master b21e3722 y se contrastó el código del paquete entregado. El entorno de ejecución de este chat sólo tenía ruta por defecto para 172.100.97.131; no tenía la ruta municipal/VPN. La búsqueda del conector de terminal encontró Remote Desktop Commander pero su sugerencia no pudo habilitarse en este espacio. No se abrió una sesión de terminal municipal ni se consultó el DHCP real. No se mandaron paquetes a la dirección del reloj por Internet.

## Mejora implementada
- Chequeo local de ruta antes de los cambios del instalador y antes de cada captura.
- Se exige prefijo seleccionado /19 municipal o más específico para PM-10; rechazo de ruta por defecto, ruta amplia y respuestas ambiguas.
- Si falta la ruta: network_wait, espera local sin leer clave ni consultar el reloj. Recuperación al regresar una ruta aceptada, sin levantar bloqueos previos de autenticación.
- Estado local explica conectividad pendiente y conserva el último dato capturado; no crea ausencias ni horas.
- Protocolo v4.1, identidades, cola y deduplicación permanecen sin cambios. No hay comandos para modificar el reloj, la red o GRH.

La comprobación no garantiza el enrutamiento durante una captura ya iniciada: se debe validar la restricción de salida por interfaz en el host municipal. No se configura ese firewall sin conocer el host y su topología.

## Pruebas y evidencia
Pruebas de decisión por prefijo, respuestas Windows/Linux, parámetros acotados del comando local, ausencia de lecturas de claves/sockets sin ruta, espera de más de seis ciclos sin contacto, recuperación y conservación del bloqueo por clave rechazada. Regresiones de protocolo y cola usan exclusivamente simulador de loopback. La comprobación real del entorno rechazó su ruta por defecto sin contactar el reloj.

## No completado por este incremento
059.2 sigue pendiente: receptor incremental, identidad compatible con la captura inicial, acuses y dashboard continuo. 059.3 sigue pendiente: host municipal asignado, acceso administrativo operativo, instalación y fichada física nueva con la computadora personal apagada. No se dio por instalado ni conectado el agente en Neon.

## Referencias técnicas
Consultadas 13/09/2026:
- Microsoft Find-NetRoute: https://learn.microsoft.com/en-us/powershell/module/nettcpip/find-netroute
- iproute2, ip route get fibmatch (no envía paquetes): https://manpages.debian.org/bookworm/iproute2/ip-route.8.en.html
- IANA, rangos privados: https://www.iana.org/help/private-addresses
- Microsoft, reservas y exclusiones DHCP: https://learn.microsoft.com/en-us/windows-server/networking/technologies/dhcp/dhcp-scopes
