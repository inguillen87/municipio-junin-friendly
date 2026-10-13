// Canonical metadata for the four existing validators; never connects.
export const DAY_UNIT_PRIOR_PINS=Object.freeze([
  {
    "name": "native_salary_items_v1",
    "signature": "public.native_salary_items_v1(jsonb)",
    "sha256": "8409426d8df00e55740bc5d470f3005fdf1980ea04b0a5b7530373d57f5d0505",
    "argNames": [
      "items"
    ],
    "defaults": "",
    "resultType": "jsonb",
    "language": "plpgsql",
    "returnsSet": false,
    "strict": false,
    "definer": true,
    "volatility": "i",
    "config": [
      "search_path=pg_catalog, public, pg_temp"
    ],
    "runtime": false
  },
  {
    "name": "own_program_definition_v1",
    "signature": "public.own_program_definition_v1(jsonb,jsonb)",
    "sha256": "8fd400ab77ecda59800ac84658fd04d9f0de15289ee590ffd65df33a7dd62bc7",
    "argNames": [
      "p",
      "items"
    ],
    "defaults": "",
    "resultType": "jsonb",
    "language": "plpgsql",
    "returnsSet": false,
    "strict": false,
    "definer": true,
    "volatility": "i",
    "config": [
      "search_path=pg_catalog, public, pg_temp"
    ],
    "runtime": false
  },
  {
    "name": "own_program_node_v1",
    "signature": "public.own_program_node_v1(jsonb,integer)",
    "sha256": "779c949330a4c63c8c457e2e6be5511593ea66143fafd902e62797f92dd94d40",
    "argNames": [
      "n",
      "depth"
    ],
    "defaults": "0",
    "resultType": "jsonb",
    "language": "plpgsql",
    "returnsSet": false,
    "strict": false,
    "definer": true,
    "volatility": "i",
    "config": [
      "search_path=pg_catalog, public, pg_temp"
    ],
    "runtime": false
  },
  {
    "name": "own_program_node_v2",
    "signature": "public.own_program_node_v2(jsonb,integer)",
    "sha256": "7819a1d138f0b4be82b32be07f645b7fb670e01c36bfcc156f21631e573e7270",
    "argNames": [
      "n",
      "depth"
    ],
    "defaults": "0",
    "resultType": "jsonb",
    "language": "plpgsql",
    "returnsSet": false,
    "strict": false,
    "definer": true,
    "volatility": "i",
    "config": [
      "search_path=pg_catalog, public, pg_temp"
    ],
    "runtime": false
  }
]);
export const DAY_UNIT_FINAL_HASHES=Object.freeze({
  "native_salary_items_v1": "d2c7ffee8ac2c26c66075a7a093350be30ebc89656a914d73c237a78e6c852e4",
  "own_program_definition_v1": "56a4396ad93f7f5e9652f78b24970dd6cf7e3731cb772ef8e1c3d418497f988b",
  "own_program_node_v1": "780a469d81a559d68e7bb53b31ace84487dd1a28ddd8efbd9f99f244415ba0da",
  "own_program_node_v2": "7b24738403603fd1795e0d69494c1865fcbe5d278006d6bd309a722178bd2dba"
});
