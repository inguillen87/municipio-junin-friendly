# Cantidades en días en la nómina propia

El maestro salarial y las reglas distinguen días, horas, minutos, importes, porcentajes, conteos genéricos y coeficientes. Una definición con cantidad en días usa `days`; el CSV admite `dias`. Elegir días no asigna una cantidad, una base mensual ni una equivalencia horaria.

El programa aprobado debe declarar la fuente de la cantidad y su unidad. Una novedad mensual o fija en días sólo puede alimentar una entrada en días con una definición compatible. La cantidad faltante permanece ausente: no equivale a cero. El motor conserva cantidades fraccionarias y precisión decimal exacta. Una división entre cantidades de la misma unidad puede producir un coeficiente; cruzar días con horas o minutos exige una conversión declarada, su factor y una referencia.

Las definiciones anteriores con `units`, horas u otras unidades conservan su significado y sus versiones. Esta ampliación no recategoriza novedades guardadas, no atribuye días trabajados a una fichada ni reemplaza una jornada contractual o una declaración de participación. Tampoco homologa una fórmula municipal, un denominador mensual, días ART, ausencias o antigüedad.

SQL166 adapta exclusivamente las listas de unidades de cuatro validadores existentes, incluida la versión que separa conceptos y auxiliares. El protocolo verifica sus huellas y atributos antes y después, conserva todas las filas y permisos y admite repetición de sólo verificación. La adaptación y la publicación requieren las comprobaciones del mismo commit; crear el archivo SQL no confirma su instalación.
