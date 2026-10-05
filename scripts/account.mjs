#!/usr/bin/env node
// Manage access-code accounts.
//   node scripts/account.mjs create <label>
//   node scripts/account.mjs regenerate <userTag>
//   node scripts/account.mjs list
//   node scripts/account.mjs delete <userTag> --yes
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment (never
// commit them). Optional: MAX_USERS (default 5), SUPABASE_ANON_KEY.
import { createClient } from '@supabase/supabase-js';
import { runAccountCommand } from '../src/cloud/accountAdmin.js';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your shell first.');
  process.exit(2);
}
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, opts);
const { randomBytes } = await import('node:crypto');

try {
  await runAccountCommand({
    argv: process.argv.slice(2),
    admin,
    env: process.env,
    randomBytes: (n) => new Uint8Array(randomBytes(n)),
    makeSignInClient: () => createClient(SUPABASE_URL, SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE_KEY, opts),
  });
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
