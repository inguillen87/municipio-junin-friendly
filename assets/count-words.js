// «1 legajo», «2 legajos»: un conteo de uno se lee en singular. El número se muestra tal como llega.
export const countWords=(n,one,many)=>n+' '+(Number(n)===1?one:many);
