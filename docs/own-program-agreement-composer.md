# Compositor local de convenios

`assets/own-program-agreement-composer.js` exporta:

```js
composeAgreement(definition, {
  source: '1', target: '6', period: '2026-10', overrides, coverageDecisions
}); // { definition, report }
```

Recibe la **definición**, no el contenedor `program` ni una captura de liquidación.
No modifica los argumentos, consulta servicios, accede al DOM ni calcula una liquidación.
Preserva los objetos del origen y su orden de propiedades, comprobados mediante
`JSON.stringify`; no conserva el formato de espacios del archivo JSON de entrada.
Las claves de versión se conservan salvo la transición explícita de emisión v1 a v2.

## CLI

```sh
node scripts/compose-agreement.mjs --definition tmp/definition.json --overrides data/agreement-overrides/6-2026-10.json --coverage-decisions tmp/coverage-decisions.json --output tmp/composed.json --report tmp/composition-report.json
```

Los directorios deben existir. Las salidas deben ser archivos nuevos y distintos de
las entradas. `--coverage-decisions` es opcional si no hay exclusiones pendientes.
La salida estándar contiene únicamente conteos. Los errores no muestran expresiones,
contenido de archivos ni rutas del equipo. Las definiciones y reportes operativos
pertenecen a almacenamiento privado; `tmp/` está ignorado por Git.

Códigos de salida: **0**, composición completa; **1**, error sin resultado;
**2**, borrador escrito con diferencias pendientes declaradas en el reporte.
`report.complete` expresa únicamente si quedan diferencias declaradas pendientes;
no acredita validación de una base, aprobación ni aceptación municipal.

## Selección y conservación

Se clonan reglas, entradas, fases y los ocho arreglos de políticas enumerados en
el módulo. La selección respeta ambos extremos inclusivos de la vigencia,
`period` exacto y la ausencia de vigencia. Se conservan los intervalos originales:
elegir octubre no recorta una regla que ya tiene un intervalo mayor.

Un destino presente en cualquier período, arreglo o tratamiento bloquea la
operación. Los tratamientos requieren el prefijo exacto de convenio y el segmento
exacto del período. Los identificadores `c1.` pasan a `c6.`; los demás reciben
`.c6`. `sourceAgreementCode` se cambia sólo cuando existe.

La poda se ejecuta después de las diferencias. Cuenta entradas consumidas por
expresiones, fases, políticas (`inputKey`, campos terminados en `InputKey`,
`bindingKeys` y campos terminados en `InputKeys`) y participación fraccionaria.
Sólo elimina entradas del destino; las eliminaciones se registran por clave.

La emisión legada se valida antes de convertirla. Cada condición v2 obtiene su
etapa de una única fase destino, conserva evidencia y usa dominio `nonnegative`.
La lista se ordena con la misma clave y comparación binaria del motor. Si el orden
original impide preservar los bytes del origen, se rechaza en vez de corregirlo.

Una sucesión de políticas se enlaza y vuelve a sellar sólo si su antecedente
también se clonó. Antecedentes fuera del período, ciclos, colisiones y nuevas
familias de arreglos no soportadas producen errores explícitos.

## Diferencias declaradas

Los archivos usan `own-program-agreement-overrides.v1`, con `source`, `target`,
`period`, `reference`, `changes` y `unresolved`. Cada cambio declara `id`,
`collection` (`rules` o `quantityPhases`), `code`, `liquidationType`, `match` y
`action`; `nature` permite distinguir auxiliares de conceptos con igual código.

Debe encontrarse una sola regla y un solo nodo. `match` compara los campos
declarados; `binding` selecciona por propiedades de la entrada enlazada sin
depender del nombre de su clave. El recorrido se detiene en un nodo coincidente:
una suma anidada se selecciona por su raíz externa. Dos sumas independientes
son ambiguas y exigen refinar el archivo de diferencias.

Operaciones admitidas:

- `add`: envuelve el nodo como `{op:'add', left:nodo, right:value}`.
- `replace`: sustituye por `value`. Puede declarar entradas nuevas en `bindings`,
  con clave, unidad, canal mensual/fijo, código, ausencia, combinación y referencia.
- `rebind`: copia la entrada del nodo y cambia sólo `key`, `sourceKind` y
  `ruleReference`, declarados en `bindingPatch`. Preserva unidad, código,
  combinación y tratamiento de ausencia del original.
- `assert`: comprueba el nodo sin alterarlo. El reporte distingue esta operación.
- `useAsExpression`: usa el nodo seleccionado como expresión completa de la regla.
  Exige una única coincidencia y no conserva envoltorios de otra fórmula.

El archivo del **6** agrega el concepto 59 exacto a la suma del 44 y cambia
`monthly_amount` por `monthly_quantity` para el 670. Exige que el nodo original
esté enlazado a `I[670]` mensual en dinero; no transforma otro canal por semejanza.
El nuevo enlace mantiene `combine` y `onMissing` originales.

El archivo del **4** agrega el 59 y usa el nodo de importe mensual `I[649]` como
expresión completa de 649. Exige que ese nodo exista una sola vez: si no coincide,
falla sin inventar una entrada. Deja pendientes 48 y 670. Para 48,
`compare(max(a,b),0.06)` puede expresar el OR si ambos operandos tienen igual
unidad, pero faltan los enlaces y unidades de `L[24]` y `L[27]`. Para 670 falta
el enlace de `L[196]`; un número de GRH no identifica un hecho propio del motor.
Las reglas clonadas de esos conceptos permanecen en el borrador y el reporte
indica que no están adaptadas.

## Decisiones escolares

Sin una decisión por cada fila 311/312, la composición falla con
`COMPOSER_COVERAGE_DECISION_REQUIRED` y `details.rows` lista código y política
destino. `coverageDecisions` es un arreglo con esta forma:

```text
{
  policyId: identificador de la política destino renombrada,
  code: código de la fila pendiente,
  reference: referencia documental de la decisión explícita,
  disposition: disposición completa admitida por el motor
}
```

`disposition` contiene `kind` y los campos requeridos para ese tipo. Conserva
`code` y `sourceRowSha256` originales; no puede suministrarlos ni cambiarlos.
Una exclusión requiere `basis` y su evidencia real. El compositor no genera
decisiones ni huellas documentales. El validador existente revisa la forma,
base tipada, inventario, huellas y correspondencia con reglas y entradas destino;
`outside_february_school_condition` sigue
prohibido fuera del convenio 1. Decisiones duplicadas o no utilizadas fallan.

La composición no sustituye la validación completa del catálogo, las relaciones
entre políticas y reglas ni las funciones SQL. Las pruebas locales incluyen el
validador real de programas JavaScript con un catálogo enteramente sintético.
No hay definición municipal ni evidencia de ejecución de base en este cambio.

## Pruebas locales

```sh
node --test tests/own-program-agreement-composer.test.js tests/compose-agreement-cli.test.js
node scripts/verify-platform-baseline.mjs
node scripts/verify-friendly-containment.mjs
node --test tests/platform-baseline.test.js tests/build-published-imports.test.js tests/published-asset-import-closure.test.js tests/published-asset-import-closure-parser.test.js tests/own-payroll-program.test.js tests/own-payroll-row-emission.test.js tests/own-payroll-policy-validity.test.js tests/own-payroll-source-coverage.test.js tests/school-period-source-coverage.test.js
```
