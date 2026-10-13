// Application function metadata only; PG17 and PG18 agreed before this increment.
// No municipal rows, identities or credentials.
export const WORKING_TIME_PRIOR_PINS=Object.freeze([
  {
    "name": "native_salary_administrative_context_v1",
    "signature": "public.native_salary_administrative_context_v1(jsonb)",
    "sha256": "346e45cc443193a34b8f000d988cd8e5b4356ec961173a82df91350fd0159451",
    "argNames": [
      "p"
    ],
    "defaults": "",
    "resultType": "jsonb",
    "language": "plpgsql",
    "returnsSet": false,
    "strict": false,
    "definer": true,
    "volatility": "v",
    "config": [
      "search_path=pg_catalog, public, pg_temp",
      "TimeZone=UTC"
    ],
    "runtime": false
  },
  {
    "name": "native_salary_lock_v1",
    "signature": "public.native_salary_lock_v1(jsonb)",
    "sha256": "f8b368570aeb5b53cade14d65f4709410997509037935aaddd43947ab0febc35",
    "argNames": [
      "ctx"
    ],
    "defaults": "",
    "resultType": "void",
    "language": "plpgsql",
    "returnsSet": false,
    "strict": false,
    "definer": true,
    "volatility": "v",
    "config": [
      "search_path=pg_catalog, public, pg_temp"
    ],
    "runtime": false
  },
  {
    "name": "native_salary_scope_v1",
    "signature": "public.native_salary_scope_v1(jsonb)",
    "sha256": "36fa43fd409b9785b80600bb0f6257aea65b9ace313a0d11db528e9b685b7253",
    "argNames": [
      "ctx"
    ],
    "defaults": "",
    "resultType": "text",
    "language": "sql",
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
    "name": "native_salary_serialized_v1",
    "signature": "public.native_salary_serialized_v1(jsonb)",
    "sha256": "44227bb4f1698c0b525bd4bbd1b529788ccbcb1518a1762bbe96b3d1490a3fff",
    "argNames": [
      "v"
    ],
    "defaults": "",
    "resultType": "text",
    "language": "sql",
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
    "name": "own_program_command_v1",
    "signature": "public.own_program_command_v1(jsonb,jsonb,uuid)",
    "sha256": "703d1172fbac7ac2ef1e305b6576a04662f39d7b7039d09a13658d00f1c092b2",
    "argNames": [
      "p",
      "body",
      "key"
    ],
    "defaults": "",
    "resultType": "jsonb",
    "language": "plpgsql",
    "returnsSet": false,
    "strict": false,
    "definer": true,
    "volatility": "v",
    "config": [
      "search_path=pg_catalog, public, pg_temp",
      "TimeZone=UTC"
    ],
    "runtime": true
  },
  {
    "name": "own_program_definition_v1",
    "signature": "public.own_program_definition_v1(jsonb,jsonb)",
    "sha256": "ba406b2b8b638542783eb6c10ac1bb6c8b99ca9f36b1e47e4a1a0877ea526b10",
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
    "name": "own_program_exact_v1",
    "signature": "public.own_program_exact_v1(jsonb,text[])",
    "sha256": "35e76cb5123f135ac236f4ad8c6fe87b564ceabca64d0ad5c589cb79c97cd096",
    "argNames": [
      "v",
      "fields"
    ],
    "defaults": "",
    "resultType": "boolean",
    "language": "sql",
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
    "name": "own_program_text_v1",
    "signature": "public.own_program_text_v1(jsonb,integer,integer)",
    "sha256": "c822b9615ba27ff69fbfb63f691d506d668c3d80ae99eb11a74c56526406341a",
    "argNames": [
      "v",
      "lo",
      "hi"
    ],
    "defaults": "",
    "resultType": "boolean",
    "language": "sql",
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
    "name": "own_run_capture_v1",
    "signature": "public.own_run_capture_v1(jsonb,jsonb,uuid,text)",
    "sha256": "18061aa38556ee715edf0413b9583cd8717d58717c1cfa0ff24fddc8c778ff6d",
    "argNames": [
      "p",
      "body",
      "key",
      "algorithm"
    ],
    "defaults": "",
    "resultType": "jsonb",
    "language": "plpgsql",
    "returnsSet": false,
    "strict": false,
    "definer": true,
    "volatility": "v",
    "config": [
      "search_path=pg_catalog, public, pg_temp",
      "TimeZone=UTC"
    ],
    "runtime": true
  },
  {
    "name": "own_run_complete_v1",
    "signature": "public.own_run_complete_v1(jsonb,uuid,jsonb,jsonb,text)",
    "sha256": "48a5f51b87f7d1c25af9cd0ceb9f1252ca38ac3918e32f5b28ea72e5426113e3",
    "argNames": [
      "p",
      "capture",
      "input_value",
      "result_value",
      "algorithm"
    ],
    "defaults": "",
    "resultType": "jsonb",
    "language": "plpgsql",
    "returnsSet": false,
    "strict": false,
    "definer": true,
    "volatility": "v",
    "config": [
      "search_path=pg_catalog, public, pg_temp",
      "TimeZone=UTC"
    ],
    "runtime": true
  },
  {
    "name": "own_run_hash_v1",
    "signature": "public.own_run_hash_v1(jsonb)",
    "sha256": "a6c00700c94b5e07fdf49c00c9ea07212239f46a11f4a921b706367e74c66393",
    "argNames": [
      "v"
    ],
    "defaults": "",
    "resultType": "text",
    "language": "sql",
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
    "name": "payroll_fixed_registry_subject_v2",
    "signature": "public.payroll_fixed_registry_subject_v2(jsonb,uuid,boolean)",
    "sha256": "bf3a113d0924b18b9330f11f8b41c445ae6b38a9c5c14d8afae913e34d3f39e7",
    "argNames": [
      "ctx",
      "target",
      "hold_lock"
    ],
    "defaults": "false",
    "resultType": "jsonb",
    "language": "plpgsql",
    "returnsSet": false,
    "strict": false,
    "definer": true,
    "volatility": "v",
    "config": [
      "search_path=pg_catalog, public, pg_temp"
    ],
    "runtime": false
  }
]);
export const WORKING_TIME_CONSUMER_DEFINITION_HASHES=Object.freeze([
  {
    "name": "own_program_command_v1",
    "signature": "p jsonb, body jsonb, key uuid",
    "sha256": "200e29dc86953e11a2bf20989963cb9745a373071f62ce7bcd40a0317301eeea"
  },
  {
    "name": "own_program_definition_v1",
    "signature": "p jsonb, items jsonb",
    "sha256": "f7d76a6349fb46f31cd7f4fa18a5ca7a59a6e8369df3524f13f4120bd06c9786"
  },
  {
    "name": "own_run_capture_v1",
    "signature": "p jsonb, body jsonb, key uuid, algorithm text",
    "sha256": "5fb16fde53f0241f8644eefdc748d076324f700c6474465e0b7dfab622b378c5"
  },
  {
    "name": "own_run_complete_v1",
    "signature": "p jsonb, capture uuid, input_value jsonb, result_value jsonb, algorithm text",
    "sha256": "0c6538520c2c5ad24ffda8c36da0834262bc526742b794a0ef48c9747f61d090"
  }
]);
