import assert from 'node:assert/strict';
import test from 'node:test';
import { isAdultOnDate, nextOnboardingStep } from '../src/onboarding.ts';

test('user becomes eligible on their 18th birthday', () => {
  assert.equal(isAdultOnDate({ year: 2008, month: 8, day: 30 }, { year: 2026, month: 8, day: 30 }), true);
});

test('user is ineligible the day before their 18th birthday', () => {
  assert.equal(isAdultOnDate({ year: 2008, month: 8, day: 31 }, { year: 2026, month: 8, day: 30 }), false);
});

test('age calculation handles leap-day birthdays conservatively', () => {
  assert.equal(isAdultOnDate({ year: 2008, month: 2, day: 29 }, { year: 2026, month: 2, day: 28 }), false);
  assert.equal(isAdultOnDate({ year: 2008, month: 2, day: 29 }, { year: 2026, month: 3, day: 1 }), true);
});

test('onboarding advances through required gates', () => {
  assert.equal(nextOnboardingStep('age_gate'), 'terms');
  assert.equal(nextOnboardingStep('terms'), 'profile');
  assert.equal(nextOnboardingStep('profile'), 'preferences');
  assert.equal(nextOnboardingStep('preferences'), 'complete');
});
