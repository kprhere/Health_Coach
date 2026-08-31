// @vitest-environment jsdom
import React, { useState } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test } from 'vitest';

import { defaultState, initSession, makeCell, makeSet, resolveWorkout } from '../src/helpers.js';
import { TrainTab } from '../src/BodyRecompOS.jsx';
import { RoundsLogger, SingleLogger } from '../src/loggers.jsx';

afterEach(cleanup);

const singleBlock = {
  id: 'bench', blockType: 'single', name: 'Bench Press',
  exercises: [{ name: 'Bench Press', sets: 3, repLow: 6, repHigh: 8, rpe: 8, restSec: 120, tempo: '2-1-1' }],
};

function SingleHarness({ initialSets = [makeSet(), makeSet(), makeSet()] }) {
  const [entry, setEntry] = useState({
    blockType: 'single', name: 'Bench Press', exName: 'Bench Press',
    sets: initialSets, skipped: false, replacedWith: '',
  });
  const onMutate = (producer) => setEntry((current) => {
    const next = structuredClone(current);
    producer(next);
    return next;
  });
  return (
    <>
      <SingleLogger block={singleBlock} entry={entry} plan={{}} state={defaultState()} onMutate={onMutate} />
      <output data-testid="entry-state">{JSON.stringify(entry)}</output>
    </>
  );
}

const readEntry = () => JSON.parse(screen.getByTestId('entry-state').textContent);

test('Train workout blocks start folded and open when selected', async () => {
  const user = userEvent.setup();
  const date = '2026-08-17';
  const state = defaultState();
  const plan = resolveWorkout(date, state);
  const session = { ...initSession(plan), date };
  const ctx = {
    state,
    selDate: date,
    getSession: () => session,
    mutateEntry: () => {},
    patchSession: () => {},
    setRestart: () => {},
    setSatMode: () => {},
    toggleActivity: () => {},
    swapWorkoutDates: () => {},
    clearWorkoutSwap: () => {},
    setSetting: () => {},
  };

  render(<TrainTab ctx={ctx} />);

  const firstBlock = plan.blocks[0];
  const header = screen.getByRole('button', { name: new RegExp(firstBlock.name, 'i') });
  expect(header.getAttribute('aria-expanded')).toBe('false');
  expect(document.getElementById(`block-body-${firstBlock.id}`)).toBeNull();

  await user.click(header);
  expect(header.getAttribute('aria-expanded')).toBe('true');
  expect(document.getElementById(`block-body-${firstBlock.id}`)).not.toBeNull();

  await user.click(header);
  expect(header.getAttribute('aria-expanded')).toBe('false');
  expect(document.getElementById(`block-body-${firstBlock.id}`)).toBeNull();
});

