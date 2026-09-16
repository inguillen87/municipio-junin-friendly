# Payroll homologation and native personnel roadmap

This is implementation guidance, not an activation of a municipal pay rule.
Keep employee data, municipal configuration dumps and detailed audit outputs outside
Git and CI. The repository only contains code, synthetic tests and public references.

## Release order

1. Finish the existing native employee candidate: database contract verification,
   tested restoration/rollback, authorized deployment and private read-back. CI
   success is not evidence of a deployed migration. Do not create a login, a clock
   identity or payroll postings when creating an employment record.
2. Register each formula with its municipality, agreement, concept, calculation
   phase, unit, effective period, source evidence and exact rounding boundary.
   Keep human-readable, postfix and compiled implementation references distinct.
   No rule becomes active solely because it parses or appears in an old backup.
3. Resolve disagreements with documented expected cases. Dependency cycles are
   potential until quantity/value/condition phases and conditional applicability
   have been established. Unknown references are not zero and must not be borrowed
   from a different agreement. Hooks for tax, family ceilings, judicial deductions
   and union deductions require dedicated implementation and acceptance.
4. Version shared parameters rather than blindly copying whole agreements. Preview
   the exact affected agreements and concepts; require an independent reviewer;
   retain prior versions for historical reconstruction and effective-date testing.
5. Separate time evidence, approved incidents, authorized dedication, the personnel
   preparatory report, payroll pre-calculation, reconciliation and final confirmation.
   A missing clock event is not automatically an unjustified absence or deduction.
6. Compare a closed baseline by employment and concept, including quantities,
   withholding bases, contribution bases and missing rows. A matching net total
   cannot mask offsetting errors. Any one-cent deviation requires an explanation;
   do not quietly widen tolerances to match the legacy result.
7. Freeze confirmed runs. Corrections create a linked reversal/adjustment or new
   version rather than deleting history. Accounting exports require explicit mapping
   and reconciliation. Bank and fiscal files need their own validated layouts.

## Exact arithmetic laboratory

`scripts/lib/payroll-formula-shadow.mjs` consumes the canonical AST from the private
formula auditor. It preserves decimal literals as BigInt rationals, supports bounded
arithmetic/comparisons and explicitly typed boolean short-circuit evaluation. It
requires explicit inputs and explicit rounding mode/precision. Exponentiation and
remainder remain unsupported until their source semantics are established.

`compareShadow` can demonstrate a counterexample under the declared laboratory
semantics. Matching finite probes NEVER establish GRH equivalence. This module does
not orchestrate an employee payroll, resolve employment data, approve formulas,
write to a database or provide a public API. The semantics identifier and both false
execution/GRH-equivalence flags are returned with every result.

Run `node --test tests/payroll-formula-shadow.test.js`. Municipal counterexamples
must remain in private artifacts, not new public fixtures. Before activation, extend
acceptance cases to mid-month starts/ends, leap dates, retroactivity, time units,
quantity/value ordering, judicial limits and each supported employment regime.

## UX acceptance

The personnel record remains the operational entry point. Show rule explanation,
source, effective date, inputs, selected rounding, reviewer and unresolved issues.
Distinguish draft, tested, reviewed, active and retired. Never label an arithmetic
simulation as a payslip, a payment or a legally approved salary. Preserve entered
forms on recoverable errors and recover the original attempt after uncertain replies.

## Public comparative references (consulted 2026-09-16)

- Mendoza Law 5892, articles 2, 6, 9, 24-27 and 53: local employment scope,
  nomenclature, additions and workday definitions require jurisdiction-specific
  authority. This reference is not a certified consolidation of every amendment.
  https://wwwjuri.jus.mendoza.gov.ar/legislacion/ley005892.php
- Guaymallen Resolution 011/2025: documented retroactive recognition across a prior
  fiscal exercise supports keeping earned period and recognition date separate.
  https://cdguaymallen.gob.ar/digesto/norma/19205
- Godoy Cruz, official announcement 2019-09-19: authenticated digital payslips.
  Historical documented practice, not a claim about its current internal engine.
  https://www.godoycruz.gob.ar/godoy-cruz-personal-ya-puede-acceder-al-bono-sueldo-digital/
- Buenos Aires municipal school, RAFAM personnel syllabus: personnel, leave,
  payroll, permissions and configurations, with a suggested test environment.
  https://escuelamunicipal.economia.gba.gob.ar/cursos/formacion-en-rafam-modulo-de-administracion-de-personal/
- General Lavalle (Buenos Aires), official 2026-04-16 training in RAFAM personnel.
  https://www.generallavalle.gob.ar/nota/agentes-municipales-se-capacitan-en-administracion-de-personal-2026-04-16-18-25-22
- Bariloche employee portal: digital receipt archive and separately requested access.
  https://comunicar.gob.ar/recibosdesueldo/

Adopt traceability and workflow design, not another municipality's percentages,
exemptions or divisors. Public sources do not disclose the complete internal payroll
formula catalogues of these municipalities.
