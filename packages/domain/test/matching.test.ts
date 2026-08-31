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


test('resonance exposes a coarse reason code without persisting explanation text', () => {
  const sameIntent = scoreResonance(
    { id: 'viewer-a', intent: 'talk', interests: ['music'] },
    { id: 'candidate-a', intent: 'talk', interests: ['music'] },
  );
  assert.equal(sameIntent.reasonCode, 'same_intent');

  const sharedInterest = scoreResonance(
    { id: 'viewer-b', intent: 'deep_conversation', interests: ['philosophy'] },
    { id: 'candidate-b', intent: 'create', interests: ['Philosophy'] },
  );
  assert.equal(sharedInterest.reasonCode, 'shared_interests');

  const complementary = scoreResonance(
    { id: 'viewer-c', intent: 'talk', interests: [] },
    { id: 'candidate-c', intent: 'listen', interests: [] },
  );
  assert.equal(complementary.reasonCode, 'complementary_intent');
});


test('availability contributes a bounded four-point bonus', () => {
  const offline = scoreResonance(
    { id: 'viewer-presence', intent: 'talk', interests: ['music'] },
    { id: 'candidate-offline', intent: 'meet', interests: ['music'], availableNow: false },
  );
  const online = scoreResonance(
    { id: 'viewer-presence', intent: 'talk', interests: ['music'] },
    { id: 'candidate-online', intent: 'meet', interests: ['music'], availableNow: true },
  );

  assert.equal(offline.availabilityBonus, 0);
  assert.equal(online.availabilityBonus, 4);
  assert.equal(online.score - offline.score, 4);
});

test('availability cannot overwhelm a materially stronger compatibility match', () => {
  const ranked = rankResonance(
    { id: 'viewer-bounded', intent: 'deep_conversation', interests: ['philosophy', 'history'] },
    [
      {
        id: 'strong-offline',
        intent: 'deep_conversation',
        interests: ['philosophy', 'history'],
        availableNow: false,
      },
      {
        id: 'weak-online',
        intent: 'hang_out',
        interests: [],
        availableNow: true,
      },
    ],
  );

  assert.equal(ranked[0]?.candidate.id, 'strong-offline');
  assert.ok((ranked[0]?.resonance.score ?? 0) - (ranked[1]?.resonance.score ?? 0) > 4);
});
