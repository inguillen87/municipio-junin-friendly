// The same explicit cases are the pending PostgreSQL laboratory matrix. These
// fixtures do not emulate PostgreSQL or claim that SQL has been executed.
const point=n=>String.fromCodePoint(n),hex=n=>'U+'+n.toString(16).toUpperCase().padStart(4,'0');
export const employmentTitleTrimCodePoints=[9,10,11,12,13,32,160,5760,...Array.from({length:11},(_,i)=>8192+i),8232,8233,8239,8287,12288,65279];
export const employmentTitleUnicodeCases=[
 {name:'undeclared null',value:null,accepted:true},
 {name:'composed NFC title',value:'Técnico de sistemas',accepted:true},
 {name:'120 BMP units',value:'á'.repeat(120),accepted:true},
 {name:'121 BMP units',value:'á'.repeat(121),accepted:false},
 {name:'60 supplementary characters, 120 UTF16 units',value:'😀'.repeat(60),accepted:true},
 {name:'61 supplementary characters, 122 UTF16 units',value:'😀'.repeat(61),accepted:false},
 {name:'decomposed non-NFC title',value:'Te\u0301cnico',accepted:false},
 {name:'empty title',value:'',accepted:false},
 {name:'markup',value:'<Cargo>',accepted:false},
 {name:'unpaired high surrogate',value:'\ud800',accepted:false,postgresRepresentation:'rejected by jsonb/text'},
 {name:'unpaired low surrogate',value:'\udfff',accepted:false,postgresRepresentation:'rejected by jsonb/text'},
 {name:'NUL in text',value:'A\u0000B',accepted:false,postgresRepresentation:'rejected by jsonb/text'},
 ...employmentTitleTrimCodePoints.flatMap(cp=>[
  {name:hex(cp)+' leading whitespace',value:point(cp)+'Cargo',accepted:false},
  {name:hex(cp)+' trailing whitespace',value:'Cargo'+point(cp),accepted:false},
 ]),
 ...[0x00a0,0x1680,0x2002,0x2028,0x2029,0x202f,0x205f,0x3000,0xfeff].map(cp=>({name:hex(cp)+' interior NFC spacing',value:'A'+point(cp)+'B',accepted:true})),
 ...[0x2000,0x2001].map(cp=>({name:hex(cp)+' interior spacing has a canonical NFC replacement',value:'A'+point(cp)+'B',accepted:false})),
 ...[0x0009,0x000a,0x001f,0x007f,0x0085,0x009f,0x202a,0x202e,0x2066,0x2069].map(cp=>({name:hex(cp)+' forbidden interior control/bidi',value:'A'+point(cp)+'B',accepted:false})),
 ...[0x180e,0x200b].map(cp=>({name:hex(cp)+' is not ECMAScript trim whitespace',value:point(cp)+'Cargo'+point(cp),accepted:true})),
];
