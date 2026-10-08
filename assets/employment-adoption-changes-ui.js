// Render verified facts with textContent; source strings are never HTML.
export function appendAdoptionChanges(host,row){
 if(!row.previous)return;
 const details=document.createElement('details'),summary=document.createElement('summary');
 summary.textContent='Comparar antecedentes y propuesta';details.append(summary);
 const dl=document.createElement('dl');
 for(const [field,label]of [['status','Situación'],['startDate','Ingreso'],['endDate','Egreso'],['agreementCode','Convenio'],['categoryCode','Categoría'],['organizationId','Organización'],['sectorCode','Repartición'],['jurisdictionCode','Jurisdicción']]){
  const dt=document.createElement('dt'),dd=document.createElement('dd'),display=value=>value===null?'Sin dato':field==='status'?({active:'Activo',inactive:'Inactivo',state_error:'Estado a revisar',unknown:'Sin confirmar'})[value]??value:String(value);
  dt.textContent=label;dd.textContent=display(row.previous[field])+' → '+display(row[field]);dl.append(dt,dd);
 }
 details.append(dl);host.append(details);
}
