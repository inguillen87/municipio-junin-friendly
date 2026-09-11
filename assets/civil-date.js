/** Calendar dates retain the source day. A payroll date is not a local-time instant. */
export function civilDate(value) {
 const s=String(value??'');
 const m=/^(\d{4})-(\d{2})-(\d{2})(?:T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d{1,3})?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d))?$/.exec(s);
 if(!m)throw Error('Fecha de calendario inválida');
 const [y,mo,d]=m.slice(1,4).map(Number),date=new Date(Date.UTC(y,mo-1,d));
 if(y<1900||y>2100||date.getUTCFullYear()!==y||date.getUTCMonth()!==mo-1||date.getUTCDate()!==d)throw Error('Fecha de calendario inválida');
 return s.slice(0,10);
}
export function civilMonthLabel(value){const s=String(value??'');const day=civilDate(/^\d{4}-\d{2}$/.test(s)?s+'-01':s);return new Intl.DateTimeFormat('es-AR',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(day+'T12:00:00Z'))}
