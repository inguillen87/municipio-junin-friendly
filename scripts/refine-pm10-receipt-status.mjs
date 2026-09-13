// Keep the unpublished clock-delta prototype's SQL reader untouched.
import fs from 'node:fs';
for(const file of ['lib/internal-pm10-status.js','scripts/migrations/055-pm10-continuous-reception.sql']){
 const source=fs.readFileSync(file,'utf8');
 if(source.includes('attendance_pm10_receipt_status_v1')){if(source.includes('attendance_pm10_status_v1'))throw Error('PM10_STATUS_PARTIAL_RENAME');continue;}
 if(!source.includes('attendance_pm10_status_v1'))throw Error('PM10_STATUS_SOURCE_DRIFT');
 fs.writeFileSync(file,source.replaceAll('attendance_pm10_status_v1','attendance_pm10_receipt_status_v1'));
}
