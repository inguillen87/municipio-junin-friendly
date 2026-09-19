import {legalContext,legalFail} from './internal-legal-registry.js';
import {documentaryInput,verifyDocumentaryReview} from '../assets/legal-documentary-review.js';
export async function documentaryReview(sql,principal,session,input){
 const context=legalContext(principal,session),selected=documentaryInput(input?.filter,input?.page);
 const result=await sql.query('SELECT public.legal_documentary_review_v1($1::jsonb,$2::jsonb) AS result',[JSON.stringify(context),JSON.stringify(selected)]);
 const data=(Array.isArray(result)?result:result?.rows)?.[0]?.result;
 try{verifyDocumentaryReview(data);if(data.filter!==selected.filter||data.page!==selected.page)throw Error('RESPONSE_SCOPE');}catch{legalFail('UNAVAILABLE');}
 return data;
}
