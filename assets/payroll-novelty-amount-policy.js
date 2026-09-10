// Missing amount remains empty/null, never zero. Forced entries keep their existing controls.
export function amountEntryPolicy({manual=false,forced=false,value=''}){return {enabled:Boolean(manual||forced),required:Boolean(forced),rawValue:manual||forced?String(value):''}}
