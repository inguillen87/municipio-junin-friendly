import {createNativeLeaveHandler} from './internal-native-leave.js';
import {nativeSelfLeaveOperation,nativeSelfError} from '../lib/internal-native-self.js';
export const config={api:{bodyParser:false}};
export function createNativeSelfLeaveHandler(deps={}){return createNativeLeaveHandler({...deps,selfService:true,operation:nativeSelfLeaveOperation,errorFor:nativeSelfError});}
export default createNativeSelfLeaveHandler();
