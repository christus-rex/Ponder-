import assert from 'node:assert/strict';
import test from 'node:test';
import {
  rankResonance,
  scoreIntentAffinity,
  scoreResonance,
  type ResonanceProfile,
} from '../src/matching.ts';

const viewer: ResonanceProfile = {
  id: 'viewer',
  intent: 'deep_conversation',
  interests: ['philosophy', 'music', 'AI'],
};

test('exact intent plus shared interests outranks a weak match', () => {
  const strong: ResonanceProfile = {
    id: 'strong',
    intent: 'deep_conversation',
    interests: ['Philosophy', 'books', 'ai'],
  };
  const weak: ResonanceProfile = {
    id: 'weak',
    intent: 'hang_out',
    interests: ['sports'],
  };

  assert.ok(scoreResonance(viewer, strong).score > scoreResonance(viewer, weak).score);
});

test('complementary talk and listen intent receives high affinity', () => {
  assert.ok(scoreIntentAffinity('talk', 'listen') >= 0.9);
  assert.ok(scoreIntentAffinity('listen', 'talk') >= 0.9);
});

test('interest matching is case and whitespace insensitive', () => {
  const candidate: ResonanceProfile = {
    id: 'candidate',
    intent: 'talk',
    interests: ['  Philosophy ', 'AI'],
  };
  const result = scoreResonance(
    { id: 'v', intent: 'talk', interests: ['philosophy', 'ai'] },
    candidate,
  );

  assert.deepEqual(result.sharedInterests, ['ai', 'philosophy']);
  assert.equal(result.interestScore, 1);
});

test('blocked and ineligible candidates never enter ranked discovery', () => {
  const ranked = rankResonance(viewer, [
    { id: 'ok', intent: 'listen', interests: ['music'] },
    { id: 'blocked', intent: 'deep_conversation', interests: ['philosophy'], blocked: true },
    { id: 'limited', intent: 'deep_conversation', interests: ['philosophy'], eligible: false },
  ]);

  assert.deepEqual(ranked.map((entry) => entry.candidate.id), ['ok']);
});

test('ranking is deterministic when scores tie', () => {
  const ranked = rankResonance(
    { id: 'viewer', intent: 'talk', interests: [] },
    [
      { id: 'b', intent: 'talk', interests: [] },
      { id: 'a', intent: 'talk', interests: [] },
    ],
  );

  assert.deepEqual(ranked.map((entry) => entry.candidate.id), ['a', 'b']);
});
