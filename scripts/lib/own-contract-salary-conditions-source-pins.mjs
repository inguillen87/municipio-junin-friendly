// Reviewed application metadata, equal on existing PG17 and PG18. No municipal rows.
export const CONDITIONS_CONSUMER_PRIOR_PINS=Object.freeze([
  {
    "name": "own_program_command_v1",
    "signature": "public.own_program_command_v1(jsonb,jsonb,uuid)",
    "sha256": "1181481ba8a19b244d51559531542a1051e47adb7690c5cabdadcd5ece367e93",
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
    "sha256": "56a4396ad93f7f5e9652f78b24970dd6cf7e3731cb772ef8e1c3d418497f988b",
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
    "name": "own_run_capture_v1",
    "signature": "public.own_run_capture_v1(jsonb,jsonb,uuid,text)",
    "sha256": "60c5d7ebf6bfc2fa7eb83fbaa4ac64e9381c70b41ed35fd18057ef326ffe8ef7",
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
    "name": "own_program_node_v2",
    "signature": "public.own_program_node_v2(jsonb,integer)",
    "sha256": "7b24738403603fd1795e0d69494c1865fcbe5d278006d6bd309a722178bd2dba",
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
    "name": "own_program_unit_v2",
    "signature": "public.own_program_unit_v2(jsonb,jsonb,text,text,text,text[],integer)",
    "sha256": "13458f34e1656cd90cc2f4e139939b80688d34407f7486dd0a5fca5d523599ba",
    "argNames": [
      "n",
      "rules",
      "agreement",
      "period",
      "kind_type",
      "path_codes",
      "depth"
    ],
    "defaults": "0",
    "resultType": "text",
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
  }
]);
