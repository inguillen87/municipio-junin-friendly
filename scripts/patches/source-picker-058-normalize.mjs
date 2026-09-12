import fs from 'node:fs';
import crypto from 'node:crypto';
const path='scripts/patches/source-picker-058.b64.1';
let text=fs.readFileSync(path,'utf8');
const fixes=[
 ['4Cb1ZO4ojcTcYT+tkEk86KMSg+8zAvjiw','4Cb1ZO4ojcTcYT+Ik86KMSg+8zAvjiw'],
 ['k86KMSg+8zAvjiw8YAKBNJOu97gw8XS','k86KMSg+8zAvjiwYAKBNJOu97gw8XS'],
 ['L4h/hPIxNjeJMJXKLKLpOILxPwIIWjCK','L4h/hPIxNjeJMJXKLpOILxPwIIWjCK'],
 ['BIrXneaj3XbdfOm42dXl01Rw','BIrXneajzqXbfOm42dXl01Rw']
];
for(const [old,next] of fixes){if(text.split(old).length!==2)throw Error('ASSEMBLY_REPAIR_NOT_UNIQUE');text=text.replace(old,next);}
const joined=text+fs.readFileSync('scripts/patches/source-picker-058.b64.2','utf8');
if(joined.length!==21616||!/^[A-Za-z0-9+/]*={0,2}$/.test(joined))throw Error('ASSEMBLY_ENCODING_MISMATCH');
const bytes=Buffer.from(joined,'base64');
if(crypto.createHash('sha256').update(bytes).digest('hex')!=='698f0853ef376409a9a3d4c66c3c5a39047a46dd2445dd20a81e52d204d395cd')throw Error('ASSEMBLY_HASH_MISMATCH');
fs.writeFileSync('/tmp/source-picker-058.gz',bytes);
