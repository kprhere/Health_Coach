// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';

import AccountPanel from '../src/features/account/AccountPanel.jsx';
import LoginScreen from '../src/features/account/LoginScreen.jsx';
import MoveDataFlow from '../src/features/account/MoveDataFlow.jsx';
import { defaultState } from '../src/helpers.js';

afterEach(() => { cleanup(); try { localStorage.clear(); } catch { /* ignore */ } });

const GOOD = `ABCDEF-${'A'.repeat(24)}`;
const session = { userId: 'acct-1', userTag: 'ABCDEF', expiresAt: 9e9 };
const baseCloud = (over = {}) => ({
  status: 'synced', pendingCount: 0, conflicts: [], lastSyncAt: Date.parse('2026-03-04T10:00:00Z'), error: null, session,
  login: vi.fn(), logout: vi.fn(async () => ({ ok: true })), syncNow: vi.fn(async () => ({ ok: true })),
  resolveConflict: vi.fn(async () => ({ ok: true })), canSwitchAccount: vi.fn(), readRemote: vi.fn(async () => []), ...over,
});

const dayState = (days) => {
  const s = defaultState();
  for (const [d, water] of Object.entries(days)) s.mealLogs[d] = { eaten: {}, extras: [], water, flags: {} };
  return s;
};

