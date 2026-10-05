// @vitest-environment jsdom
import React, { useState } from 'react';
import { cleanup, render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { addDays } from '../src/helpers.js';
import { generateProposals, recordProposals } from '../src/coach/proposals.js';
import CoachTab from '../src/features/coach/CoachTab.jsx';
import SessionLoadInputs from '../src/features/coach/SessionLoadInputs.jsx';
import { ASOF, NOW_MS, baseState, session, withSessions, work, setWatch } from './coach-fixtures.mjs';

afterEach(cleanup);

const MON = '2026-10-05';

// Low sleep all week, one logged session yesterday: a reduce proposal on Monday.
function scenario() {
  const s = baseState();
  for (let i = 0; i < 7; i++) setWatch(s, addDays(ASOF, -i), { sleepH: 5 });
  withSessions(s, [session(addDays(ASOF, -1), [work('Seated Cable Row', 3, 100, 10)])]);
  return s;
}

function Harness({ initial, onState, ...props }) {
  const [state, setState] = useState(initial);
  onState.current = state;
  return <CoachTab state={state} setState={setState} today={ASOF} nowMs={NOW_MS} {...props} />;
}
const mount = (initial = scenario(), props = {}) => {
  const ref = { current: null };
  render(<Harness initial={initial} onState={ref} {...props} />);
  return ref;
};
const proposalsOf = (ref, status) => Object.values(ref.current.coach?.proposals || {}).filter((p) => !status || p.status === status);

describe('Coach tab', () => {
  test('Reassess creates one pending proposal and no duplicate on a second click', async () => {
    const user = userEvent.setup();
    const ref = mount();
    expect(proposalsOf(ref)).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: /reassess my plan/i }));
    expect(proposalsOf(ref, 'pending')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /^accept$/i })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /reassess my plan/i }));
    expect(proposalsOf(ref)).toHaveLength(1);
    expect(screen.getByText(/no new changes proposed/i)).toBeTruthy();
  });

  test('shows why nothing was proposed and an empty state when there is no signal', async () => {
    const user = userEvent.setup();
    mount(baseState());
    expect(screen.getByText(/not enough logged training/i)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /reassess my plan/i }));
    expect(screen.getByText(/no new changes proposed/i)).toBeTruthy();
    expect(screen.getByText(/no suggestions right now/i)).toBeTruthy();
  });

  test('Accept applies the override and Undo reverses it for an untouched future session', async () => {
    const user = userEvent.setup();
    const ref = mount();
    await user.click(screen.getByRole('button', { name: /reassess my plan/i }));
    await user.click(screen.getByRole('button', { name: /^accept$/i }));
    expect(ref.current.planOverrides[MON]).toBeTruthy();
    expect(proposalsOf(ref, 'applied')).toHaveLength(1);
    const undo = screen.getByRole('button', { name: /undo/i });
    expect(undo.disabled).toBe(false);
    await user.click(undo);
    expect(ref.current.planOverrides[MON]).toBeUndefined();
    expect(proposalsOf(ref, 'undone')).toHaveLength(1);
    expect(ref.current.coach.audit.map((a) => a.action)).toEqual(['applied', 'undone']);
  });

  test('Undo is disabled with the reason once the session has been started', async () => {
    const user = userEvent.setup();
    const ref = mount();
    await user.click(screen.getByRole('button', { name: /reassess my plan/i }));
    await user.click(screen.getByRole('button', { name: /^accept$/i }));
    cleanup();
    const started = structuredClone(ref.current);
    withSessions(started, [session(MON, [work('Back Squat', 1, 100, 5)])]);
    mount(started);
    const undo = screen.getByRole('button', { name: /undo/i });
    expect(undo.disabled).toBe(true);
    expect(screen.getByText(/cannot undo: .*has been started/i)).toBeTruthy();
  });

  test('Keep current plan declines and the proposal is not offered again', async () => {
    const user = userEvent.setup();
    const ref = mount();
    await user.click(screen.getByRole('button', { name: /reassess my plan/i }));
    await user.click(screen.getByRole('button', { name: /keep current plan/i }));
    expect(proposalsOf(ref, 'declined')).toHaveLength(1);
    expect(ref.current.planOverrides?.[MON]).toBeUndefined();
    await user.click(screen.getByRole('button', { name: /reassess my plan/i }));
    expect(proposalsOf(ref, 'pending')).toHaveLength(0);
    expect(proposalsOf(ref)).toHaveLength(1);
  });

  test('Accept is disabled with the reason for a stale proposal', () => {
    const s = scenario();
    const { proposals } = generateProposals(s, ASOF, NOW_MS);
    const recorded = recordProposals(s, proposals);
    recorded.workoutSessions[addDays(ASOF, -1)].entries['blk#0'].sets[0].weight = '110';
    mount(recorded);
    expect(screen.getByRole('button', { name: /^accept$/i }).disabled).toBe(true);
    expect(screen.getByText(/stale/i)).toBeTruthy();
  });

  test('Accept is disabled with the reason when the target date is protected', () => {
    const s = scenario();
    const { proposals } = generateProposals(s, ASOF, NOW_MS);
    const recorded = recordProposals(s, proposals);
    withSessions(recorded, [session(MON, [work('Back Squat', 1, 100, 5)])]);
    mount(recorded);
    expect(screen.getByRole('button', { name: /^accept$/i }).disabled).toBe(true);
    expect(screen.getByText(/already has a started or completed session/i)).toBeTruthy();
  });

  test('automatic mode toggle persists to state.coach.settings.mode and defaults to recommend', async () => {
    const user = userEvent.setup();
    const ref = mount();
    expect(screen.getByRole('radio', { name: /^recommend$/i }).checked).toBe(true);
    await user.click(screen.getByRole('radio', { name: /automatic conservative adjustments/i }));
    expect(ref.current.coach.settings.mode).toBe('auto');
    expect(screen.getByText(/increases and moves always need your acceptance/i)).toBeTruthy();
    await user.click(screen.getByRole('radio', { name: /^recommend$/i }));
    expect(ref.current.coach.settings.mode).toBe('recommend');
  });

  test('in automatic mode a validated reduction is applied on reassess', async () => {
    const user = userEvent.setup();
    const s = scenario();
    s.coach = { settings: { mode: 'auto', config: {} } };
    const ref = mount(s);
    await user.click(screen.getByRole('button', { name: /reassess my plan/i }));
    expect(proposalsOf(ref, 'applied')).toHaveLength(1);
    expect(proposalsOf(ref, 'applied')[0].appliedMode).toBe('auto');
  });

  test('evidence panel labels unlogged planned days as not logged, never rest', async () => {
    const user = userEvent.setup();
    mount();
    const panel = screen.getByRole('region', { name: /evidence/i });
    expect(within(panel).getAllByText(/not logged/i).length).toBeGreaterThan(0);
    expect(within(panel).queryByText(/\brest\b/i)).toBeNull();
    await user.click(within(panel).getByRole('radio', { name: /28 days/i }));
    expect(within(panel).queryByText(/\brest\b/i)).toBeNull();
    expect(within(panel).getByText(/not enough RHR history to compare/i)).toBeTruthy();
    expect(within(panel).getByText(/no session RPE x duration logged/i)).toBeTruthy();
  });

  test('AI explanation is hidden when disabled', async () => {
    const callModel = vi.fn();
    const user = userEvent.setup();
    mount(scenario(), { aiEnabled: false, callModel });
    await user.click(screen.getByRole('button', { name: /reassess my plan/i }));
    await screen.findByText(/summary \(rule-based\)/i);
    expect(screen.queryByText(/AI-written explanation/i)).toBeNull();
    expect(callModel).not.toHaveBeenCalled();
  });

  test('AI explanation falls back to the deterministic text when callModel throws', async () => {
    const callModel = vi.fn(async () => { throw new Error('down'); });
    const user = userEvent.setup();
    mount(scenario(), { aiEnabled: true, callModel });
    await user.click(screen.getByRole('button', { name: /reassess my plan/i }));
    await waitFor(() => expect(callModel).toHaveBeenCalled());
    await screen.findByText(/summary \(rule-based\)/i);
    expect(screen.queryByText(/AI-written explanation/i)).toBeNull();
    expect(screen.getByText(/suggests: reduce. Based on/i)).toBeTruthy();
  });

  test('a valid model reply is shown with the AI label', async () => {
    const callModel = vi.fn(async () => ({ summary: 'Your sleep has been low.', evidenceReferences: [0], cautions: [] }));
    const user = userEvent.setup();
    mount(scenario(), { aiEnabled: true, callModel });
    await user.click(screen.getByRole('button', { name: /reassess my plan/i }));
    await screen.findByText(/AI-written explanation \(from the numbers above\)/i);
    expect(screen.getByText('Your sleep has been low.')).toBeTruthy();
  });

  test('edit re-validates and applies a gentler reduction', async () => {
    const user = userEvent.setup();
    const ref = mount();
    await user.click(screen.getByRole('button', { name: /reassess my plan/i }));
    await user.click(screen.getByRole('button', { name: /^edit$/i }));
    expect(screen.getByRole('button', { name: /apply edited version/i })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /apply edited version/i }));
    expect(proposalsOf(ref, 'applied')).toHaveLength(1);
  });

  test('card shows current and proposed, confidence and the not-medical-clearance statement', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('button', { name: /reassess my plan/i }));
    expect(screen.getAllByText('Current').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Proposed').length).toBeGreaterThan(0);
    expect(screen.getByText(/confidence:/i)).toBeTruthy();
    expect(screen.getByText(/not medical clearance/i)).toBeTruthy();
    expect(screen.getAllByText(/last 7 days/i).length).toBeGreaterThan(0);
  });
});

