# PM-10 · colector municipal 0.59.0

## Qué entrega y qué no

Servicio de lectura del reloj **Edificio Viejo**, IP conocida `172.100.97.131`, puerto TCP 4370, serie `CQTU225360168`. Reutiliza el lector 4.1 que ya obtuvo la captura inicial. Sólo utiliza una CommKey conocida: no busca contraseñas, no entra por Telnet y no cambia usuarios, hora, huellas, rostros ni fichadas. FREE_DATA libera el buffer de transferencia, no la memoria de marcaciones.

Lee el buffer acotado, verifica transporte y formato, guarda nuevos registros en una cola local cifrada (AES-256-GCM) y envía lotes de hasta 500 registros por HTTPS. Cada lote sólo sale de la cola después de recibir un comprobante cuyo identificador, hash y cantidades coincidan. Reiniciar después de perder una respuesta no duplica los hechos en Neon. El período nominal del ciclo es de 60 segundos después de completar la lectura; no se promete latencia exacta ni streaming continuo.

**No está instalado en el municipio por el solo hecho de publicar el repositorio.** La política cloud está deshabilitada y el conector original continúa suspendido hasta completar la instalación coordinada. No se incluyen contraseñas ni tokens en este paquete.

## Datos privados y almacenamiento

DNI está contenido en los registros binarios originales, no es una plantilla de huella. La cola contiene datos personales cifrados; el directorio, su clave y los respaldos requieren protección. Logs: versión, fecha, cantidades y códigos técnicos, sin registros ni credenciales. El registro local de hashes impide reenviar todo el buffer en cada lectura. Una sola instancia puede tomar el reloj. Límite de cola 64 MiB y de hashes 200.000; al llegar al límite no borra datos y requiere revisión. Se requiere copia independiente del directorio de estado y su clave, y espacio en Neon: antes de habilitar, comprobar cuota y retención. No se activa purga automática de marcaciones.

La sincronización genera evidencia y hechos pendientes de revisión. Sólo utiliza asociaciones de identidad vigentes que ya existen en MuniControl. Los eventos sin asociación vigente quedan pendientes de vinculación; no se resuelven por nombre. Los códigos originales se conservan. La versión 059 no homologa entrada/salida, no calcula días trabajados, no autoriza horas y no liquida sueldos.

## Lo que debe resolver Cómputos una vez

1. Designar una VM o servidor municipal siempre encendido, responsable y sistema operativo. No instalar en la computadora personal de Marcelo.
2. Dar al host ruta autorizada a **esa IP:4370 TCP**, y salida HTTPS 443 al dominio de MuniControl. No abrir 4370 ni Telnet a Internet. Coordinar un único colector; no ejecutar al mismo tiempo el programa anterior sobre el reloj.
3. Confirmar la serie y la CommKey que funcionó con 4.1. No enviar credenciales por WhatsApp, capturas o repositorios.
4. Instalar Node.js 22 compatible. Este servicio usa sólo módulos estándar de Node, sin `npm install` de la plataforma.
5. Configurar una credencial nueva del colector y su hash en el conector existente, mediante una operación autorizada; crear/habilitar su política con fecha de inicio comprobada. No conceder acceso propietario a la base ni reutilizar la contraseña personal del administrador.
6. Revisar capacidad, copia del estado cifrado y restauración. Habilitar primero un piloto observado de PM-10 y comprobar una fichada nueva antes de extender a otros equipos.

## Archivos de credenciales (fuera del código)

Tres archivos UTF-8, sin comillas ni BOM: `commkey`, `token`, `spool-key`.

- `commkey`: únicamente la clave numérica ya validada del reloj. No hay clave predeterminada.
- `token`: secreto aleatorio de al menos 32 caracteres para este conector; nunca en config.json. En la base se guarda sólo su SHA-256.
- `spool-key`: 64 caracteres hexadecimales aleatorios (32 bytes). No rotarla con lotes pendientes sin un procedimiento de migración; perderla hace imposible descifrar la cola.

No pegar los secretos como argumentos de shell. Cargarlos con un editor o gestor de secretos autorizado local. Se rechazan permisos POSIX de grupo/otros y enlaces simbólicos en archivos de credenciales. En Windows verificar ACL bajo la identidad LocalService, sin acceso de usuarios comunes.

