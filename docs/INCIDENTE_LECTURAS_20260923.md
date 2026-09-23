# Recuperación de consultas del padrón y resumen

El 23 de septiembre se observaron respuestas 504 en `internal-data` para
`summary` y `employees`. Los registros de Vercel confirmaron el límite de
20 segundos de la función. Los avisos de `contentscript.js` pertenecían a una
extensión del navegador y no explicaban esos errores del servidor.

## Corrección

- El resumen reutiliza las proyecciones efectivas de personas, ausencias,
  licencias y catálogos dentro de una sola sentencia, evitando reconstruirlas
  para cada contador y cada búsqueda de registros sin vínculo.
- El padrón construye una sola vez el directorio y obtiene en la misma consulta
  la página, el total filtrado, los indicadores generales y las facetas. Las
  filas conservan sus tipos SQL; las páginas vacías conservan sus indicadores.
- La selección del último mes cerrado limita también la fecha de los hechos
  salariales. La igualdad entre esa fecha y la corrida está garantizada por
  `validate_payroll_run_link` y por las dos ramas de la proyección 096.

Permanecen los controles de sesión, capacidades, municipio y publicación de
fuente antes y después de la lectura. No se modifican conexiones, planes,
duración máxima, datos municipales ni esquema de base de datos.

## Evidencia anterior a la publicación

Las mediciones se hicieron con transacciones de solo lectura en PG17 y sin
crear registros municipales. Son tiempos de consulta, no tiempos del navegador.

| Comprobación | Resultado |
| --- | --- |
| Totales del resumen, antes/después en la misma transacción | 3094 / 833 ms; resultado idéntico |
| Directorio combinado, página activa de 25 filas | 1128 ms; las seis salidas anteriores coinciden |
| Último mes cerrado, plan normal del candidato | 1268 ms; 25 filas |
| Búsqueda sin coincidencias, plan normal del candidato | 990 ms; cero filas y metadatos presentes |

La equivalencia completa de último mes cerrado y búsqueda vacía se contrastó
en una transacción con `enable_nestloop=off`, exclusivamente para permitir
ejecutar la referencia lenta. Esa configuración no forma parte del producto
ni de las mediciones del candidato en la tabla. También se comprobó que no
existían fechas discrepantes entre hechos físicos y corridas.

Las pruebas automatizadas cubren aislamiento y cambio de fuente, filtros,
paginación, orden, fechas, facetas, páginas vacías y datos mínimos del selector.
El workflow `Internal read recovery` ejecuta la batería completa, la construcción
y los recorridos sintéticos de Personas. El cierre del incidente exige además
CI del commit exacto, despliegue correcto y lecturas reales con sesión en el alias
de producción; una prueba sintética no acredita esa recuperación.
