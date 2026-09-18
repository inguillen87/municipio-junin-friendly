# Conectividad municipal: diagnóstico por punto y solicitud para Cómputos

## Evidencia directa de este turno

El 18/09/2026 se consultaron la configuración IPv4 y las rutas elegidas por Windows en la PC autorizada. La VPN estaba activa. Se compararon trece direcciones de la foto municipal y la confirmación de PM-14 con la ruta seleccionada. No se escaneó una subred ni se enviaron comandos de marcación, huella o administración a ningún equipo.

Ocho destinos tenían ruta por la interfaz del túnel. Se intentó una conexión TCP al puerto informado 4370 por cada uno, limitada a 3.500 ms, sin intercambio de comandos del protocolo. Seis respondieron: **PM-02, PM-03, PM-05, PM-06, PM-10 y PM-14**. Dos agotaron la espera: **PM-01 y PM-09**. Un puerto abierto no prueba identidad/serie del equipo, clave de comunicación, lectura de marcaciones ni recepción de la plataforma. Un timeout no identifica por sí solo equipo apagado o firewall.

Cinco destinos eligieron la ruta por defecto del Wi-Fi en vez del túnel: **PM-04 Barriales, PM-07 Parque Dueño del Sol, PM-08 Planta de Reciclado, PM-11 Galpón Parque y PM-12 Philipps**. No se probaron sus puertos por esa ruta externa. Este es un bloqueo concreto en el cliente, no una conjetura por la distancia rural. Después de corregir las rutas puede haber además filtros, falta de ruta de retorno o ausencia de enlace entre sedes.

**PM-13 Medrano:** no consta dirección en el inventario aportado. No significa que el equipo no tenga una IP configurada; falta ese dato.

## Entregable operativo

`report-clock-network.mjs` convierte una evidencia explícita y acotada en una solicitud privada de conectividad. Se ejecutó sobre el resultado real y produjo el resumen 6 accesibles por TCP / 2 sin respuesta TCP / 5 fuera del túnel / 1 sin dirección. El generador no realiza conexiones ni altera rutas. Comprueba PM/direcciones únicos, correspondencia del destino con el prefijo, interfaz/siguiente salto del túnel y que no se presenten como ensayos VPN conexiones hechas por otra interfaz.

La solicitud contiene los destinos /32 afectados para que Cómputos confirme redes, máscaras, VLAN, gateway, retorno y reglas mínimas. **No infiere un /24 remoto a partir de unos pocos equipos**, ni solicita un reenvío de puertos público al reloj. La evidencia completa, los endpoints y la solicitud están en la carpeta privada local de MuniControl, no en este repositorio ni en la web.

El código diferencia RFC1918 del resto de IPv4: no todo el bloque 172 es privado. La utilización interna de direcciones públicas requiere revisión de Cómputos, no una renumeración unilateral. Si una sede tiene conexión independiente, se propone túnel intersede o agente local que envíe por HTTPS con cola y acuse; no exponer el lector en Internet. Una IP pública se evalúa, cuando corresponda, para el router/concentrador VPN, no para el reloj.

## Producto y límites

PM-14 Edificio Nuevo ya está en master en `4d3c1f3eae5ecedd86e1547b226d7beb0b36f00d`; Vercel informó éxito. El destino TCP de PM-14 respondió por la VPN durante la prueba. Esto no equivale a haber completado su inscripción serie/punto/conector o la sincronización de sus marcas. PM-10 no cede ni duplica acuses a PM-14.

Se inició un nuevo registro de seguimientos jurídicos con revisión de cambios. La herramienta bloqueó la escritura de su verificador de respuestas; el borrador incompleto se retiró a una carpeta privada y no se integró a la UI, API ni base. No hay migración 076 aplicada ni pantalla de expedientes publicada en este turno. No se concedieron permisos o reasignaron funcionarios.

La consulta de Neon de las 13:21:19 UTC mantiene GRH del 06/08/2026, importación 3, y 516.980.736 B en el conjunto de bases. La actualización del 10/09 sigue pendiente de capacidad, recuperación y promoción coherente, conservando datos nativos. El diagnóstico de redes no modifica liquidaciones ni produce una actualización de fuente.

## Cierre verificable

El cotejo de producción de PM-14 finalizó a las 13:34:46 UTC: los seis assets del mapa/flota coincidieron con el release 4d3c1f3, la consulta anónima devolvió 401, el intento de sustituir municipio devolvió 400 y los endpoints de recepción rechazaron GET con 405. Ese control no utiliza una sesión municipal ni escribe marcas.

La herramienta de informe y sus trece comprobaciones nuevas aprobaron; la regresión completa terminó con 3.663 pruebas aprobadas, cero fallos, y compilación correcta. El nuevo utilitario no se integra como un estado permanente del dashboard: informa el corte de evidencia que se le pasa, no conectividad en vivo. No genera alertas, no crea una VPN ni corrige rutas.

Fuentes técnicas primarias:
- https://www.rfc-editor.org/info/rfc1918/
- https://learn.microsoft.com/en-us/windows/security/operating-system-security/network-security/vpn/vpn-routing
- https://openvpn.net/community-docs/setting-up-routing.html
- https://www.rfc-editor.org/rfc/rfc6598.html
