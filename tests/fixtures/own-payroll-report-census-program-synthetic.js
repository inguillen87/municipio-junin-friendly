// A distinct documentary proposal for QA200, never a municipal rule or rate.
export function census190ProgrammeCandidate(base) {
 const candidate=structuredClone(base);
 const matches=candidate.rules.filter(rule=>rule.code==='1'&&rule.agreementCode==='1'&&rule.nature==='remuneration');
 const reference='Revisión documental exclusivamente sintética QA200; sin norma municipal';
 if(matches.length!==1||typeof matches[0].ruleReference!=='string'||matches[0].ruleReference===reference)throw Error('CENSUS190_PROGRAMME_FIXTURE_CHANGED');
 matches[0].ruleReference=reference;
 return candidate;
}
