# Entregas agrupadas y verificación de reportes

Directiva del usuario: continuar a producción sin multiplicar previews ni ejecuciones intermedias.

## Flujo de esta entrega
Preparar y probar el lote completo; crear un único commit y una única rama `internal-*`. La regla ya existente de `vercel.json` impide previews automáticas para ese prefijo. Abrir un PR con el lote terminado, comprobar el SHA y sus controles, integrar sin force-push y verificar el dominio de producción. No cambiar políticas de otras ramas ni eliminar despliegues activos.

El workflow de reportes deja de ejecutarse por cada push de una rama de trabajo: se ejecuta por PR pertinente, push pertinente a master o petición manual. En master conserva las pruebas completas, el build, los recorridos de navegador y los controles del artefacto publicado. Reutiliza un único runner, instalación, build y Chromium; desaparece la segunda preparación del job de producción. Los PR antiguos pueden cancelarse al actualizarse; una verificación productiva iniciada no se cancela por esa política. Los demás workflows y los escáneres de seguridad no se modifican.

## Corrección de la prueba de producción
La ejecución 35047137423 verificó los bytes publicados del catálogo, pero falló al esperar que la biblioteca fuera visible. El verificador bloqueaba `friendly-data.json`, requerido por el arranque de `reportes-rrhh.html` para mostrar `reportContent`. No era evidencia de un despliegue ausente.

La prueba ahora permite ese archivo agregado público por GET exacto. Mantiene las APIs privadas interceptadas, y bloquea escrituras, credenciales en URL, otros dominios y rutas no autorizadas. El mismo código se ensaya contra el build local mediante `--local` antes de comprobar el dominio real. No se oculta el fallo forzando la visibilidad ni simulando una sesión municipal.

## Evidencia y límites
Las pruebas unitarias del nuevo contrato no requieren red ni dependencias adicionales. El workflow conserva evidencia del navegador local y productivo por separado, incluyendo el número de consultas al agregado público. No declara probados login/MFA municipales, datos nominales, relojes físicos ni operaciones de liquidación.

Reversión: revertir exclusivamente este incremento. No contiene migraciones, cambios de permisos, edición de datos municipales ni modificaciones de fórmulas.