## Linux/systemd (preferido)

Copiar este paquete conservando `services/pm10-collector` y `lib/clock-collector-contract.js` bajo `/opt/municontrol-pm10`. Código sólo modificable por administradores. Configuración `/etc/municontrol-pm10/config.json`, basada en config.example.json; revisar y cambiar `approved` a true únicamente al autorizar el piloto. Credenciales en `/etc/municontrol-pm10/`, archivos 0600 propiedad de root. `LoadCredential` los entrega al usuario dinámico en `/run/credentials/municontrol-pm10.service`.

Instalar la unidad incluida en `/etc/systemd/system/municontrol-pm10.service`. Verificar Node en `/usr/bin/node` (no depender de nvm del usuario), permisos y versión de systemd compatible con DynamicUser, StateDirectory y LoadCredential. La unidad debe revisarse en el host elegido antes de arrancar.

```sh
sudo systemd-analyze verify /etc/systemd/system/municontrol-pm10.service
sudo systemctl daemon-reload
# Sólo después de habilitar la política y credencial coordinadas:
sudo systemctl enable --now municontrol-pm10.service
sudo systemctl status municontrol-pm10.service
sudo journalctl -u municontrol-pm10.service --since '10 minutes ago'
```

## Windows (alternativa sin contraseña del operador)

Copiar la misma estructura a `C:\ProgramData\MuniControl\PM10\app`. Configurar rutas absolutas distintas de estado y credenciales bajo `C:\ProgramData\MuniControl\PM10`, y un Node instalado para la máquina (no la carpeta personal de un usuario). Preparar los tres archivos privados antes de ejecutar el instalador. Verificar que LocalService puede leer app y configuración, y escribir únicamente el estado; el código debe ser sólo lectura para LocalService.

Ejecutar `Install-PM10.ps1` desde una consola administradora indicando InstallDirectory, NodePath y ConfigPath. Registra una tarea al iniciar Windows con LocalService, sin contraseña personal y sin ventana interactiva. Se niega a sobrescribir una tarea existente y **no la inicia**. Respetar las políticas de firma de PowerShell municipales; no deshabilitar globalmente la política para instalarlo. Esta plantilla necesita la prueba de arranque en el Windows municipal concreto.

## Pausas y contingencia

Una clave rechazada, identidad de reloj distinta, respuesta incompatible o discrepancia del comprobante deja el servicio pausado con evidencia intacta. No reiniciar a ciegas para probar claves. Una interrupción transitoria conserva la cola y aumenta el intervalo de reintento hasta 15 minutos. Para reanudar tras corregir una causa, detener el servicio, conservar copia del directorio de estado y revisar el campo `blocked` con el responsable técnico; no borrar `seen` ni los pendientes. Un ciclo parcial no acredita cobertura completa.

## Aceptación de instalación (no sustituida por CI)

- Una nueva marca llega sola al monitor y queda en Neon con comprobante.
- Reiniciar el servicio: el mismo buffer no duplica eventos.
- Cortar temporalmente sólo la salida a MuniControl: se conserva la cola; al restablecer se vacía con comprobantes.
- Apagar la computadora personal de Marcelo: el host municipal sigue trabajando.
- Reloj sin lectura, servicio sin contacto y datos pendientes se distinguen en el monitor.
- Permisos/clave/serie incorrectos se rechazan sin borrar evidencia.
- Restaurar el estado cifrado y su clave en un entorno aislado.

El monitor de sincronización y las últimas 20 recepciones forman el nuevo flujo. Los gráficos históricos y el cálculo de jornadas anteriores siguen basados en la captura de 10/09: no se los presenta como actualizados en vivo. Vinculación laboral, turnos y cálculo consolidado del nuevo flujo son la fase siguiente.

## Licencias y referencias

Código de servicio/lector GPL-2.0-only; licencia completa y referencias incluidas. El lector 4.1 y su regresión provienen del paquete aportado por Marcelo, no de un firmware descargado ni modificado. Las pruebas de TCP usan exclusivamente 127.0.0.1 y DNIs sintéticos. No se distribuyen plantillas biométricas, datos nominales reales o credenciales.
