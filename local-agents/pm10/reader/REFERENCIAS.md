# Referencias de implementacion

- Codigo de partida: paquete `MuniControl_v4_Lectura_Fichadas_Edificio_Viejo.zip`.
- Archivo municipal analizado: `2026-09-10T14-46-33-890Z-de2732.zip`.
- AUTH y formatos de registro: fananimi/pyzk, commit
  `f29709c17bb8f1bbb5382d2670b493207cb35ff1`, `zk/base.py`.
  https://github.com/fananimi/pyzk/blob/f29709c17bb8f1bbb5382d2670b493207cb35ff1/zk/base.py
- Operaciones y secuencia de datos: Alexander Marin, zk-protocol.
  https://github.com/adrobinoga/zk-protocol/blob/abe68e85f3a0acfc53d27720af29edf79102e6e8/sections/ex_data.md
  https://github.com/adrobinoga/zk-protocol/blob/abe68e85f3a0acfc53d27720af29edf79102e6e8/protocol.md

Son referencias comunitarias de implementacion, no garantia del fabricante.
La ultima declara haber analizado un F19: no debe extrapolarse como homologacion
a todos los firmwares del K20. Describe PREPARE_DATA -> DATA -> ACK y la diferencia
de secuencia de reply en transferencias. NO demuestra que la unidad municipal
haya enviado session=0; el informe v4 no registro ese campo.

La compatibilidad neutra en DATA es una hipotesis restringida y probada localmente.
Toda otra sesion no coincidente permanece bloqueada con diagnostico detallado.

No se ha reutilizado codigo de administracion de usuarios, huellas, borrado o
deshabilitacion. Se preserva la licencia GPL-2.0-only del piloto de partida.

## Diagnostico aditivo 4.1.1 (14/09/2026)

La revision 4.1.1 conserva el codigo exacto de error de limpieza en
`report.cleanup.errorCode`. Permite distinguir `CANCELLED` de un cierre TCP
previo durante la espera de EXIT. No cambia comandos, autenticacion, destinos,
secuencias, pausas, lectura, validacion ni bytes de captura. El original 4.1.0
permanece en la historia Git y en el paquete fuente privado aportado.

## Inspección explícita de metadatos (4.1.2)

`readDeviceMetadata` permite consultar la serie esperada, firmware (comando 1100) y `~DeviceName` (lectura de opción 11) sin preparar ni leer el búfer de asistencia. Se mantiene la autorización del destino, el control de checksum/sesión y el cierre de la conexión. La lista de opciones no admite escritura de configuración, claves, usuarios, plantillas ni reinicio.

La inspección es una operación puntual de enrolamiento, no se agrega a cada lectura programada. Una clave rechazada no genera búsqueda de claves. Si el modelo no responde, el resultado permanece incompleto; no se sustituye por un nombre tomado de otra sede. La publicación del código no modifica los programas instalados ni cambia el endpoint de recepción de PM-10.

Referencia técnica de las lecturas de versión/nombre: implementación y documentación primaria del proyecto pyzk, https://github.com/fananimi/pyzk . El colector utiliza su propio transporte limitado y no instala ni ejecuta los métodos administrativos de esa biblioteca.

## Captura entre dos contadores crecientes (4.1.3)

Una transferencia completa puede fijar su búfer después del primer contador y antes del segundo mientras se registran nuevas fichadas. La cantidad recibida entonces no tiene por qué ser igual a ninguno de esos extremos. El decoder conserva la selección exacta anterior y agrega un caso restringido: ningún tamaño compatible con un extremo, ambos contadores enteros entre 0 y 100000, segundo mayor que el primero, y una sola división entera plausible entre 8, 16 y 40 bytes dentro del intervalo abierto. Ese único tamaño debe ser 40 y todas las fechas civiles de sus registros deben ser válidas. Un tamaño ambiguo, contador faltante/fuera de rango/decreciente o fecha inválida no habilita este caso.

La evidencia adicional queda en `parse.countEvidence`, con `completeCoverageAsserted:false`. No modifica bytes, orden, identidades originales ni deduplicación; no decide DNI, entrada/salida, asistencia o salario. Los controles de cabecera, longitud interna, autenticación, serie, checksum, fragmentos, acuses, liberación y EXIT siguen vigentes. Si hay una fecha inválida se anula también `layout`, porque el guard de persistencia usa ese campo para impedir guardar una interpretación no confirmada.

Prueba sintética reproducible: cuerpo de 514760 bytes (12869 registros), cabecera de 4 bytes y transferencia total de 514764, con conteos 12868 y 12870. La prueba de protocolo usa solamente loopback y comprueba persistencia exacta/replay en una cola temporal. Esto demuestra el comportamiento del software, no una captura física del reloj afectado. Los contadores de los extremos no prueban cobertura completa ni descartan cambios internos no observados; se conserva una captura candidata. No se reactivan bloqueos ni instalaciones anteriores automáticamente.
