# Programas y cálculo propios: cierre de SQL122/123

En Nómina, **Reglas propias** permite preparar un programa completo sin cargar JSON a mano. Cada concepto conserva su vigencia, convenio, unidades, respaldo, fuentes, expresión y redondeo explícito. Otra persona debe revisar y aprobar el conjunto completo. **Calcular** captura las fuentes de contratos propios y conserva entrada, resultado y versiones; un reintento recupera la misma corrida.

El resultado es técnico. La publicación no homologa reglas municipales, no confirma haberes, no anula liquidaciones, no cierra períodos y no paga. No completa por sí sola los módulos 6 y 7 ni convierte la recepción de marcaciones en horas extras aprobadas.

SQL122/123 agregan tres tablas vacías protegidas contra cambios/truncado, 27 funciones y tres definiciones de capacidades. Sólo siete fachadas nuevas reciben EXECUTE del rol de aplicación. No asignan capacidades a funcionarios ni alteran permisos, funciones o datos anteriores.

`prepare-own-payroll-installation.mjs` produce un lote revisable desde fuentes comprometidas. `install-own-payroll.mjs` comprueba el lote contra el mismo HEAD y los dos destinos existentes, ejecuta una sola transacción y registra el resultado antes de comprobar durabilidad con otra conexión. Un COMMIT incierto no se reintenta automáticamente. Los controles devuelven metadatos, cantidades y huellas; las filas permanecen en SQL.

`verify-own-payroll-installation.mjs` ejecuta el instalador real en una base local desechable y sintética de PostgreSQL 17 o 18. Comprueba conservación y COMMIT, y rechaza alteraciones de tablas, índices, RLS, funciones, permisos, capacidades y asignaciones anteriores. Mantiene las regresiones SQL y de navegador existentes. La autenticación e IAM de la base sintética no acreditan aceptación municipal.

La habilitación operativa requiere reglas documentadas y aprobadas, permisos específicos y conciliación de resultados con Noelia. El circuito de liquidación definitiva y el funcionamiento autónomo de los 14 relojes conservan sus propias condiciones de aceptación.