describe('single-set workout controls', () => {
  test('the real Copy last button fills the next planned row and keeps copies independent', async () => {
    const user = userEvent.setup();
    render(<SingleHarness />);

    await user.type(screen.getByLabelText('Set 1 weight'), '185');
    await user.type(screen.getByLabelText('Set 1 reps'), '8');
    await user.type(screen.getByLabelText('Set 1 RPE'), '8');
    await user.click(screen.getByRole('button', { name: /copy last/i }));

    expect(screen.getAllByPlaceholderText('lb')).toHaveLength(3);
    expect(screen.getByLabelText('Set 2 weight').value).toBe('185');
    expect(screen.getByLabelText('Set 2 reps').value).toBe('8');
    expect(screen.getByLabelText('Set 2 RPE').value).toBe('8');
    expect(screen.getByLabelText('Set 3 weight').value).toBe('');

    await user.clear(screen.getByLabelText('Set 2 reps'));
    await user.type(screen.getByLabelText('Set 2 reps'), '7');
    expect(screen.getByLabelText('Set 1 reps').value).toBe('8');
    expect(readEntry().sets[0].reps).toBe('8');
  });

  test('Add Set adds one blank row and Delete set removes only the selected row', async () => {
    const user = userEvent.setup();
    render(<SingleHarness initialSets={[
      { ...makeSet(), weight: '100', reps: '10' },
      { ...makeSet(), weight: '110', reps: '9' },
    ]} />);

    await user.click(screen.getByRole('button', { name: /^set$/i }));
    expect(readEntry().sets).toHaveLength(3);
    expect(readEntry().sets[2].weight).toBe('');

    await user.click(screen.getByRole('button', { name: 'Set 2 details' }));
    await user.click(screen.getByRole('button', { name: /delete set/i }));
    expect(readEntry().sets).toHaveLength(2);
    expect(readEntry().sets.map((set) => set.weight)).toEqual(['100', '']);
  });

  test('Warm-up and set details persist on the correct rows', async () => {
    const user = userEvent.setup();
    render(<SingleHarness initialSets={[{ ...makeSet(), weight: '185', reps: '8' }]} />);

    await user.click(screen.getByRole('button', { name: /warm-up/i }));
    expect(readEntry().sets[0].isWarmup).toBe(true);
    expect(readEntry().sets[1].weight).toBe('185');

    await user.click(screen.getByRole('button', { name: 'Set 2 details' }));
    await user.type(screen.getByLabelText('Rest used (s)'), '105');
    await user.selectOptions(screen.getByLabelText('Form'), 'Clean');
    await user.type(screen.getByLabelText('Tempo done'), '3-1-1');
    await user.click(within(screen.getByText('Pain (0 none, 5 stop)').parentElement).getByRole('button', { name: '2' }));
    await user.type(screen.getByLabelText('Notes'), 'Strong set');

    expect(readEntry().sets[1]).toMatchObject({ restSec: '105', form: 'Clean', tempo: '3-1-1', pain: 2, notes: 'Strong set' });
    expect(readEntry().sets[0].notes).toBe('');
  });

  test('replace and skip preserve all entered set values', async () => {
    const user = userEvent.setup();
    render(<SingleHarness initialSets={[{ ...makeSet(), weight: '185', reps: '8', rpe: '8' }]} />);

    await user.selectOptions(screen.getByLabelText('Replacement exercise'), 'Dumbbell Bench Press');
    await user.click(screen.getByRole('button', { name: /^skip$/i }));
    expect(readEntry()).toMatchObject({ replacedWith: 'Dumbbell Bench Press', skipped: true });
    expect(readEntry().sets[0]).toMatchObject({ weight: '185', reps: '8', rpe: '8' });
    await user.click(screen.getByRole('button', { name: /un-skip/i }));
    expect(readEntry().skipped).toBe(false);
  });
});

function RoundsHarness() {
  const names = ['Cable Row', 'Lat Pulldown'];
  const blankRound = () => ({ done: false, byExercise: Object.fromEntries(names.map((name) => [name, makeCell()])) });
  const [entry, setEntry] = useState({
    blockType: 'superset', exNames: names, plannedRounds: 2, restAfterRoundSec: 60,
    rounds: [blankRound(), blankRound()], completed: false,
  });
  const block = {
    blockType: 'superset', exercises: names.map((name) => ({ name, targetReps: '8-10', targetRpe: 8 })),
  };
  const onMutate = (producer) => setEntry((current) => {
    const next = structuredClone(current);
    producer(next);
    return next;
  });
  return <><RoundsLogger block={block} entry={entry} state={defaultState()} onMutate={onMutate} /><output data-testid="round-state">{JSON.stringify(entry)}</output></>;
}

test('superset round copy, completion, and undo keep values with the correct exercise', async () => {
  const user = userEvent.setup();
  render(<RoundsHarness />);
  const weights = screen.getAllByPlaceholderText('lb');
  await user.type(weights[0], '100');
  await user.type(weights[1], '120');
  await user.click(screen.getByRole('button', { name: /copy prev/i }));

  let state = JSON.parse(screen.getByTestId('round-state').textContent);
  expect(state.rounds[1].byExercise['Cable Row'].weight).toBe('100');
  expect(state.rounds[1].byExercise['Lat Pulldown'].weight).toBe('120');

  const completeButtons = screen.getAllByRole('button', { name: /complete$/i });
  await user.click(completeButtons[1]);
  state = JSON.parse(screen.getByTestId('round-state').textContent);
  expect(state.rounds[1].done).toBe(true);
  await user.click(screen.getAllByRole('button', { name: /done$/i })[0]);
  state = JSON.parse(screen.getByTestId('round-state').textContent);
  expect(state.rounds[1].done).toBe(false);
  expect(state.rounds[1].byExercise['Cable Row'].weight).toBe('100');
});
