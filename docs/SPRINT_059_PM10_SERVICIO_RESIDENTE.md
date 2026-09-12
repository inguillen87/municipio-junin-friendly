# Sprint 059 · PM-10 residente (fase de captura local)

## Prioridad y alcance
Se retoma la automatización del reloj de Edificio Viejo. Entrega un servicio instalable
Windows/Linux, sin depender de la PC personal ni de un CMD abierto. Aún NO instala ese
servicio en el host municipal y NO conecta el flujo a Neon. No se considera terminado
el pendiente de automatización de asistencia por entregar este capturador.

## Evidencia previa (consulta 12/09/2026)
La rama consultada contiene una captura, 11.111 filas originales y 11.091 eventos
canónicos. El conector `junin-pm10-verified-snapshot`, driver `zk40-snapshot.v1`, está
suspendido y `last_accepted_at` es nulo. No cambió esa configuración en este sprint.

## Hallazgo que bloquea habilitación ciega
El agente genérico procesa archivos, no consulta hardware. El registro de drivers
operativo no incorpora `zk40-snapshot.v1`. El dashboard de PM-10 se apoya en las tablas
de captura, y la identidad del bootstrap no debe reemplazarse por un hash distinto.
Activar el conector o llamar al receptor genérico no cierra estas incompatibilidades.

## Entregado
Lector 4.1 preservado, servicio serial, captura comprimida y cifrada autenticada,
estado persistente, deduplicación por contenido, límites de disco y archivos, espera
exponencial de red, bloqueo persistente al fallar AUTH/serie/protocolo, arranque automático
opcional explícito y cuenta de servicio. Código empaquetable sin dependencias npm.
Sin mutaciones de nómina, esquema, permisos del SaaS, estado cloud ni datos del reloj.

## Siguiente cierre técnico obligatorio
1. Confirmar host municipal y ruta local; instalar en ventana coordinada y comprobar reinicio.
2. Receptor cloud autenticado y limitado a PM-10; envío incremental, acuse y reintento idempotente.
3. Compatibilidad de identidades y deduplicación con los eventos existentes, incluyendo el bootstrap.
4. Tablero sobre eventos nuevos y latencia de recepción, con heartbeat distinguido de fichada.
5. Ensayo real de corte/restauración y capacidad de almacenamiento; luego extender a otros equipos.

No se habilitan otros modelos/IP ni se toma presencia laboral o sueldo desde una captura.
## Fuentes técnicas
- Piloto 4.1 adjunto por el usuario, documentación y pruebas conservadas en el servicio.
- Node.js Crypto (`createCipheriv`, AES-GCM) y API de archivos: https://nodejs.org/api/crypto.html
- Windows ScheduledTasks: https://learn.microsoft.com/powershell/module/scheduledtasks/
- systemd.exec: https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html
