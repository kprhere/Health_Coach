// @vitest-environment jsdom
import React from 'react';
import { expect, test } from 'vitest';
import { render } from '@testing-library/react';
import { MuscleMap, muscleLevel, weeklyRate, RangeToggle } from '../src/MuscleMap.jsx';

test('levels follow the weekly set ranges', () => {
  expect([0, 3, 6, 11, 12, 16, 17].map(muscleLevel)).toEqual([0, 1, 2, 2, 3, 3, 4]);
});

test('the map shades trained muscles and outlines untrained ones', () => {
  const groups = ['Chest', 'Back', 'Biceps', 'Quads'];
  const { container } = render(<MuscleMap sets={{ Chest: 10, Biceps: 20, Quads: 0, Back: 3 }} groups={groups} />);
  expect(container.querySelectorAll('.mm-muscle.mm-l4').length).toBe(2); // both biceps
  expect(container.querySelectorAll('.mm-muscle.mm-l2').length).toBe(2); // both chest
  expect(container.querySelectorAll('.mm-muscle.mm-l1').length).toBe(1); // back
  expect(container.querySelectorAll('.mm-muscle.mm-l0').length).toBeGreaterThan(0); // quads etc.
  const label = container.querySelector('.mm-figures').getAttribute('aria-label');
  expect(label).toContain('Back 3 sets');
  expect(container.querySelector('.mm-set.mm-t0').textContent).toContain('Quads');
});

test('compact map for Home lists untrained and low muscles instead of the full grid', () => {
  const groups = ['Chest', 'Back', 'Biceps', 'Quads'];
  const { container } = render(<MuscleMap compact sets={{ Chest: 10, Biceps: 20, Back: 3 }} groups={groups} />);
  expect(container.querySelector('.mm-sets')).toBeNull();
  const note = container.querySelector('.mm-note').textContent;
  expect(note).toContain('Not trained this week: Quads');
  expect(note).toContain('Under 6 sets a week: Back');
});

test('12-16 sets get their own brighter shade', () => {
  const { container } = render(<MuscleMap sets={{ Quads: 14, Triceps: 7 }} groups={['Quads', 'Triceps']} />);
  expect(container.querySelectorAll('.mm-muscle.mm-l3').length).toBe(2); // both quads
  expect(container.querySelectorAll('.mm-muscle.mm-l2').length).toBe(2); // both triceps
});

test('30-day view colors by weekly average and shows the total', () => {
  expect(weeklyRate(30, 30)).toBe(7);
  expect(weeklyRate(9, 7)).toBe(9);
  const { container } = render(<MuscleMap days={30} sets={{ Core: 30, Chest: 8 }} groups={['Core', 'Chest']} />);
  expect(container.querySelectorAll('.mm-muscle.mm-l2').length).toBe(1); // core at 7/wk
  expect(container.querySelectorAll('.mm-muscle.mm-l1').length).toBe(2); // chest at ~1.9/wk
  const core = [...container.querySelectorAll('.mm-set')].find((el) => el.textContent.startsWith('Core'));
  expect(core.textContent).toContain('30 total');
  expect(container.querySelector('.mm-figures').getAttribute('aria-label')).toContain('in the last 30 days');
});

test('range toggle switches between 7 and 30 days', () => {
  let picked = 7;
  const { getByText } = render(<RangeToggle days={7} onDays={(d) => { picked = d; }} />);
  expect(getByText('7 days').getAttribute('aria-pressed')).toBe('true');
  getByText('30 days').click();
  expect(picked).toBe(30);
});

test('30-day view with under a week of logs does not dilute the average', () => {
  const { container } = render(<MuscleMap days={30} spanDays={6} sets={{ Core: 12 }} groups={['Core']} />);
  expect(container.querySelector('.mm-set').textContent).toContain('12');
  expect(container.querySelectorAll('.mm-muscle.mm-l3').length).toBe(1); // 12/wk, not 2.8
  expect(container.querySelector('.mm-unit').textContent).toContain('under a week logged so far');
});

test('30-day view with two weeks of logs averages over 14 days', () => {
  const { container } = render(<MuscleMap days={30} spanDays={14} sets={{ Core: 20 }} groups={['Core']} />);
  expect(container.querySelector('.mm-set b').textContent).toContain('10');
});

test('legend wording: no logs, partial span, full window', () => {
  const unit = (props) => render(<MuscleMap groups={['Core']} {...props} />).container.querySelector('.mm-unit').textContent;
  expect(unit({ days: 30, spanDays: 7, sets: {} })).toBe('sets / week');
  expect(unit({ days: 30, spanDays: 20, sets: { Core: 9 } })).toBe('sets / week, averaged over 20 days logged');
  expect(unit({ days: 30, spanDays: 30, sets: { Core: 9 } })).toBe('sets / week, averaged');
  expect(unit({ days: 7, sets: { Core: 9 } })).toBe('sets / week');
});
