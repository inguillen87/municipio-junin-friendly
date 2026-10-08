// Capacity is cluster-wide. A single database size is not a Neon storage budget.
export const SOURCE_CAPACITY_QUERY=`SELECT pg_database_size(current_database())::text AS database_bytes,
 (SELECT sum(pg_database_size(oid)) FROM pg_database)::text AS cluster_bytes,
 current_setting('neon.project_id',true) AS neon_project_id,
 CASE WHEN nullif(current_setting('neon.max_cluster_size',true),'') IS NULL THEN NULL
  ELSE pg_size_bytes(current_setting('neon.max_cluster_size'))::text END AS enforced_limit_bytes`;
const integer=v=>{if(!/^[0-9]+$/.test(String(v)))throw Error('GRH_VERSION_CAPACITY_INVALID');const n=Number(v);if(!Number.isSafeInteger(n))throw Error('GRH_VERSION_CAPACITY_INVALID');return n;};
export function sourceCapacity(snapshot,budget,requiredGrowthBytes=budget.maximumGrowthBytes){
 const databaseBytes=integer(snapshot?.database_bytes),clusterBytes=integer(snapshot?.cluster_bytes);
 for(const n of [budget?.maximumDatabaseBytes,budget?.reserveBytes,requiredGrowthBytes])if(!Number.isSafeInteger(n)||n<0)throw Error('GRH_VERSION_CAPACITY_INVALID');
 if(databaseBytes<1||clusterBytes<databaseBytes||budget.maximumDatabaseBytes<=budget.reserveBytes)throw Error('GRH_VERSION_CAPACITY_INVALID');
 // The provider can narrow the application budget. A missing Neon limit is not
 // evidence of unlimited storage; standalone PostgreSQL uses the explicit budget.
 if(snapshot.neon_project_id&&snapshot.enforced_limit_bytes==null)throw Error('GRH_VERSION_CAPACITY_INVALID');
 const enforced=snapshot.enforced_limit_bytes==null?budget.maximumDatabaseBytes:integer(snapshot.enforced_limit_bytes);
 if(enforced<1)throw Error('GRH_VERSION_CAPACITY_INVALID');
 const maximumBytes=Math.min(budget.maximumDatabaseBytes,enforced);
 const afterReserveBytes=maximumBytes-budget.reserveBytes-clusterBytes;
 return Object.freeze({scope:'all_databases_including_templates',databaseBytes,clusterBytes,requiredGrowthBytes,
  maximumBytes,reserveBytes:budget.reserveBytes,afterReserveBytes,
  fits:afterReserveBytes>=requiredGrowthBytes});
}
export async function readSourceCapacity(client,budget,requiredGrowthBytes){
 const result=await client.query(SOURCE_CAPACITY_QUERY);
 if(result.rows?.length!==1)throw Error('GRH_VERSION_CAPACITY_INVALID');
 return sourceCapacity(result.rows[0],budget,requiredGrowthBytes);
}
