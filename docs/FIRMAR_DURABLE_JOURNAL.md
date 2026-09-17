# FD-P1 · Solicitudes, retorno recuperable y recepción en cuarentena

Continúa #42, #1 y #41 sobre la rama de firma integrada. **Desarrollo de servidor, no firma oficial habilitada.** No añade rutas HTTP, credenciales reales, facultades municipales, documentos emitidos ni una aprobación de cálculo.

## Operación implementada

1. Leer la fuente congelada desde el servidor, con versión, hash y referencias de validación de origen y aprobación. El navegador no suministra PDF, CUIL ni una bandera que otorgue facultades.
2. Comprobar sesión municipal con MFA y facultad documentada, vigente y versionada para ese firmante y tipo de documento. No requiere legajo ni consulta a GRH. Recuperación de cuenta y firma tienen niveles de acceso distintos.
3. Reservar el intento en una transacción ANTES de llamar al proveedor. Dos clics, pestañas o instancias del servidor recuperan el mismo intento. Una respuesta perdida no habilita reenvío automático del PDF.
4. Registrar la respuesta del transporte y volver a comprobar la sesión antes de devolver la URL oficial. Si ya llegó el archivo, su estado prevalece sobre la respuesta tardía de inicio.
5. Resolver el retorno por su hash y sesión vigente. El regreso conserva la solicitud y es repetible tras una respuesta perdida; se registra una sola observación. No se utiliza el secreto del callback como retorno.
6. Recibir bytes limitados únicamente en cuarentena. Repetición exacta devuelve el mismo acuse; un archivo diferente registra conflicto sin reemplazar el anterior. Cancelación, vencimiento o revocación impiden nuevas incorporaciones. Retorno del navegador, recepción, verificación y emisión son hechos distintos.

Los nuevos estados NO incluyen firma verificada o emisión. `officialEmissionEnabled` permanece false. Una bandera `success` del proveedor y el token de correlación no acreditan por sí solos autenticidad del prestador ni validez criptográfica; `providerAuthenticated=false` y `cryptographicValidation=not_performed` son explícitos.

## Persistencia y custodia

Migración propuesta `071-firmar-attempt-journal.sql`: autoridad, fuente preparada, intento, bytes retornados y eventos. RLS y revocación de acceso directo de la aplicación; sólo tres funciones de alcance acotado. Fuente inmutable salvo cancelación de su solicitud; recibos y eventos append-only. Sólo se persisten hashes de los secretos de retorno/correlación, no los tokens originales.

Máximo técnico provisional 2 MiB por PDF y 64 MiB de cuarentena por municipio; no modifica los límites de otros módulos. La cuarentena no es el repositorio definitivo ni un mecanismo de retención completo. El validador futuro no debe ejecutar contenido activo ni consultar libremente URLs incluidas en certificados.

Cada solicitud admite un solo intento en este corte. Un error previo o posterior al envío se conserva de manera conservadora: no se crea otro intento automáticamente. Reemisión/reintento autorizado debe utilizar un circuito posterior con nueva solicitud y referencias a la anterior; no forzar la reutilización ni cambiar la fuente preparada.

## Lo que todavía impide la activación

- Fuente y autoridad: falta su circuito de alta/aprobación desde los módulos municipales. La migración no asigna roles, no crea facultades y NO ofrece una función runtime para fabricar fuentes aprobadas.
- HTTP: integrar los adaptadores con límites, autenticación, CSRF/origen y contexto obtenidos del servidor; registrar callback con el prestador. Hoy no hay ruta operativa nueva.
- FirmAR: habilitación institucional, contrato confirmado, secretos de aplicación y ambiente de prueba. Los certificados personales de MXM no sustituyen este permiso de integración.
- Validación: criptografía, confianza argentina, revocación/evidencia temporal, firmante y continuidad del PDF aprobado, más custodia/restauración. No existe operación para emitir desde la mera cuarentena.
- UX integrada: conectar los componentes anteriores al servidor duradero, ensayar ciclo completo y fuente autorizada real. Las pruebas de servicio y pantalla separadas no prueban ese recorrido completo.

## Evidencia y límites de ensayo

Los tests Node usan un proveedor y repositorio sintéticos: escenarios concurrentes de reserva, respuesta perdida, callback temprano, retorno repetido y permisos cambiantes. El ensayo SQL utiliza PostgreSQL 16 real descartable en CI, con contrato mínimo de identidad, dos municipios y usuarios sintéticos; revierte toda la transacción. No es una migración aplicada en Neon ni una prueba del sistema de identidad municipal completo. El helper de separación de funciones es un sustituto explícito de CI; se debe ensayar con el helper real antes de activación.

El workflow existente incorpora PostgreSQL y sus comprobaciones, conservando regresión de aplicación y los tres recorridos previos de navegador. No se crea otro preview ni se despliega esta rama. El resultado de cada ejecución, no este documento, acredita qué pruebas aprobaron.

No se alteran cuentas, claves, firmas personales, nóminas, eventos de relojes o documentos municipales. El frente de Mariano y la autonomía salarial continúan; este componente ofrece continuidad documental, no concluye sus reglas administrativas.