describe('AccountPanel', () => {
  test('states the privacy position: not end-to-end encrypted, Cloudflare sync is independent', () => {
    render(<AccountPanel enabled cloud={baseCloud()} accountInfo={{ label: 'Test person', userTag: 'ABCDEF' }} listSnapshotsFn={() => []} />);
    expect(screen.getByText(/not end-to-end encrypted/i)).toBeTruthy();
    expect(screen.getByText(/can read them/i)).toBeTruthy();
    expect(screen.getByText(/older encrypted Cloudflare sync is a separate, independent backup/i)).toBeTruthy();
  });

  test('flag off: says accounts are not enabled, offers no sign in, never fakes a login', () => {
    render(<AccountPanel enabled={false} cloud={null} onOpenLogin={vi.fn()} listSnapshotsFn={() => []} />);
    expect(screen.getByText(/accounts are not enabled on this install/i)).toBeTruthy();
    expect(screen.getByText(/SETUP_SUPABASE/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /sign in/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /sign out/i })).toBeNull();
    expect(screen.getByText('Saved on device')).toBeTruthy();
  });

  test('status labels: pending, synced, offline, local save failure, and last sync time', () => {
    const { rerender } = render(<AccountPanel enabled cloud={baseCloud({ status: 'pending', pendingCount: 3 })} listSnapshotsFn={() => []} />);
    expect(screen.getByText('Pending sync (3)')).toBeTruthy();
    expect(screen.getByText(/Last synced/)).toBeTruthy();
    rerender(<AccountPanel enabled cloud={baseCloud()} listSnapshotsFn={() => []} />);
    expect(screen.getByText('Synced')).toBeTruthy();
    rerender(<AccountPanel enabled cloud={baseCloud({ status: 'offline', pendingCount: 2 })} listSnapshotsFn={() => []} />);
    expect(screen.getByText(/Offline: 2 changes waiting/)).toBeTruthy();
    rerender(<AccountPanel enabled saveStatus="failed" cloud={baseCloud()} listSnapshotsFn={() => []} />);
    expect(screen.getByText('Save failed')).toBeTruthy();
  });

  const conflict = (over = {}) => ({
    id: 'c:op-1', opId: 'op-1', collection: 'mealLogs', key: '2026-03-01',
    local: { data: { water: 1 } }, server: { data: { water: 9 }, version: 2 }, ...over,
  });

  test('conflicts show both versions and resolve one choice at a time', async () => {
    const user = userEvent.setup();
    const cloud = baseCloud({ status: 'conflict', conflicts: [conflict()] });
    render(<AccountPanel enabled cloud={cloud} listSnapshotsFn={() => []} />);
    expect(screen.getByText(/Needs your decision \(1\)/)).toBeTruthy();
    expect(screen.getByText(/neither version has been overwritten/i)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /keep mine for mealLogs/i }));
    expect(cloud.resolveConflict).toHaveBeenCalledWith('c:op-1', 'local');
    await user.click(screen.getByRole('button', { name: /keep theirs for mealLogs/i }));
    expect(cloud.resolveConflict).toHaveBeenLastCalledWith('c:op-1', 'server');
  });

  test('without a hook resolver the panel calls outbox.resolveConflict directly', async () => {
    const user = userEvent.setup();
    const outbox = { resolveConflict: vi.fn(async () => ({ ok: true })) };
    const cloud = baseCloud({ status: 'conflict', conflicts: [conflict()], resolveConflict: undefined });
    render(<AccountPanel enabled cloud={cloud} outbox={outbox} listSnapshotsFn={() => []} />);
    await user.click(screen.getByRole('button', { name: /keep theirs for/i }));
    expect(outbox.resolveConflict).toHaveBeenCalledWith('c:op-1', 'server');
  });

  test('a failed resolution says nothing was changed', async () => {
    const user = userEvent.setup();
    const cloud = baseCloud({ status: 'conflict', conflicts: [conflict()], resolveConflict: vi.fn(async () => ({ ok: false })) });
    render(<AccountPanel enabled cloud={cloud} listSnapshotsFn={() => []} />);
    await user.click(screen.getByRole('button', { name: /keep mine for/i }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/nothing was changed/i);
  });

  test('deleting the account requires typing DELETE, then calls the callback; copy explains retention', async () => {
    const user = userEvent.setup();
    const onDeleteAccount = vi.fn(async () => ({ ok: true }));
    render(<AccountPanel enabled cloud={baseCloud()} onDeleteAccount={onDeleteAccount} listSnapshotsFn={() => []} />);
    expect(screen.getByText(/30 days/)).toBeTruthy();
    expect(screen.getByText(/uploaded file/i)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /delete my account/i }));
    const confirm = screen.getByRole('button', { name: /permanently delete account/i });
    expect(confirm.disabled).toBe(true);
    await user.type(screen.getByLabelText(/type delete to confirm/i), 'delete');
    expect(confirm.disabled).toBe(true);
    await user.clear(screen.getByLabelText(/type delete to confirm/i));
    await user.type(screen.getByLabelText(/type delete to confirm/i), 'DELETE');
    expect(confirm.disabled).toBe(false);
    expect(onDeleteAccount).not.toHaveBeenCalled();
    await user.click(confirm);
    expect(onDeleteAccount).toHaveBeenCalledTimes(1);
  });

  test('sign out with pending changes warns, and force keeps data on the device', async () => {
    const user = userEvent.setup();
    const logout = vi.fn(async ({ force } = {}) => (force ? { ok: true } : { ok: false, reason: 'pending-changes', pendingCount: 2 }));
    const cloud = baseCloud({ status: 'pending', pendingCount: 2, logout });
    const onSignedOut = vi.fn();
    render(<AccountPanel enabled cloud={cloud} onSignedOut={onSignedOut} listSnapshotsFn={() => []} />);
    await user.click(screen.getByRole('button', { name: /^sign out$/i }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/2 changes have not reached the server/i);
    expect(alert.textContent).toMatch(/stay on this device only/i);
    expect(onSignedOut).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /sign out anyway/i }));
    expect(logout).toHaveBeenLastCalledWith({ force: true });
    expect(onSignedOut).toHaveBeenCalled();
  });

  test('recovery lists snapshots with counts and restores only after confirmation, snapshotting first', async () => {
    const user = userEvent.setup();
    const snaps = [{ key: 'k1', reason: 'before-reset', at: Date.parse('2026-03-01T10:00:00Z'), counts: { workouts: 4, meals: 2, scans: 0 } }];
    const onRestoreSnapshot = vi.fn(async () => ({ ok: true }));
    const snapshotFn = vi.fn(() => 'k-new');
    const state = defaultState();
    render(<AccountPanel enabled={false} state={state} listSnapshotsFn={() => snaps} onRestoreSnapshot={onRestoreSnapshot} snapshotFn={snapshotFn} />);
    expect(screen.getByText(/4 workouts, 2 meal days/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /restore snapshot/i }));
    expect(onRestoreSnapshot).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /yes, restore/i }));
    expect(snapshotFn).toHaveBeenCalledWith('before-restore', state);
    expect(onRestoreSnapshot).toHaveBeenCalledWith('k1');
  });

  test('export backup calls the callback and the empty snapshot state is honest', async () => {
    const user = userEvent.setup();
    const onExport = vi.fn(async () => ({ ok: true }));
    render(<AccountPanel enabled={false} onExport={onExport} listSnapshotsFn={() => []} />);
    expect(screen.getByText(/no snapshots yet/i)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /export backup/i }));
    expect(onExport).toHaveBeenCalled();
  });

  test('an expired session is announced with the keep-your-data message', () => {
    const cloud = baseCloud({ status: 'signed-out', session: null, pendingCount: 1, error: { code: 'session-expired', message: 'Your session ended. Sign in again with your access code.' } });
    render(<AccountPanel enabled cloud={cloud} onOpenLogin={vi.fn()} listSnapshotsFn={() => []} />);
    expect(screen.getByRole('alert').textContent).toMatch(/session ended/i);
    expect(screen.getByText(/Signed out, 1 unsynced/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /sign in with an access code/i })).toBeTruthy();
  });
});

