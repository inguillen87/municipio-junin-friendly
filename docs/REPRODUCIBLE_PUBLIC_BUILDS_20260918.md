# Paridad de compilación local y productiva

## Defecto cerrado en el build

Las diferencias de hash registradas desde el incremento jurídico 0d9df86 no se debían necesariamente a un cambio de código entre Windows y Linux. Los worktrees locales comparten node_modules mediante una junction. La resolución predeterminada de esbuild seguía esa junction hasta la carpeta física hermana, incorporando identidades de módulo exteriores al checkout.

El diagnóstico sobre el mismo código produjo:
- Resolución física: legal-registry-2KA6MOSD.js, diez entradas fuera del checkout y bytes diferentes a producción.
- Resolución preservando el enlace del checkout: legal-registry-KXTFVDEO.js, cero entradas exteriores y coincidencia exacta con el archivo productivo.

El ajuste compartido se aplica a Registro Normativo, Parámetros salariales, Catálogo de reportes y Reglas de licencias. No modifica el código de sus pantallas, límites de tamaño, versiones de paquetes, contratos de API o reglas funcionales. Mantiene minificación, nombres por hash, ausencia de source maps y avisos de licencia.

## Cotejo real antes de publicar

El 18/09/2026 a las 06:13:50 UTC se compararon desde el worktree Windows los cuatro módulos y sus archivos consumidores con las rutas públicas canónicas. Los ocho recursos coincidieron byte por byte. No se normalizaron ni sustituyeron hashes para conseguir la coincidencia.

| Módulo | Archivo público | Bytes |
| --- | --- | ---: |
| Registro normativo | legal-registry-KXTFVDEO.js | 279311 |
| Parámetros salariales | payroll-parameters-VAWC4BK3.js | 254891 |
| Catálogo de reportes | report-catalog-7KK7VWVI.js | 205546 |
| Reglas de licencias | leave-rules-WIICJ2WH.js | 202065 |

El verificador nuevo consulta únicamente assets públicos de MuniControl: no usa sesiones, cookies, API privadas, documentos ni registros municipales. La paridad demuestra equivalencia del build, no la aprobación de cálculos, contratos o permisos de una sesión real.

## Regresión permanente

Una prueba crea dos árboles temporales sintéticos con los mismos módulos: dependencia directa y dependencia enlazada. Comprueba igualdad de bytes, nombres y avisos, y reproduce como control la fuga de identidad hacia la ruta física cuando no se aplica el ajuste. Otra prueba exige la misma configuración en las cuatro compilaciones.

El workflow existente reutiliza instalación y build: ejecuta esa regresión y el cotejo de los cuatro módulos junto a sus verificaciones productivas actuales. No se agregan previews, paquetes o un workflow independiente.

## Límites y pendientes de la intervención

La corrección del orden de respuestas de la bandeja fue intentada primero. La herramienta bloqueó la escritura de su controlador auxiliar; no se integró, ni se cambió de canal para aplicarla. El código del Centro de acciones permanece intacto. No se afirma que la carrera de consultas esté resuelta por este ajuste de compilación.

También se revisó la prueba heredada de jornadas que asumía el modo histórico predeterminado. Su actualización parcial no pasó y una ejecución de diagnóstico fue bloqueada. No forma parte de este commit y no se cuenta como aprobada. La compatibilidad real debe cerrarse contra los DTO actuales; no eliminar la comprobación fallida ni reemplazarla por un pase aparente.

No se aplicaron SQL, cambios de cuentas, cálculos, bajas de empleados, firmas o movimientos de relojes. Septiembre y el ciclo de legajos conservan la prioridad funcional registrada; expedientes y obligaciones de Mariano mantienen su seguimiento. Esta entrega cierra un defecto real de reproducción/verificación del release, no otra pantalla ni esos módulos pendientes.

Referencia técnica: documentación oficial de esbuild, API / Path resolution / Preserve symlinks. El ajuste conserva la identidad por la ruta del enlace; múltiples enlaces independientes a una misma dependencia requieren revisar que no se duplique el módulo. Los cuatro builds probados utilizan una sola ruta node_modules del checkout.
