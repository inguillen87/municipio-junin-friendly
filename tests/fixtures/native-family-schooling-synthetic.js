// Synthetic identities and school records only; no municipal records.
import {schoolingFixtureV4,syntheticUuid,syntheticSchoolPdf,syntheticSchoolHash} from './family-schooling-synthetic.js';
export {syntheticUuid,syntheticSchoolPdf,syntheticSchoolHash};
export const nativeFamilyIds=Object.freeze({contract:syntheticUuid(80001),otherContract:syntheticUuid(80002),registration:syntheticUuid(80003),otherRegistration:syntheticUuid(80004),child:syntheticUuid(80005),otherChild:syntheticUuid(80006)});
export function nativeFamilySubject(other=false){return {contractId:other?nativeFamilyIds.otherContract:nativeFamilyIds.contract,legajo:'9001',employeeName:other?'Otra persona sintética':'Persona nativa sintética',identityToken:(other?'d':'c').repeat(64),sourceCutoff:null,origin:'MUNICONTROL',registrationId:other?nativeFamilyIds.otherRegistration:nativeFamilyIds.registration,registeredAt:'2026-09-22T10:00:00.123456Z'};}
export function syntheticAdministrativeCertificate({pdf=false,id=syntheticUuid(80100),supersedesId=null,recordedAt='2026-09-22T12:30:00.123456Z'}={}){return {
 id,filename:pdf?'certificado-sintetico.pdf':null,sha256:pdf?syntheticSchoolHash:null,byteLength:pdf?syntheticSchoolPdf.length:null,
 presentedOn:'2026-09-21',expiresOn:null,recordedAt,recordKind:'schooling_record',institution:'Escuela sintética',educationLevel:'Primario',course:null,schoolYear:2026,
 issuedOn:null,evidenceMode:pdf?'pdf':'paper_declared',paperReference:pdf?null:'Mesa de entradas sintética',reason:'Registro administrativo sintético',supersedesId,recordedBy:'qa@example.invalid',
};}
export function nativeFamilyRow({other=false,certificate=syntheticAdministrativeCertificate()}={}){
 const row=schoolingFixtureV4(1).data.rows[0],subject=nativeFamilySubject(other);
 return {...row,contractId:subject.contractId,legajo:subject.legajo,employeeName:subject.employeeName,
 familyRef:{kind:'own',id:other?nativeFamilyIds.otherChild:nativeFamilyIds.child},familyName:other?'Otro hijo sintético':'Hijo nativo sintético',
 identityToken:(other?'f':'e').repeat(64),sourceCutoff:null,familyRecordedAt:'2026-09-22T11:00:00Z',declarationState:'declared',
 certificate,historyCount:certificate?1:0,sourceSchooling:null,effectiveDates:{origin:certificate?'manual':'none',presentedOn:certificate?.presentedOn??null,expiresOn:certificate?.expiresOn??null},
 employeeOrigin:'MUNICONTROL',nativeRegistrationId:subject.registrationId,nativeRegisteredAt:subject.registeredAt};
}
export function nativeSchoolingFixture({mixed=true,children=true}={}){
 const payload=schoolingFixtureV4(mixed?2:0);payload.data.version='family-schooling.v5';
 for(const row of payload.data.rows)Object.assign(row,{employeeOrigin:'GRH',nativeRegistrationId:null,nativeRegisteredAt:null});
 if(children)payload.data.rows.push(nativeFamilyRow(),nativeFamilyRow({other:true,certificate:null}));
 if(!mixed)payload.data.scope.sourceCutoffFrom=payload.data.scope.sourceCutoffTo=null;
 return payload;
}
