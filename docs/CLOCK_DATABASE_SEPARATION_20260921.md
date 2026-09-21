# Base exclusiva de relojes

Decisión del 21 de septiembre de 2026, a pedido del titular del proyecto. Esta separación autoriza una base dedicada a relojes; no autoriza cambiar el plan, sustituir las conexiones existentes ni duplicar la aplicación municipal.

## Arquitectura y responsabilidad

```text
Relojes → colector en servidor municipal → cola duradera
                                            ↓ envío agrupado HTTPS
                                 MuniControl en Vercel
                                            ↓ credencial exclusiva
                                 Neon: municontrol-junin-relojes
                                 fuentes y comprobantes

MuniControl: empleados, permisos y gestión → Neon actual
                      ↑ conciliación explícita posterior
```

Un proyecto independiente de Neon separa almacenamiento y cómputo. Una segunda base en el proyecto actual seguiría compartiendo sus recursos. Se conserva la misma aplicación y los empleados permanecen bajo la autoridad del sistema actual. No se copian nómina, sueldos, movimientos, expedientes ni contratos a la base de fuentes.

El servidor municipal conserva la captura y su cola durante cortes de Internet o suspensión del servicio remoto. No es necesario publicar PostgreSQL municipal en Internet. Instalar el servicio en ese servidor todavía requiere acceso administrativo válido; la VPN por sí sola no lo otorga. Hasta la aceptación física se mantienen los colectores actuales.

## Fase 1: fuente independiente

`scripts/clock-database/001-source-store.sql` crea el almacén compacto de originales. Es una migración **de otra base**, fuera del historial de migraciones del sistema contable. La instalación sólo se admite en `municontrol_clocks` o en la base local descartable `clock_source_qa`, con comprobaciones contra objetos ajenos. Se verifica con PostgreSQL 17 y 18. La instancia dedicada prevista usa PostgreSQL 18; no se instala esta migración en las bases contables PG17/PG18.

Se guardan bytes originales de 40 bytes por marcación, sus posiciones de origen, hashes, identificación del reloj y comprobantes por parte. No se crea una persona, fichada canónica, liquidación ni actuación municipal. La habilitación de dispositivos queda vacía hasta la integración autorizada de cada fuente.

La función de recepción exige el contrato exacto, dispositivo habilitado y credencial específica. Persiste antes de confirmar. Repetir exactamente una parte recupera el mismo comprobante; cambiar su contenido o metadatos produce conflicto. La terminación de un lote se registra sólo después de verificar todas sus partes y el hash total. Recibir una parte no acredita por sí solo un lote completo.

`clock-source-receipt.v1` confirma exclusivamente **fuente almacenada**. No sustituye `zk40-receipt.v1` ni afirma conciliación con empleados, control laboral o modificación de haberes. El rol de recepción no puede consultar ni modificar tablas directamente y no recibe acceso público ni credenciales de conexión durante esta fase.

La credencial administrativa creada por Neon es exclusivamente de instalación. Un futuro usuario de aplicación se debe crear mediante SQL, con privilegios mínimos, sin herencia de `neon_superuser` ni `BYPASSRLS`, y verificar sus permisos efectivos antes de conectarlo. Los controles de inmutabilidad protegen el circuito de aplicación; no se presentan como protección contra un administrador capaz de cambiar el esquema.

La fase 1 no agrega endpoints ni cambia remitentes, paneles, variables de entorno, conexiones o recibos del circuito actual. Tampoco importa históricos, elimina originales o habilita limpieza automática.

## Costo y capacidad

