# Módulo 4 · Asociaciones contables propias

La nómina incorpora **Asociaciones contables** como tarea propia. Permite conservar una matriz anual de conceptos y sus destinos, y las asociaciones de cada contrato municipal con institución y función. Una propuesta registra el conjunto completo; otra persona habilitada lo revisa y decide.

## Alcance funcional

| Conjunto | Alcance y campos declarados |
| --- | --- |
| Destinos anuales | Año, jurisdicción 42/55, convenio, repartición, concepto y naturaleza aprobada; partida, proveedor, acreedor, cuenta contable, cuenta bancaria y banco; fechas inicial/final dentro del año y documento de respaldo. |
| Institución y función | Contrato propio elegido expresamente, todos los conceptos o uno aprobado; institución, función, vigencia civil y documento de respaldo. |

La partida es obligatoria. Las otras referencias financieras pueden quedar sin informar y conservan `null`; no se convierten en cero ni se copian entre campos. Una cuenta bancaria no identifica por sí sola una cuenta contable. Las fechas y referencias institucionales se declaran; no se deducen de una repartición, del nombre, del documento personal o del cargo.

Una asociación histórica conserva sus destinos y fecha inicial. Para reemplazarla, el operador cierra la vigencia y agrega una nueva asociación. La versión aprobada anterior, la propuesta original y su decisión permanecen inmutables. No se permiten superposiciones para un mismo alcance, ni una asociación institucional general superpuesta con otra por concepto.

Si posteriormente se archiva un concepto o una referencia administrativa, su asociación anterior permanece consultable y puede cerrarse. El archivo no habilita otro destino ni una nueva vigencia con esa referencia; las asociaciones nuevas necesitan fuentes propias aprobadas vigentes.

## Preparar, revisar y recuperar

1. Abrir Nómina → Asociaciones contables y actualizar la consulta.
2. Agregar destinos anuales o instituciones; declarar referencias, vigencias y fundamento.
3. Revisar el antes y el después completos y confirmar voluntariamente el registro.
4. Otra persona habilitada abre la propuesta completa y aprueba o rechaza con fundamento. Si cambian las fuentes o la configuración, la propuesta anterior puede rechazarse, pero debe prepararse de nuevo para aprobarla.
5. Si se pierde una respuesta, consultar el mismo intento. Reintentar conserva la clave y el cuerpo originales. Sólo una consulta que confirme que el intento no existe habilita volver a revisar la carga.

Los listados contienen todas las asociaciones y propuestas. La búsqueda y las páginas sólo cambian la vista. Ocultar la página, cambiar de tarea, vencer la sesión o retirar permisos retira las vistas privadas y la confirmación. No se guarda el borrador ni la fuente en `localStorage` o `sessionStorage`.

## Autonomía y gobierno

Los catálogos de encuadres y conceptos deben estar aprobados en MuniControl. Los contratos se obtienen de sus registros propios, incluyendo los contratos adoptados expresamente que ya tengan registro propio; no se resuelve la identidad desde un TXT ni por nombre o DNI. Un contrato creado únicamente en MuniControl puede asociarse sin existir en GRH.

Publicar o instalar esta herramienta no adopta el padrón ni aprueba catálogos municipales. Si esas decisiones todavía faltan, la pantalla explica los requisitos y ofrece abrir Parámetros propios y Personas y legajos; no muestra una configuración ficticia como disponible.

Se reutilizan las capacidades existentes de lectura de personal y parámetros, preparación y aprobación de parámetros. No se asignan permisos nuevos. La decisión requiere persona, membresía y correo diferentes del autor, además de la identidad municipal vinculada y la autoridad comprobada en PostgreSQL. SQL147 agrega una tabla privada inmutable y cuatro fachadas; no adapta el motor salarial ni cambia capturas pendientes.

## Límite de esta fase

Esta entrega configura y versiona asociaciones. No imputa liquidaciones, ejecuta asientos, concilia cuentas ni paga. La fase siguiente debe vincular una liquidación propia cerrada con la versión de asociaciones vigente y comprobar cobertura, elegibilidad temporal y destinos obligatorios antes de generar una imputación completa. Las asociaciones de contratos históricos no prueban actividad actual ni elegibilidad para liquidar.

INSUTACO e INSULEGA se usan como referencias del procedimiento descrito por Noelia en el módulo 4. No se adoptan cuentas, partidas, proveedores o códigos institucionales municipales por inferencia. La configuración real y la aceptación del circuito por Noelia/Hacienda requieren sus datos y revisión correspondientes.

## Verificación reproducible

- Pruebas del modelo, API y decisiones: `node --test tests/own-payroll-accounting*.test.js`.
- Regresión PostgreSQL aislado 17/18: `scripts/verify-own-payroll-accounting-sql.mjs` genera un lote completo, con los controles previos sin modificar.
- Navegador y API/SQL reales con fixtures sintéticos: `scripts/verify-own-payroll-accounting-ui.mjs`, incluido el paquete construido, recuperación de respuesta perdida, todas las páginas, búsqueda, revocación y pantallas de 390/320 px.
- Instalación revisable y conservación: `scripts/lib/own-accounting-installation.mjs`. Devuelve hashes y agregados; no abre conexiones ni ejecuta SQL.
- Paquete exacto desde un commit limpio: `scripts/prepare-own-accounting-installation.mjs`. La instalación técnica ensaya un rollback, verifica la ausencia de los objetos y comprueba conservación y durabilidad; no prepara asociaciones reales ni asigna permisos.

Implementado, probado, instalado, publicado y aceptado son estados separados. Este documento explica el contrato del incremento; las pruebas sintéticas no certifican una imputación municipal real.
