# Auxiliares: centavos exactos y precisión propia

Las nuevas propuestas del formulario de auxiliares usan el criterio `exact_cent`: no redondean ni truncan. Las referencias de clase conservan sus centavos y el factor de la regla documentada sólo se admite cuando el resultado es representable sin pérdida en este contrato.

Si aparece una fracción de centavo, la preparación se detiene con una explicación y conserva importe, mes, convenios y referencia. El operador puede preparar una definición propia en Reglas de cálculo con la precisión respaldada; no debe modificar la escala para evitar la incidencia. El motor propio conserva racionales exactos y trazas. No se activa ninguna regla municipal por implementar esta mejora.

Las propuestas históricas se consultan, descargan y verifican usando su criterio original, que se identifica en pantalla y documentos. Los cuerpos y claves de intentos pendientes no se transforman. No se modifican importes aprobados, liquidaciones ni permisos.

La adaptación técnica amplía exclusivamente `payroll_parameter_build_draft_v1(jsonb)`, preservando las políticas anteriores para la lectura/recuperación histórica. La migración 041 original no se cambia. Un generador produce el lote revisable y comprueba destino, función conocida y conservación; no se conecta ni aplica SQL automáticamente. Primero deben pasar pruebas, publicación técnica e instalación verificada en las dos bases existentes.

Verificación: pérdida de precisión antes de SQL, centavos al límite, historial anterior, errores accionables, confirmación voluntaria, cuerpo/clave de recuperación, exports, revocación y controles de 44 px a 320/390 px. PostgreSQL 17/18 se prueban con parámetros sintéticos y rollback.

F.931 y demás formatos requieren su propio mapeo homologado. El contrato de representación de una salida no justifica redondeos intermedios, diferencias toleradas o cambios de valores originales.
