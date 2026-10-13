// Exact installed code/metadata only. No identities, data or connection.
export const CLASSIFICATION_USE_PRIOR_PINS=[
  {
    "name": "native_employee_create_v1",
    "signature": "public.native_employee_create_v1(jsonb,jsonb,text,uuid)",
    "sha256": "8fac07fa37367cd2c4a2aa25dccb7b145fc4eafe934c6cd86e12f5081dec7261",
    "argNames": [
      "p",
      "d",
      "catalog_version",
      "k"
    ],
    "defaults": "",
    "resultType": "jsonb",
    "language": "plpgsql",
    "returnsSet": false,
    "strict": false,
    "definer": true,
    "volatility": "v",
    "config": [
      "search_path=public, pg_temp"
    ],
    "runtime": true
  },
  {
    "name": "native_employment_catalog_bootstrap_v1",
    "signature": "public.native_employment_catalog_bootstrap_v1(jsonb)",
    "sha256": "a7134c8a172a514f31883bc2b5eae7412d49c85c023ea970007a90c080f79030",
    "argNames": [
      "ctx"
    ],
    "defaults": "",
    "resultType": "jsonb",
    "language": "plpgsql",
    "returnsSet": false,
    "strict": false,
    "definer": true,
    "volatility": "v",
    "config": [
      "search_path=pg_catalog, public, pg_temp"
    ],
    "runtime": true
  },
  {
    "name": "native_employment_catalog_context_v1",
    "signature": "public.native_employment_catalog_context_v1(jsonb,text)",
    "sha256": "37d7be04b2f5f3c5b5eb13ad7fc824e8823c7da44bfe45750f617961a79b5798",
    "argNames": [
      "p",
      "required_capability"
    ],
    "defaults": "NULL::text",
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
  },
  {
    "name": "native_employment_catalog_items_v1",
    "signature": "public.native_employment_catalog_items_v1(jsonb)",
    "sha256": "89524aaf57c46d3def1c4e8ff0b4e31bf218b1a7b676dcfe22663ee812924141",
    "argNames": [
      "raw_items"
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
    "name": "native_employment_catalog_can_review_v1",
    "signature": "public.native_employment_catalog_can_review_v1(jsonb,public.native_employment_catalog_proposal)",
    "sha256": "91dd8b1bc84772d07e426ac9e0e5501ee811e7e1e4404961bf0b6a4bc6320a9e",
    "argNames": [
      "ctx",
      "p"
    ],
    "defaults": "",
    "resultType": "boolean",
    "language": "sql",
    "returnsSet": false,
    "strict": false,
    "definer": true,
    "volatility": "s",
    "config": [
      "search_path=pg_catalog, public, pg_temp"
    ],
    "runtime": false
  }
];
export const CLASSIFICATION_USE_FINAL_HASHES={
  "native_employee_create_v1": "6cf784e1b026c158548692c84c000592919a26f6aa42109807c0687f943158d6",
  "native_employment_catalog_bootstrap_v1": "2622fba8bd03c7e11baa9bfe7fbe1d9cc660d1f654251ca6ac2a2f7932d53f43",
  "native_employment_catalog_context_v1": "939dc2cc92b03ab045b23c3178c05a79bbaa6284a3997fc3f00c230e84b665c0",
  "native_employment_catalog_items_v1": "30aa07e730091240796987fa7c699bf0962308944ba34202ee0051ec4eefb697",
  "native_employment_catalog_can_review_v1": "7c56c24e36bbe84201c07d014addd9c12ac2cc7219dc196b7d8785c6e6f551b5"
};
export const CLASSIFICATION_USE_ADMINISTRATIVE_PIN={
  "name": "employment_adoption_administrative_context_v1",
  "signature": "public.employment_adoption_administrative_context_v1(jsonb,text)",
  "sha256": "45c74402dff395e2795b525a16136150171964ec73d9bb3be830ac1ff8a1e12a",
  "argNames": [
    "p",
    "required_capability"
  ],
  "defaults": "NULL::text",
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
};
