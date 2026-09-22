// Approved aggregate fingerprints. These profiles are evidence expectations,
// never derived from whichever response the server happens to return.
export const FRIENDLY_SOURCE_PROFILES = Object.freeze({
 'september-2026':Object.freeze({name:'S11 / 10-09-2026',cutoff:'2026-09-10',sha256:'5a604acfe5ea32832b630d8aab29e494038d4c8940b231e283a53d14112665c7',historicalRecords:2452,activeProxy:875,absenceEvents:31702,absence2026:1688,affected2026:596,currentHires:283,currentExits:241,payrollSnapshot:847,lastClosedMonth:'2026-08-01',currentOpenMonth:'2026-09-01'}),
 'august-2026':Object.freeze({name:'Approved August regression',cutoff:'2026-08-06',sha256:'cb5c60a0e5dd2462ab7d5e89ba4fe9b7f57b9283aeeb0f89f7c8918730359e92',historicalRecords:2450,activeProxy:882,absenceEvents:31572,absence2026:1559,affected2026:590,currentHires:281,currentExits:232,payrollSnapshot:854,lastClosedMonth:'2026-07-01',currentOpenMonth:'2026-08-01'}),
});
export function friendlySourceProfile(name='september-2026'){
 const profile=FRIENDLY_SOURCE_PROFILES[name];if(!profile)throw Error('Unknown Friendly source profile');
 const elapsedDays=(Date.parse(profile.cutoff+'T00:00:00Z')-Date.parse('2023-12-09T00:00:00Z'))/86400000+1;
 return{...profile,elapsedDays,previousComparableTo:new Date(Date.parse('2019-12-10T00:00:00Z')+(elapsedDays-1)*86400000).toISOString().slice(0,10)};
}
export function renderedNumberPattern(value){
 if(!Number.isFinite(Number(value)))throw Error('Expected a finite rendered number');
 const [whole,fraction]=String(value).split('.');
 const grouped=whole.replace(/\B(?=(\d{3})+(?!\d))/g,'[.\\s]?');
 return new RegExp('(?<![0-9])'+grouped+(fraction?'[,.]'+fraction:'')+'(?![0-9])');
}
