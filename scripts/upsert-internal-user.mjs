import { neon } from '@neondatabase/serverless';
import { hashInternalPassword } from '../lib/internal-password.js';

const databaseUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
const email = String(process.env.INTERNAL_ADMIN_EMAIL || '').trim().toLowerCase();
const password = String(process.env.INTERNAL_ADMIN_PASSWORD || '');
const displayName = String(process.env.INTERNAL_ADMIN_NAME || 'Administrador interno').trim();

if (!databaseUrl) throw new Error('Falta DATABASE_URL_UNPOOLED o DATABASE_URL');
if (!email || !password) throw new Error('Faltan INTERNAL_ADMIN_EMAIL o INTERNAL_ADMIN_PASSWORD');

const sql = neon(databaseUrl);
const passwordHash = await hashInternalPassword(password);
await sql`
  INSERT INTO internal_users (email, display_name, role, password_hash, active, updated_at)
  VALUES (${email}, ${displayName}, 'ADMIN_INTERNO', ${passwordHash}, true, now())
  ON CONFLICT (email) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    role = EXCLUDED.role,
    password_hash = EXCLUDED.password_hash,
    active = true,
    updated_at = now()
`;

const [user] = await sql`
  SELECT email, display_name, role, active
  FROM internal_users
  WHERE email = ${email}
`;

if (!user?.active) throw new Error('No se pudo activar el usuario interno');
console.log(`Usuario interno listo: ${user.email} (${user.role})`);