La cuenta se verificó en Free el 21/09/2026. La documentación vigente de Neon asigna a cada proyecto Free 0,5 GB, 100 CU-h mensuales y 5 GB de transferencia pública mensual, con suspensión tras cinco minutos de inactividad. Son cupos, no almacenamiento ni disponibilidad ilimitados. Véase [la documentación oficial](https://neon.com/docs/introduction/plans) y su [fuente oficial actualizada](https://github.com/neondatabase/website/blob/main/content/docs/introduction/plans.md).

El proyecto dedicado se crea en la misma organización gratuita y región São Paulo, con cómputo mínimo y máximo de 0,25 CU y suspensión automática. No se cambia la suscripción ni se habilita facturación adicional.

Una instancia de 0,25 CU activa continuamente durante 31 días consumiría 186 CU-h, por encima del cupo. La captura local puede ser continua; los envíos a la nube deben agruparse en ventanas comunes para todos los relojes. Una ventana cada 15 minutos, con cinco minutos activos por ventana, daría aproximadamente 62 CU-h en 31 días **antes** de sumar procesamiento, consultas y reintentos. Es una estimación para el diseño posterior, no una configuración ya activada ni una garantía: remitir relojes escalonados o consultar el tablero cada minuto impediría la suspensión.

La recepción incorpora un umbral conservador de 400 MiB para la base dedicada y preserva los recibos existentes aunque se cierre la recepción de nuevos datos por capacidad. Este umbral no mide otras bases, ramas, historial o cómputo del proyecto. Antes de habilitar carga se deben medir esos recursos y reservar margen. Un límite alcanzado conserva pendientes locales y muestra el atraso; no borra datos ni contrata capacidad.

La medición de fuentes locales encontró 78.871 registros de cinco equipos, con 3.154.840 bytes de originales. Su tamaño bruto no equivale al tamaño final con posiciones, índices, comprobantes y respaldos. El almacenamiento compacto evita replicar todas las filas e índices de conciliación por cada fuente. No se promete una duración fija del cupo sin medir crecimiento real.

Separar nuevas fuentes tampoco libera por sí solo el espacio ya usado en la base de gestión. Cualquier traslado o depuración histórica requiere una fase independiente con conteos, hashes, restauración comprobada y trazabilidad.

## Integración y aceptación posteriores

1. Habilitar el servicio municipal con identidad y credenciales propias. Restaurar una copia de prueba en soporte distinto y verificar conservación de la cola ante reinicio y falta de espacio.
2. Agregar conexión exclusiva de relojes en el servidor de aplicación, enrolamiento verificable y un receptor con acuse de fuente. Mantener la autenticación y autorización municipal en el sistema actual. Revalidar permisos antes de lecturas o conciliaciones; no confiar en una copia indefinida de permisos.
3. Incorporar publicación agrupada, presupuesto de cómputo y estados visibles: capturado, fuente almacenada, conciliación pendiente, conciliado. Separar el recibo de fuente del recibo de control. Nunca confirmar éxito global tras una sola de dos escrituras.
4. Conciliar desde lotes completos e inmutables con identidad de origen estable. Descubrir novedades por recepción y clave de evento, incluyendo fichadas tardías. Filtrar un lote exige un derivado con nuevo identificador, hash y procedencia; no se cambian bytes manteniendo el identificador anterior.
5. Verificar una marcación física nueva, extremo a extremo y con la PC personal apagada, más recuperación tras corte y repetición sin duplicados. Sólo entonces trasladar la operación y retirar el colector provisional.

El sistema actual enlaza recepción, tenant, fuente, permisos e identidad dentro de una transacción. Por eso la separación operativa necesita estas etapas: cambiar únicamente una cadena de conexión rompería ese contrato. No se elimina la cola actual al recibir un nuevo acuse: hoy esa cola también reconstruye la deduplicación, y su futura limpieza requiere un índice duradero y recuperación probada.

## Crecimiento a otros municipios y dispositivos

La unidad de aislamiento es el municipio: cada dispositivo, lote y comprobante queda vinculado a una habilitación y a su municipio de origen. El remitente no puede elegir un tenant en el payload. Se prueba que una credencial no pueda enviar por otro dispositivo y que el mismo identificador externo no mezcle registros de municipios distintos. Esto prepara una operación comercial con múltiples municipios; no acredita todavía que toda la aplicación esté certificada para esa modalidad.

Las credenciales se separan por dispositivo y entorno. Una revocación no debe apagar otros municipios. La aplicación podrá resolver el proyecto de datos según una configuración administrativa confiable, nunca a partir de una URL de conexión enviada por el navegador. Un municipio de mayor escala podrá contar con un proyecto dedicado y presupuesto propio sin multiplicar copias del código ni usar la PC del proveedor como servicio.

Los dominios futuros conservan contratos distintos: marcaciones para relojes, mediciones para sensores y eventos/referencias para cámaras. El video requiere almacenamiento de archivos y políticas propias de acceso, retención y capacidad; no se incorpora como grandes blobs a PostgreSQL ni se supone cubierto por el cupo gratuito de esta base. El esquema actual está limitado a fuentes ZK40, no se presenta como plataforma de cámaras o IoT ya implementada.

La arquitectura debe poder medir costo y carga por municipio y dispositivo, limitar envíos y recuperar pendientes sin perder el origen. La serialización global de la recepción de esta fase protege el cupo y favorece la corrección en una instalación pequeña; requiere mediciones y un cambio específico antes de afirmar capacidad para miles de equipos concurrentes. El crecimiento no se certifica con una multiplicación teórica de proyectos gratuitos.

## Puertas de publicación

Rama `internal-clock-database-20260921`, sin Preview automática. Primero CI real con PostgreSQL 17 y 18, pruebas de permisos/repetición/conflictos/partes y regresión existente. Después crear el proyecto gratuito dedicado, comprobar organización, versión, región y límites, e instalar exclusivamente la migración certificada. En la base remota sólo se verifican objetos, permisos y conteos vacíos, sin insertar personas o fichadas de prueba. Por último promover el mismo commit a master, esperar Vercel y verificar los límites públicos y los assets del circuito existente.
