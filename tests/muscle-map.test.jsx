// @vitest-environment jsdom
import React from 'react';
import { expect, test } from 'vitest';
import { render } from '@testing-library/react';
import { MuscleMap, muscleLevel } from '../src/MuscleMap.jsx';

test('levels follow the weekly set ranges', () => {
  expect([0, 3, 6, 12, 16, 17].map(muscleLevel)).toEqual([0, 1, 2, 2, 2, 3]);
});

test('the map shades trained muscles and outlines untrained ones', () => {
  const groups = ['Chest', 'Back', 'Biceps', 'Quads'];
  const { container } = render(<MuscleMap sets={{ Chest: 10, Biceps: 20, Quads: 0, Back: 3 }} groups={groups} />);
  expect(container.querySelectorAll('.mm-muscle.mm-l3').length).toBe(2); // both biceps
  expect(container.querySelectorAll('.mm-muscle.mm-l2').length).toBe(2); // both chest
  expect(container.querySelectorAll('.mm-muscle.mm-l1').length).toBe(1); // back
  expect(container.querySelectorAll('.mm-muscle.mm-l0').length).toBeGreaterThan(0); // quads etc.
  const label = container.querySelector('.mm-figures').getAttribute('aria-label');
  expect(label).toContain('Back 3 sets');
  expect(container.querySelector('.mm-set.mm-t0').textContent).toContain('Quads');
});