describe('SessionLoadInputs', () => {
  function LoadHarness({ start = {}, out }) {
    const [s, setS] = useState(start);
    out.current = s;
    return <SessionLoadInputs session={s} onChange={setS} />;
  }

  test('writes numbers and deletes the fields when blank', async () => {
    const user = userEvent.setup();
    const out = { current: null };
    render(<LoadHarness out={out} start={{ date: '2026-10-01' }} />);
    expect(screen.getByText(/the coach will not guess/i)).toBeTruthy();
    await user.type(screen.getByLabelText(/session rpe/i), '7');
    await user.type(screen.getByLabelText(/duration/i), '55');
    expect(out.current.sessionRpe).toBe(7);
    expect(out.current.durationMin).toBe(55);
    expect(out.current.date).toBe('2026-10-01');
    await user.clear(screen.getByLabelText(/session rpe/i));
    await user.clear(screen.getByLabelText(/duration/i));
    expect('sessionRpe' in out.current).toBe(false);
    expect('durationMin' in out.current).toBe(false);
  });

  test('rejects out of range values without writing them', async () => {
    const user = userEvent.setup();
    const out = { current: null };
    render(<LoadHarness out={out} />);
    await user.type(screen.getByLabelText(/session rpe/i), '11');
    expect(screen.getByRole('alert').textContent).toMatch(/1 to 10/);
    expect(out.current.sessionRpe).toBe(1);
  });
});
