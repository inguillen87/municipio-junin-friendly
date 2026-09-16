// Native records have no GRH batch, payroll snapshot or inferred PERSONAS match.
export function nativeEmployeeDetail(row,recordYear=null){
 const fields=row.rawFields?.employment||{},native=row.rawFields?.native||{};
 return {status:200,payload:{ok:true,data:{...row,recordOrigin:'MUNICONTROL',
  organizacion:fields.organizationName??null,sector:fields.sectorName??null,categoria:fields.categoryName??null,
  convenio:fields.agreementName??null,cargo:fields.cargoName??null,legalReference:native.legalReference??null,createdAt:native.createdAt??null,
  liquidable:false,payrollStatus:'not_liquidated',crosswalkStatus:'not_loaded',unionMemberships:[],identityAssertions:[],sourceReferences:[],employmentHistory:[],movements:[],ausencias:[],licencias:[],familiares:[],
  personas:{available:false,status:'not_loaded',sourceId:null,contact:{available:false,phone:null,email:null},domiciles:[],territory:{},assertions:[],reason:'Alta propia: sin vínculo importado de PERSONAS.'}},
  meta:{recordYear,absenceTotal:0,leaveTotal:0,familyTotal:0,movementTotal:0,relationRowsComplete:true,source:'MUNICONTROL'}}};
}
