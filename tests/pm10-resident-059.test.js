// Resident collector runs on a municipal host, never inside a Vercel function.
import '../services/pm10/tests/resident.test.mjs';
import '../services/pm10/vendor/tests/original.test.mjs';
import '../services/pm10/vendor/tests/regression.test.mjs';
