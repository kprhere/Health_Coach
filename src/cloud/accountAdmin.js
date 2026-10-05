// Logic behind scripts/account.mjs, with the Supabase admin client injected so
// it can be unit-tested. Access codes are printed once and never stored.
import {
  enforceUserLimit, generateAccessCode, isSyntheticEmail, maxUsersFrom, userEmailFor, userTagFromEmail,
} from './accessCode.js';

const isBanned = (u) => !!u.banned_until && Date.parse(u.banned_until) > Date.now();

export async function listCodeUsers(admin) {
  const users = [];
  for (let page = 1; page < 100; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const batch = data.users || [];
    users.push(...batch);
    if (batch.length < 200) break;
  }
  return users.filter((u) => isSyntheticEmail(u.email));
}

const findByTag = async (admin, tag) => {
  const email = userEmailFor(tag);
  return (await listCodeUsers(admin)).find((u) => u.email.toLowerCase() === email) || null;
};

async function removeUserFiles(admin, userId) {
  const bucket = admin.storage.from('uploads');
  const paths = [];
  const walk = async (folder) => {
    const { data, error } = await bucket.list(folder, { limit: 1000 });
    if (error) throw error;
    for (const item of data || []) {
      const p = `${folder}/${item.name}`;
      if (item.id === null || item.id === undefined) await walk(p); else paths.push(p);
    }
  };
  await walk(userId);
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await bucket.remove(paths.slice(i, i + 100));
    if (error) throw error;
  }
  return paths.length;
}

export async function runAccountCommand({
  argv, admin, env = {}, out = console.log, randomBytes, makeSignInClient,
}) {
  const [cmd, arg] = argv;
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const positional = argv.filter((a) => !a.startsWith('--'));

  if (cmd === 'list') {
    const users = await listCodeUsers(admin);
    const max = maxUsersFrom(env.MAX_USERS);
    out(`${users.filter((u) => !isBanned(u)).length}/${max} active users`);
    for (const u of users) {
      out([userTagFromEmail(u.email), u.user_metadata?.label ?? '', u.created_at ?? '', u.last_sign_in_at ?? 'never', isBanned(u) ? 'banned' : 'active'].join('\t'));
    }
    return { users };
  }

  if (cmd === 'create') {
    const label = positional.slice(1).join(' ').trim();
    if (!label) throw new Error('usage: create <label>');
    const users = await listCodeUsers(admin);
    enforceUserLimit({ activeUsers: users.filter((u) => !isBanned(u)).length, max: env.MAX_USERS });
    const taken = new Set(users.map((u) => u.email.toLowerCase()));
    let gen;
    for (let i = 0; i < 10; i += 1) {
      gen = generateAccessCode({ randomBytes });
      if (!taken.has(userEmailFor(gen.userTag))) break;
      gen = null;
    }
    if (!gen) throw new Error('could not find a free user tag');
    const { data, error } = await admin.auth.admin.createUser({
      email: userEmailFor(gen.userTag),
      password: gen.code,
      email_confirm: true,
      user_metadata: { label, userTag: gen.userTag },
    });
    if (error) throw error;
    out(`Created ${gen.userTag} (${label}), user id ${data.user.id}`);
    out('Access code (shown once, store it in a password manager):');
    out(gen.code);
    return { userTag: gen.userTag, userId: data.user.id, code: gen.code };
  }

  if (cmd === 'regenerate') {
    const tag = (positional[1] || '').toUpperCase();
    if (!tag) throw new Error('usage: regenerate <userTag>');
    const user = await findByTag(admin, tag);
    if (!user) throw new Error(`no such user ${tag}`);
    const gen = generateAccessCode({ userTag: tag, randomBytes });
    const { error } = await admin.auth.admin.updateUserById(user.id, { password: gen.code });
    if (error) throw error;
    // Changing the password does not end existing sessions by itself. Sign in
    // once with the new code and revoke every session (global scope): refresh
    // tokens die immediately; an already-issued access token lives until it
    // expires (jwt_expiry, 1 hour).
    let revoked = false;
    if (makeSignInClient) {
      const c = makeSignInClient();
      const { data, error: signInError } = await c.auth.signInWithPassword({ email: userEmailFor(tag), password: gen.code });
      if (signInError) throw signInError;
      const { error: outError } = await admin.auth.admin.signOut(data.session.access_token, 'global');
      if (outError) throw outError;
      revoked = true;
    }
    out(`Regenerated ${tag}. Other sessions ${revoked ? 'were signed out' : 'were NOT signed out (no sign-in client)'}.`);
    out('New access code (shown once):');
    out(gen.code);
    return { userTag: tag, code: gen.code, sessionsRevoked: revoked };
  }

  if (cmd === 'delete') {
    const tag = (positional[1] || '').toUpperCase();
    if (!tag) throw new Error('usage: delete <userTag> --yes');
    const user = await findByTag(admin, tag);
    if (!user) throw new Error(`no such user ${tag}`);
    if (!flags.has('--yes')) {
      out(`Would permanently delete ${tag} (${user.user_metadata?.label ?? ''}), all their records and files. Re-run with --yes.`);
      return { deleted: false };
    }
    const files = await removeUserFiles(admin, user.id);
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw error;
    out(`Deleted ${tag}: removed ${files} file(s); records were removed by cascade.`);
    return { deleted: true, files };
  }

  throw new Error('usage: account.mjs create <label> | regenerate <userTag> | list | delete <userTag> --yes');
}
