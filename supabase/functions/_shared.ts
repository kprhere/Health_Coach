// Shared helpers for the Edge Functions (Deno runtime).
// NOT RUN LIVE: written against the documented Supabase Edge Functions API.
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// Verifies the caller's JWT with Supabase Auth and returns a client that acts
// AS the caller (so RLS applies to everything the function reads or writes).
export async function authenticate(req: Request): Promise<{ user: { id: string }; db: SupabaseClient } | Response> {
  const header = req.headers.get('Authorization') ?? '';
  if (!header.toLowerCase().startsWith('bearer ')) return json({ error: 'missing bearer token' }, 401);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: header } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.auth.getUser(header.slice(7));
  if (error || !data.user) return json({ error: 'invalid token' }, 401);
  return { user: data.user, db };
}
