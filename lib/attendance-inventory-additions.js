// Append an explicitly confirmed point without rewriting the original municipal workbook.
const sameKeys=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).sort().join()===keys.sort().join();
const fail=()=>{throw Error('ATTENDANCE_ADDITION_INVALID');};
export function appendReportedAdditions(base,addition,expectedWorkbookSha256){
 if(base?.tenantSlug!=='junin-mendoza'||base.source?.recordCount!==13||base.data?.length!==13||base.physicalConnectionConfirmed!==false)fail();
 if(!sameKeys(addition,['contractVersion','tenantSlug','baseInventorySha256','mappingVersion','source','sites'])||addition.contractVersion!=='junin-attendance-additions.v1'||addition.tenantSlug!==base.tenantSlug||addition.baseInventorySha256!==expectedWorkbookSha256||addition.mappingVersion!=='junin-pm14-confirmation-20260918.v1')fail();
 const source=addition.source;
 if(!sameKeys(source,['kind','confirmedOn','recordCount','addressSource','coordinateSource','coordinateLicence','locationBasis','physicalLocationVerified'])||source.kind!=='municipal_confirmation'||source.confirmedOn!=='2026-09-18'||source.recordCount!==1||source.physicalLocationVerified!==false||source.locationBasis!=='public_map_building_reference'||source.coordinateSource!=='https://www.openstreetmap.org/node/4373026485'||!Array.isArray(addition.sites)||addition.sites.length!==1)fail();
 const site=addition.sites[0];
 if(!sameKeys(site,['code','name','address','latitude','longitude','model','reportedExtraction'])||site.code!=='PM-14'||site.name!=='Edificio Nuevo'||site.address!=='Román Cano e Hipólito Yrigoyen, Junín, Mendoza'||site.model!=='No verificado'||site.reportedExtraction!=='network_pull'||base.data.some(x=>x.code===site.code))fail();
 if(typeof site.latitude!=='number'||typeof site.longitude!=='number'||!Number.isFinite(site.latitude)||!Number.isFinite(site.longitude)||site.latitude < -33.15||site.latitude > -33.13||site.longitude < -68.50||site.longitude > -68.47||base.data.some(x=>x.latitude===site.latitude&&x.longitude===site.longitude))fail();
 const row=Object.freeze({code:site.code,name:site.name,address:site.address,latitude:site.latitude,longitude:site.longitude,model:site.model,channel:site.reportedExtraction,inventorySource:'municipal_confirmation',locationBasis:source.locationBasis,physicalLocationVerified:false,confirmedOn:source.confirmedOn});
 return Object.freeze({...base,source:Object.freeze({...base.source,kind:'municipal_workbook_with_additions',recordCount:14,workbookRecordCount:13,additionalRecordCount:1,additionMappingVersion:addition.mappingVersion}),data:Object.freeze([...base.data,row])});
}
