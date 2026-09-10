# Relojes y Asistencia: acceso de preview y puerta de salida a producción

Fecha: 2026-09-10. Estado: diagnóstico y pruebas; NO certifica despliegue productivo de PM-10.

## Evidencia del incidente

La captura del operador muestra un HTTP 403 en `/api/internal-identity`, dentro de un dominio de preview. No incluye el cuerpo JSON de esa respuesta. Por sí sola no acredita contraseña incorrecta, correo no configurado ni un fallo de entrega MFA.

En `api/internal-identity.js`, los POST pasan primero por `assertSameOrigin`. El origen esperado es `IDENTITY_APP_ORIGIN`, luego `INTERNAL_APP_ORIGIN`, y finalmente `https://${VERCEL_URL}`. Una diferencia produce `IDENTITY_ORIGIN_FORBIDDEN` (403) ANTES de leer la cuenta, abrir la base o solicitar MFA. Esto es una hipótesis reproducida localmente, no una confirmación de la configuración remota.

El alias de rama y el hostname de una ejecución de Vercel pueden ser distintos. La guardia actual no autoriza automáticamente todos los aliases. También existe `IDENTITY_CONTEXT_FORBIDDEN`; se necesita el código concreto para distinguir la causa. `login.html` actualmente transforma los errores de origen en un mensaje genérico. No debe recomendarse cambiar la contraseña basándose sólo en 403.

## Verificación agregada

`tests/internal-identity-preview-origin.test.js` agrega diez casos de aislamiento de origen. Las solicitudes contienen JSON inválido deliberadamente y nunca contraseñas reales. Todos los casos verifican cero acceso a base, cero correo y ausencia de Set-Cookie.

Comando local:

```sh
node --test tests/internal-identity-preview-origin.test.js tests/internal-identity-api.test.js tests/internal-identity-ux.test.js
```

Resultado local sobre Node 22.16.0/Linux: 59 tests, 59 aprobados, 0 fallidos. No es una prueba del correo real ni del despliegue remoto.

## Entornos y acceso de infraestructura

Los intentos del conector Vercel de consultar el proyecto y sus logs devolvieron 403 de permisos. `list_teams` devolvió una lista vacía. Es un rechazo de la conexión de administración, independiente del 403 observado por el operador dentro de MuniControl. La autorización del propietario en el chat no sustituye el alcance concedido por Vercel a esa conexión.

No se cambiaron credenciales, roles, MFA, cookies, controles de origen ni variables de producción. No se debe solucionar la prueba habilitando un wildcard `*.vercel.app`, reflejando el Host, desactivando MFA, eliminando el contrato certificado o apuntando todas las previews a la base de producción.

Para una preview operativa, configurar sólo el entorno/rama de prueba con el origen exacto autorizado, la base aislada y las credenciales de identidad/correo pertinentes. No copiar indiscriminadamente secretos productivos. Requiere un nuevo despliegue después de cambiar variables. Alternativamente, conservar el preview cerrado y hacer una prueba interna controlada antes de promover la versión validada.

## Criterios para declarar PM-10 listo para prueba productiva

- [ ] Relación registrada y auditada entre PM-10, sede, modelo y serial verificado.
- [ ] Captura completa recibida en base y reconciliada contra sus bytes/hash; observaciones conservadas.
- [ ] Vinculación de persona y contrato por fecha; no perder excepciones.
- [ ] Reenvío de la captura no duplica eventos; conciliación USB/red definida.
- [ ] Pantalla autenticada utiliza la API autorizada; sin fichadas nominales en archivos públicos.
- [ ] No confundir última captura recibida con conexión continua o cobertura laboral completa.
- [ ] Acceso de producción probado: credenciales, contexto, MFA y permisos. No reutilizar cookies de preview.
- [ ] Base efectiva, rol de runtime y contrato certificado comprobados; no adivinar por el nombre de la rama Neon.
- [ ] Migración aditiva, respaldo/rollback y suite CI aprobados antes de promoción.
- [ ] Colector en infraestructura municipal o host autorizado con ruta permanente; configuración y clave custodiadas allí, no en Git.
- [ ] Prueba con el equipo personal apagado antes de afirmar autonomía.

Hasta completar estos puntos, el estado es integración en curso. Esta entrega sólo agrega pruebas y documentación; no cambia la interfaz ni registra marcaciones en producción.