describe('LoginScreen', () => {
  test('a malformed code is rejected locally with no login call', async () => {
    const user = userEvent.setup();
    const cloud = baseCloud({ session: null, status: 'signed-out' });
    render(<LoginScreen cloud={cloud} />);
    await user.type(screen.getByLabelText('Access code'), 'not-a-code');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/does not look like an access code/i);
    expect(cloud.login).not.toHaveBeenCalled();
  });

  test('the code is masked, can be revealed, is never persisted, and is cleared on success', async () => {
    const user = userEvent.setup();
    const onSignedIn = vi.fn();
    const cloud = baseCloud({ session: null, status: 'signed-out', login: vi.fn(async () => ({ ok: true, accountId: 'acct-1', userTag: 'ABCDEF' })) });
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    render(<LoginScreen cloud={cloud} onSignedIn={onSignedIn} />);
    const input = screen.getByLabelText('Access code');
    expect(input.getAttribute('type')).toBe('password');
    await user.click(screen.getByRole('button', { name: /show access code/i }));
    expect(input.getAttribute('type')).toBe('text');
    await user.click(screen.getByRole('button', { name: /hide access code/i }));
    await user.click(input);
    await user.paste(`  ${GOOD.toLowerCase()} `);
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));
    await waitFor(() => expect(onSignedIn).toHaveBeenCalled());
    expect(cloud.login).toHaveBeenCalledTimes(1);
    expect(input.value).toBe('');
    expect(setItem.mock.calls.flat().join(' ')).not.toContain('AAAAAAAA');
    expect(document.body.textContent).not.toContain('AAAAAAAAAAAAAAAAAAAAAAAA');
    setItem.mockRestore();
  });

  test.each([
    ['invalid-credentials', /ask the owner for a new code/i],
    ['locked', /locked or its code was replaced.*new code/i],
    ['network', /could not reach the server/i],
    ['offline', /you are offline/i],
    ['pending-changes', /have not synced yet/i],
  ])('error state %s is clear and does not echo the code', async (error, pattern) => {
    const user = userEvent.setup();
    const cloud = baseCloud({ session: null, status: 'signed-out', login: vi.fn(async () => ({ ok: false, error })) });
    render(<LoginScreen cloud={cloud} />);
    await user.type(screen.getByLabelText('Access code'), GOOD);
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(pattern);
    expect(alert.textContent).not.toContain(GOOD);
  });

  test('says signing in uploads nothing, and shows the expired-session message', () => {
    const cloud = baseCloud({ session: null, status: 'signed-out', error: { code: 'session-expired', message: 'Your session ended. Sign in again.' } });
    render(<LoginScreen cloud={cloud} />);
    expect(screen.getByText(/does not upload anything/i)).toBeTruthy();
    expect(screen.getByText(/session ended/i)).toBeTruthy();
  });

  test('flag off: no form, no fake login', () => {
    render(<LoginScreen cloud={baseCloud({ status: 'disabled', session: null })} />);
    expect(screen.getByText(/accounts are not enabled on this install/i)).toBeTruthy();
    expect(screen.queryByLabelText('Access code')).toBeNull();
  });
});

