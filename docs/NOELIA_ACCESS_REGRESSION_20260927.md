# Noelia · regresión de permisos y recuperación de formularios

## Base y alcance
Se conserva el cierre funcional integrado por PR #47 (`2731baf59baf11620223112d5ef09c8b9d19e4ba`): alta de hijos visible, estados accesibles, TXT 638 completo y cotejo nominal por año. Este correctivo no sustituye ese trabajo ni modifica otros repositorios.

## Problema reproducido y corrección
Un `TENANT_IAM_SOD_CONFLICT` recibido sin traducir terminaba como servicio no disponible. Además, la pantalla interpretaba un conflicto de perfil HTTP 409 como un cambio de datos del legajo.

El adaptador compartido ahora conserva `PROFILE_CONFLICT` para certificados y familiares. La pantalla distingue perfil, sesión vencida, identidad cambiada y demora del servicio. Un conflicto de perfil en la consulta del contexto no se ignora como un fallo opcional. El motivo accesible del bloqueo permanece visible y no se inventa una sesión vencida.

El ensayo de navegador confirma que un conflicto de perfil al guardar conserva el PDF, las fechas y la misma clave de reintento. No concede capacidades ni habilita una escritura cuando el servidor la deniega.

## Comprobación de acceso
Consulta de sólo lectura de la base operativa: Noelia tiene membresía activa `MUNICIPIO_ADMIN_OPERATIVO`, 89 capacidades y todas las capacidades efectivas observadas para Hugo. Están presentes lectura de legajos, propuesta de familiares, catálogo, novedades, exportación, parámetros y cierre mensual. La comprobación de conflictos terminó sin excepción.

Las funciones consultadas de contexto familiar, TXT 638, detalle de cierre y transición mensual son ejecutables por el rol de aplicación y no por PUBLIC. No se cambiaron contraseñas, MFA, membresías, capacidades, haberes ni registros familiares municipales.

## Evidencia de esta entrega
- Regresión inicial del adaptador: 27 pruebas aprobadas y 3 fallidas; después del correctivo, las 30 aprobaron.
- Adaptadores HTTP y mensajes de interfaz: 33 pruebas aprobadas.
- Construcción completa: 5.424 aprobadas, cero fallos y dos omitidas.
- Navegador: familias 52, familias nativas 18, antigüedad 10 y novedades fijas/638 37, sin errores informados.
- El cotejo presupuestario también terminó correctamente con datos y PDF sintéticos.

La ampliación adicional de pipeline intentada durante esta revisión fue bloqueada por la plataforma y no se aplicó. Se conservó el pipeline de PR #47, que ya incorpora la regresión SQL operativa para PostgreSQL 17/18. No se creó un workflow duplicado.

## Límite de aceptación
Los recorridos utilizan APIs e identidades sintéticas; no representan una sesión personal de Noelia ni escrituras municipales de prueba. La antigüedad calendario no reemplaza antigüedad salarial reconocida. Módulo 10 no inventa cupos anuales ni el cargo liquidado cuando la fuente no los contiene. La homologación del TXT por AMARU y el uso de Noelia con su sesión real se distinguen de las pruebas técnicas.

El commit de publicación, estado del CI y comprobaciones contra la versión servida se registran en la issue #37 con su evidencia correspondiente.
