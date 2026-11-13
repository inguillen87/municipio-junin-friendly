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

El 107 queda como candidato bloqueado hasta la regla explícita de Noelia. La coincidencia de agosto
no homologa inasistencias ni la escala. También queda explícito qué hacer si reloj y acuerdo difieren:
política aprobada, nunca tomar automáticamente el valor mayor.

Son decisiones y formas de contrato listas para implementar; todavía no hay SQL, API nueva ni
publicación de estas dos extensiones. Podés ajustar la maqueta a esos campos; no conectarla aún al
bootstrap global ni agregar campos a los objetos actuales que validan claves exactas.