describe('MoveDataFlow', () => {
  const destination = { accountId: 'acct-1', label: 'Test person', userTag: 'ABCDEF' };
  const rec = (collection, key, data) => ({ collection, key, data, version: 1, deletedAt: null });
  const mount = (over = {}) => {
    const localState = over.localState || dayState({ '2026-03-01': 1, '2026-03-02': 2 });
    const cloud = baseCloud({ readRemote: vi.fn(async () => over.remote || []), ...(over.cloud || {}) });
    const props = {
      localState, destination, destStore: { accountId: 'acct-1' }, cloud, onComplete: vi.fn(), onCancel: vi.fn(), onExport: vi.fn(async () => ({ ok: true })),
      snapshotFn: vi.fn(() => 'snap'), runner: vi.fn(async () => ({ ok: true, completion: { accountId: 'acct-1', completedAt: 1, counts: {} }, copied: 3, skipped: [] })),
      ...over.props,
    };
    render(<MoveDataFlow {...props} />);
    return props;
  };
  const confirmBox = () => screen.getByLabelText(/copy my on-device data/i);

  test('preview shows the destination, both sets of counts, and needs confirmation', async () => {
    const props = mount({ remote: [] });
    expect(await screen.findByRole('table')).toBeTruthy();
    expect(screen.getAllByText(/Test person/).length).toBeGreaterThan(0);
    const row = screen.getByRole('row', { name: /meal days/i });
    expect(within(row).getAllByRole('cell').map((c) => c.textContent)).toEqual(['2', '0']);
    const start = screen.getByRole('button', { name: /move my data/i });
    expect(start.disabled).toBe(true);
    await userEvent.setup().click(confirmBox());
    expect(start.disabled).toBe(false);
    expect(props.runner).not.toHaveBeenCalled();
    expect(props.onComplete).not.toHaveBeenCalled();
  });

  test('refuses a populated account of unknown owner; merge needs an explicit extra choice', async () => {
    const user = userEvent.setup();
    const props = mount({ remote: [rec('mealLogs', '2025-12-01', { water: 5 })] });
    expect((await screen.findByRole('alert')).textContent).toMatch(/already holds data/i);
    expect(screen.getByText(/replacing it is not offered/i)).toBeTruthy();
    await user.click(confirmBox());
    const start = screen.getByRole('button', { name: /move my data/i });
    expect(start.disabled).toBe(true);
    await user.click(screen.getByLabelText(/this is my account/i));
    expect(start.disabled).toBe(false);
    await user.click(start);
    await waitFor(() => expect(props.runner).toHaveBeenCalled());
    expect(props.runner.mock.calls[0][0].allowMerge).toBe(true);
  });

  test('requires signing in to the destination first', async () => {
    const props = mount({ cloud: { session: { userId: 'someone-else', userTag: 'ZZZZZZ' } } });
    expect((await screen.findByRole('alert')).textContent).toMatch(/sign in to test person first/i);
    expect(props.cloud.readRemote).not.toHaveBeenCalled();
  });

  test('verification mismatch: not marked complete, local data untouched, recovery options shown', async () => {
    const user = userEvent.setup();
    const localState = dayState({ '2026-03-01': 1 });
    const before = JSON.stringify(localState);
    const runner = vi.fn(async () => ({ ok: false, code: 'verify-mismatch', mismatchCount: 2, queued: 3 }));
    const props = mount({ localState, props: { runner } });
    await screen.findByRole('table');
    await user.click(confirmBox());
    await user.click(screen.getByRole('button', { name: /move my data/i }));
    expect(await screen.findByText(/NOT marked complete/i)).toBeTruthy();
    expect(props.onComplete).not.toHaveBeenCalled();
    expect(JSON.stringify(localState)).toBe(before);
    expect(screen.getByText(/on-device data is untouched/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /review and retry/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /export a backup/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /stay on this device/i })).toBeTruthy();
    expect(screen.queryByText(/moved and verified/i)).toBeNull();
  });

  test('success: onComplete is called only after the runner has verified and returned', async () => {
    const user = userEvent.setup();
    let release;
    const gate = new Promise((r) => { release = r; });
    const completion = { accountId: 'acct-1', completedAt: 5, counts: { meals: 2 } };
    const runner = vi.fn(async ({ onProgress }) => {
      onProgress({ step: 'copy', done: 1, of: 2 });
      await gate;
      onProgress({ step: 'verify' });
      return { ok: true, completion, copied: 3, skipped: [] };
    });
    const props = mount({ props: { runner } });
    await screen.findByRole('table');
    await user.click(confirmBox());
    await user.click(screen.getByRole('button', { name: /move my data/i }));
    await screen.findByLabelText('Move progress');
    expect(props.onComplete).not.toHaveBeenCalled();
    release();
    await waitFor(() => expect(props.onComplete).toHaveBeenCalledWith(completion));
    expect(screen.getByText(/moved and verified/i)).toBeTruthy();
    expect(screen.getByText(/not deleted/i)).toBeTruthy();
    expect(props.onComplete).toHaveBeenCalledTimes(1);
  });

  test('a safety-snapshot failure asks for an export; after exporting a retry may proceed without it', async () => {
    const user = userEvent.setup();
    const runner = vi.fn()
      .mockResolvedValueOnce({ ok: false, code: 'snapshot-failed' })
      .mockResolvedValueOnce({ ok: true, completion: { accountId: 'acct-1', completedAt: 1, counts: {} }, copied: 1, skipped: [] });
    const props = mount({ props: { runner } });
    await screen.findByRole('table');
    await user.click(confirmBox());
    await user.click(screen.getByRole('button', { name: /move my data/i }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/safety snapshot could not be saved/i);
    await user.click(screen.getByRole('button', { name: /export a backup/i }));
    expect(props.onExport).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /review and retry/i }));
    await screen.findByRole('table');
    if (!confirmBox().checked) await user.click(confirmBox());
    await user.click(screen.getByRole('button', { name: /move my data/i }));
    await waitFor(() => expect(props.onComplete).toHaveBeenCalled());
    expect(runner.mock.calls[1][0].allowNoSnapshot).toBe(true);
  });
});
