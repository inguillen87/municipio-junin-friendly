# Destinos aislados y ciclos de gestion - 18/09/2026

## Infraestructura creada, sin cambio productivo

Se aprovisionaron mediante la integracion oficial Vercel-Neon dos recursos Free, sin conectarlos a proyectos, entornos o variables de aplicacion (`--no-connect --no-env-pull`). No se modifico el plan de la instalacion.

| Destino | Proyecto Neon | Rama inicial | Recurso Vercel |
| --- | --- | --- | --- |
| municontrol-junin-prod | wild-cake-87689498 | br-plain-dawn-ac8crb1h | store_z6dbNtjfyjA3sRku |
| municontrol-junin-historica | aged-sea-02192183 | br-delicate-cloud-acz9jue2 | store_OwWyg01ms90uEY5z |

Ambos proyectos estan en aws-sa-east-1, con minimo y maximo observados de 0,25 CU, sin autoescalado por encima de ese limite. La opcion de nueva autenticacion del proveedor quedo desactivada: no se sustituye la identidad de MuniControl.

La instalacion `icfg_cpmulEdganvj4PnaQyzfT3y9` conserva `free_v3`, con alcance de facturacion por instalacion. Estos son proyectos separados, NO una organizacion municipal ni una factura independiente. Antes de subir a pago se debe resolver ese aislamiento; no subir de plan la instalacion compartida.

Los dos destinos devolvieron PostgreSQL 18.6 y cero tablas publicas. Cada base neondb ocupaba 7.716.864 bytes antes de cargar datos. El origen sigue en PostgreSQL 17.11, proyecto `noisy-poetry-54471701`, rama `br-plain-dust-acpjgebb`, con 145 tablas en public y esquemas privados mc_backup_/mc_access_. Su fuente GRH publicada sigue con corte 06/08/2026.

El nombre prod identifica el destino previsto: todavia NO atiende produccion. No se copiaron legajos, haberes, documentos o relojes. No se aplicaron migraciones ni se cambio la fuente activa. La restauracion completa y la compatibilidad 17 a 18 siguen pendientes.

## Codigo de esta entrega

`scripts/lib/municipal-cycle-policy.mjs` contiene planificacion pura y contratos de comparacion. No abre conexiones ni ejecuta cambios. Mantiene la gestion anterior y la actual, con mes inicial completo y dos anos adicionales opcionales. Los cuatro pares anuales usan tiempo transcurrido equivalente, exponen dias sin pareja y no convierten periodos futuros en cero.

Los meses salariales exigen cierre explicito; la fecha del backup no lo sustituye. Solo dos relaciones de detalle importado GRH pueden clasificarse como candidatas, con dependencias, retenciones y origen revisados. Toda otra tabla, dato nativo o caso dudoso se conserva por defecto. La clasificacion NO autoriza retirada de datos.

Los contratos distinguen dotacion, horas autorizadas, horas trabajadas, haberes liquidados, presupuesto aprobado, devengado, pagos y avance fisico. Rechazan datos faltantes, coberturas no verificadas y discrepancias de municipio, alcance, unidad o periodo. No generan conclusiones causales ni puntuaciones politicas.

No se sembraron fechas institucionales reales: las pruebas usan fechas sinteticas. Esta entrega no conecta la nueva logica al tablero ni publica graficas nuevas.

## Verificacion y limites

Las 19 pruebas del modulo pasaron. La regresion exacta de la entrega (archivos test versionados mas el nuevo test de ciclos, excluyendo el test de auditoria pendiente) termino con 3.682 pruebas aprobadas, cero fallos, omisiones o cancelaciones. La compilacion completa local tambien paso; su recorrido incluyo diez pruebas adicionales de un trabajo previo no incluido en esta entrega.

El modulo de preservacion de manifiestos no pudo guardarse: la herramienta rechazo la escritura, incluido un reintento identico. No se uso otra via para aplicarlo. Las tablas de evidencia de la propuesta 076 no estan creadas; no se completo la prueba real de esa migracion en PostgreSQL. El informe no declara conservacion criptografica, migracion de septiembre, autonomia salarial o nueva analitica productiva terminadas.

Los archivos previos `scripts/audit-municipal-history.mjs`, su test y `docs/HISTORY_SEPARATION_20260918.md` quedaron fuera de esta entrega y permanecen intactos en su carpeta de trabajo. No se publican archivos de respaldo, datos municipales, credenciales ni conexiones.

Para continuar: capturar y restaurar el esquema y contenido completos, comprobar compatibilidad 17/18 y ACL/funciones, reconciliar septiembre sin sobrescribir operaciones nativas, medir las dos ventanas y probar archivo/restauracion antes de cualquier corte. La fuente de septiembre del dia 10 tampoco acredita el cierre completo de ese mes. La habilitacion salarial requiere conciliacion por legajo y concepto con las reglas aprobadas.

Fuentes de la via de aprovisionamiento: documentacion oficial de `vercel integration` (https://vercel.com/docs/cli/integration) y de la integracion Vercel administrada por Neon (https://neon.com/docs/guides/vercel-managed-integration). El estado de los recursos, limites y versiones se verifico directamente mediante Vercel y Neon en esta sesion.
