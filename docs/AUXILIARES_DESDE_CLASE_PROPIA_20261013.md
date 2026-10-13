# Auxiliares desde una clase de referencia propia

El módulo 6 de Noelia describe bases auxiliares vinculadas a clases específicas y factores documentados. El programa propio ya admitía esa fuente; el editor ahora permite preparar la regla y su entrada en conjunto, sin volver a escribir el importe de la escala en cada convenio.

En **Nómina → Reglas de cálculo → Preparar reglas**:

1. Verificar que el maestro esté aprobado, activar la separación de códigos de conceptos y auxiliares y declarar los decimales de los totales.
2. Abrir **Preparar auxiliares desde una clase de referencia**. Elegir la escala exacta y el auxiliar aprobado que utiliza esa base.
3. Declarar factor, precisión exacta, inicio, fin, tipos de liquidación, respaldo y tratamiento del historial. No hay factor ni fechas precargados.
4. Seleccionar los convenios alcanzados. La búsqueda y la paginación conservan la selección completa. Un destino incompatible detiene todo el conjunto.
5. **Revisar referencia completa** muestra la base, el factor, el valor exacto y todas las reglas y entradas del programa. Confirmar e incorporar al borrador.
6. Revisar el programa y su fundamento, registrar la propuesta completa y obtener la decisión de otra persona habilitada por el circuito existente.

La fuente identifica convenio, clase y código de escala; no utiliza automáticamente la clase de cada empleado. La regla nativa conserva ese vínculo y el respaldo de la escala. Una clase ausente, sin valor o con vigencia insuficiente no se sustituye. Un valor cero declarado permanece cero.

El factor se aplica como coeficiente exacto. Ejemplo exclusivamente sintético: `100.010 × 1.50 = 150.015000` con seis decimales. Si la precisión elegida no alcanza, se detiene la preparación. Este ejemplo no homologa una clase, factor o fórmula municipal ni una conversión de horas.

Agregar exige ausencia de superposición. Cerrar la anterior exige una única regla previa, inicio posterior y los mismos tipos; conserva su fórmula y fuentes con su mes final. Las entradas existentes sólo se reutilizan si son idénticas. No se sobrescriben fuentes diferentes ni se retiran antecedentes.

Los programas que consideran períodos laborales parciales necesitan declarar el tratamiento de cada regla nueva. Aplicar una fracción requiere las dos entradas aprobadas ya elegidas para ese convenio; no las inventa ni supone período completo.

Cambiar una declaración, borrador, fuente, programa o sesión invalida la revisión. La aplicación reconsulta las fuentes. Retirar permisos, ocultar la pantalla o cerrar la tarea retira la vista privada. Mientras un envío se recupera, se conserva su cuerpo y clave y se bloquean nuevas preparaciones. No se almacenan programas en el navegador.

La preparación no registra, aprueba ni liquida por sí sola. Un programa que contiene sólo auxiliares no sustituye las reglas de haberes; el motor mantiene esa guardia. Los cálculos, resultados, cierres y recibos anteriores conservan sus versiones. Una nueva regla no permite recalcular una liquidación cerrada sin su circuito de reapertura.

No hay API nueva, migración, concesión de permisos, interpretación de expresiones GRH ni escritura municipal automática. Las pruebas usan únicamente datos sintéticos e incluyen la clase de referencia distinta de la clase del empleado, 61 convenios, escritorio/móvil, revocación, recuperación, PostgreSQL 17/18 y revisión independiente. Publicación y aceptación municipal se acreditan separadamente en el resultado del incremento.
