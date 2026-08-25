# SHA del release certificado

Las operaciones gobernadas comparan el release activo con
`certified_release_sha` en PostgreSQL. El resolver no certifica ni promueve un
release: solamente identifica qué commit está ejecutando el backend y conserva
la comparación exacta en la base.

## Deployments manuales

Configurar `INTERNAL_CERTIFIED_RELEASE_SHA` con el SHA Git completo de 40
caracteres del artefacto desplegado. Esta variable tiene precedencia sobre
`VERCEL_GIT_COMMIT_SHA`, porque un deployment manual de Vercel puede no publicar
metadata Git. Si Vercel sí informa ambos valores, deben ser exactamente iguales;
una discrepancia falla cerrada para impedir que un artefacto se presente como
otro release.

Si `INTERNAL_CERTIFIED_RELEASE_SHA` existe pero está vacía o no contiene un SHA
válido, el runtime falla cerrado con HTTP 503. No usa el valor de Vercel como
respaldo silencioso.

## Deployments vinculados a Git

Cuando la variable explícita no existe, el runtime conserva el fallback a
`VERCEL_GIT_COMMIT_SHA`. Ambos caminos normalizan a minúsculas y exigen
exactamente 40 caracteres hexadecimales.

## Checklist operacional

1. Registrar el SHA exacto del commit que produjo el artefacto.
2. Configurar `INTERNAL_CERTIFIED_RELEASE_SHA` con ese mismo SHA únicamente en
   los entornos que usan un deployment manual. Nunca apuntarla al SHA anterior
   para eludir una diferencia con la política del tenant.
3. Crear un deployment nuevo: los cambios de variables de Vercel no alteran un
   deployment ya construido.
4. Si la política del tenant todavía certifica el release anterior, usar el
   comando gobernado `certify_data_plane` desde una sesión Plataforma con MFA,
   binding GRH verificado, versión esperada e idempotencia. No actualizar
   `tenant_identity_policy` mediante SQL directo.
5. Confirmar que PostgreSQL devuelve el mismo SHA del artefacto y mantiene el
   binding esperado. Recién entonces ejecutar smokes de lectura y de una
   operación gobernada autorizada.

Un estado `Ready` de Vercel por sí solo no acredita la comparación con
PostgreSQL. Durante el intervalo entre el deployment y la recertificación, los
accesos tenant deben fallar cerrados; la administración global conserva el
camino explícito para completar la promoción.

Para volver al modo Git, eliminar la variable explícita y desplegar nuevamente.
