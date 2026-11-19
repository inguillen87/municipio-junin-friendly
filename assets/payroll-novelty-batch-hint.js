// Plain-language next step for a batch, derived only from the commands the server allows for this session.
export function batchDecisionHint(batch, principal) {
  const commands = Array.isArray(batch?.allowedCommands) ? batch.allowedCommands : [];
  const caps = new Set(Array.isArray(principal?.capabilities) ? principal.capabilities : []);
  if (batch?.status === 'draft') return commands.includes('submit') ? { text: 'Borrador tuyo: envialo a aprobación o cancelalo.', yours: true } : { text: 'Borrador de otra cuenta: lo envía o cancela quien lo preparó.' };
  if (batch?.status !== 'submitted') return null;
  if (commands.includes('approve')) return { text: 'Podés aprobarlo o rechazarlo.' };
  if (commands.includes('cancel')) return { text: 'Lo preparaste vos: podés cancelarlo. Lo aprueba o rechaza otra persona con permiso.', yours: true };
  if (caps.has('payroll.novelty.approve') && principal?.employmentLinked === false) return { text: 'Lo preparó otra cuenta. Tu cuenta no está vinculada a un legajo, así que no aprueba: lo decide una cuenta vinculada con permiso, o quien lo preparó lo cancela.' };
  return { text: 'Lo preparó otra cuenta: lo decide una persona con permiso de aprobación, o quien lo preparó lo cancela.' };
}
