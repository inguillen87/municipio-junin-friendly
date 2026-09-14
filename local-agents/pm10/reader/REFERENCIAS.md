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
