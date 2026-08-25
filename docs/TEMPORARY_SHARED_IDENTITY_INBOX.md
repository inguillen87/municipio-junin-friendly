# Buzón temporal compartido para identidades de muestra

Este mecanismo permite que varias **identidades de acceso distintas** reciban
temporalmente invitaciones y códigos MFA en un único buzón controlado. No crea
alias de usuario, no comparte contraseña, sesión, rol ni actor de auditoría.

## Contrato de seguridad

- Está apagado salvo que `IDENTITY_TEMPORARY_SHARED_INBOX_ENABLED` sea exactamente
  `true`.
- La allowlist combina el correo de la identidad con su contexto exacto:
  `platform` o el UUID del tenant.
- La vigencia programada no puede superar siete días. Para una habilitación sin
  fecha mientras dura la puesta en marcha, `expiresAt` debe ser explícitamente
  `null`: la ruta queda activa hasta apagar la bandera server-side. Omitir la
  clave no está permitido.
- Una ruta allowlisted con fecha vencida falla cerrada; no reenvía
  silenciosamente al destinatario lógico.
- El asunto y el cuerpo identifican el usuario, rol y ámbito. También avisan que
  la entrega es temporal y muestran el buzón compartido en forma enmascarada.
- Invitaciones y MFA utilizan la misma regla. La identidad y el tenant provienen
  del lookup server-side, nunca del formulario del navegador.
- La auditoría durable existente conserva como actor al correo de login. El
  buzón físico no se transforma en actor ni adquiere permisos.

## Variables de entorno

```text
IDENTITY_TEMPORARY_SHARED_INBOX_ENABLED=true
IDENTITY_TEMPORARY_SHARED_INBOX_CONFIG={"recipient":"buzon-controlado@example.com","expiresAt":"2026-08-26T23:59:00.000Z","routes":[{"identityEmail":"owner@municipio.example","context":"platform","identityLabel":"Propietario","roleLabel":"Administrador de plataforma","tenantLabel":"Administración global"},{"identityEmail":"aprobador@municipio.example","context":"00000000-0000-4000-8000-000000000000","identityLabel":"Responsable de Gobierno","roleLabel":"Aprobador final de RRHH","tenantLabel":"Municipalidad de Junín"}]}
```

Para mantener la ruta hasta una desactivación manual, conservar la misma
allowlist y usar `"expiresAt":null`. No se usa una fecha ficticia lejana.

El JSON admite entre 1 y 20 rutas. No admite claves adicionales, duplicados,
saltos de línea en etiquetas ni destinatarios no entregables.

## Preparación de cada identidad

Cada usuario continúa necesitando su propia cuenta, contraseña, membresía y
factor de correo. El factor debe quedar asociado al correo de login de esa
identidad; el router sólo modifica la entrega durante la ventana autorizada.
No debe reutilizarse el mismo correo como nombre de login para personas
diferentes.

## Cierre operativo

1. Cambiar `IDENTITY_TEMPORARY_SHARED_INBOX_ENABLED` a `false` o eliminar ambas
   variables. Ese es también el cierre del modo `expiresAt:null`.
2. Crear y promover un deployment nuevo. Vercel captura las variables al crear
   cada deployment; modificar la configuración no altera instancias ya servidas.
3. Asignar a cada identidad su correo personal o institucional verificado.
4. Reprovisionar/revocar el factor temporal correspondiente.
5. Verificar un acceso por identidad y revisar los eventos de invitación, MFA y
   sesión en auditoría.

No deben guardarse contraseñas, códigos OTP ni claves de Resend dentro de este
archivo o del repositorio.
