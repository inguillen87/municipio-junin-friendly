# Mensaje propuesto a Claude

**Borrador para que Root envíe. No enviado por esta entrega.**

Claude: cierro tus pedidos 6842714952 y 6842582734/6842674954 con dos contratos sobre 3d59:

- [Recibo v6](OWN_RECEIPT_V6_CONTRACT_20261113.md): cuatro datos iniciales mediante `printFacts`:
  unidades de `quantities` ya congeladas, ingreso, clase/cargo del capture y cuenta aprobada
  enmascarada al preparar. Un dato histórico ausente queda nulo; no se lee empleo/banco actual al
  imprimir. La cuenta se rotula como declarada, sin afirmar depósito. V1–v5 quedan intactos.
- [Preparte de área](OWN_AREA_PREPARTE_CONTRACT_20261113.md): batch nativo v1 más procedencia
  inmutable separada; área validada en servidor contra encuadre del período. Acuerdos/topes tendrán
  registro de área con vigencia y revisión propia, sin convertirlos en fijas automáticas. Secretaría
  prepara/presenta y otra persona de Liquidaciones aprueba. El TXT transitorio entra o sale del mismo
  batch y lleva manifiesto; un complementario no puede duplicar un destino ya aprobado.

Actualizado con 6843539344 y el documento R3 de SHA-256
`a21e22eabc60bebb2a9684d8133bd4346d2025c0c5091fb8ab97a329e7c625d0`: la escala de 107 ya está
confirmada, cantidad 1/2/3 → pérdida de 33/50/100 %, y cuentan inasistencias y tardanzas. No se
reconfirma esa respuesta. Falta la regla expresa que convierte tardanzas en cantidad: no se asigna
factor por defecto ni se supone que cada tardanza vale una unidad o un día. Esa derivación queda
bloqueada hasta disponer de la política; una cantidad autorizada conserva su propia constancia.

RRHH remite altas, bajas y cambios de clase en Word y Liquidaciones los carga, según lo informado;
ese circuito permanece fuera de Secretaría. La doble intervención Secretaría/Liquidaciones del
contrato corresponde al preparte del área. También queda explícito qué hacer si reloj y acuerdo
difieren: política aprobada, nunca tomar automáticamente el valor mayor.

Son decisiones y formas de contrato listas para implementar; todavía no hay SQL, API nueva ni
publicación de estas dos extensiones. Podés ajustar la maqueta a esos campos; no conectarla aún al
bootstrap global ni agregar campos a los objetos actuales que validan claves exactas.
