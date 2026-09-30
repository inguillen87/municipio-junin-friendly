# Importación de novedades: identidad de registros independiente del generador UUID

## Falla comprobada en la versión publicada
El lector de Formato Junín validaba contrato/persona con una expresión de UUID limitada a versiones 1–5 y una variante determinada. La base de MuniControl contiene identificadores persistidos con otra estructura interna, incluidos los derivados de huellas. La columna UUID no implica esa elección del generador. Rechazar esos identificadores antes de cotejarlos producía PAYROLL_NOVELTY_CONTRACT_DRIFT y bloqueaba el archivo completo.

La auditoría agregada de sólo lectura encontró 875 contratos activos del ámbito municipal revisado; 810 no cumplían la regla anterior del identificador de contrato y 798 no cumplían la de persona. Son conjuntos superpuestos: no se suman ni representan el número de filas de un TXT específico. No se imprimieron identificadores, DNI, nombres o importes.

Se contrastó además el 614082026.txt original (SHA-256 7df66651900b28a68ec77bbc4c78a726cefc491a358658ca1be74da33da04fb1) con el padrón efectivo al corte 30/09 01:56:09 UTC. Mediante huellas transitorias de los DNI, y conservando empresa, municipio, fuente y fechas de agosto, se obtuvieron 12 entradas, 13 contratos candidatos: 9 entradas únicas, 2 que requieren elegir contrato y 1 sin coincidencia dentro de ese ámbito. No hay conflicto entre personas distintas. Once entradas tienen candidatos que la regla de UUID anterior rechazaba. El contraste no elige contratos, no acredita permiso de una sesión personal y no guarda novedades.

## Corrección
El nuevo helper compartido payroll-record-identity.js trata la clave de registro como UUID canónico opaco: 128 bits en su representación con guiones y minúsculas, no nulo. Se aplica exclusivamente a referencias de contrato y persona y a elecciones devueltas por el lector. No renumera identidades ni las cambia para que pasen una validación.

Los identificadores de sesión, municipio/membresía, vínculos certificados e idempotencia conservan sus controles anteriores. También permanecen el ámbito SQL, las capacidades, el token de fuente e identidad, la selección expresa entre contratos, las postcondiciones transaccionales y la recuperación del mismo intento.

La etiqueta principal pasa a **Importar TXT de entidades** y el campo a **Formato del TXT**. El perfil sigue llamándose Formato Junín porque identifica un contrato de archivo. El nombre interno del adaptador/URL queda por compatibilidad; cambiar rótulos no se contabiliza como independencia arquitectónica.

## Pruebas
- 41 pruebas nuevas: incluyen todas las combinaciones de los dos nibbles antes restringidos, UUID vacíos/malformados, doce filas completas con claves almacenadas, elección entre contratos, conflicto entre personas, fuente/identidad cambiada, recibo alterado y falta de permiso.
- Antes del parche: 7 fallos reproducidos en esa suite; después: 41/41. Total focal: 164 aprobadas.
- Construcción completa: 5.950 aprobadas, cero fallos y 2 omitidas; build estático correcto.
- Navegador: 20 recorridos de pantalla y handler reales, con SQL/identidades sintéticos; incluye 12 y 60 registros con guardado completo, reintento sin duplicar y controles a 320/390 px. No son novedades municipales guardadas.

## Alcance pendiente
Este cierre elimina un bloqueo productivo concreto. No convierte por sí mismo el resolvedor en padrón operativo independiente, no amplía el escritor de 500 filas, no completa OSEP ni implementa el motor salarial. Las dependencias de fuente del padrón y el ciclo propio de cálculo continúan en la issue #37. No se aplicó una migración, no se modificaron datos, permisos, firma digital o relojes.

La ruta canónica que faltaba en #65 sigue siendo un pendiente separado; el enlace explícito .html permanece operativo. Las verificaciones de publicación de esta corrección se registran al cerrar la PR y no se confunden con la prueba canónica pendiente.
