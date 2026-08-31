export const SOCIAL_INTENTS = [
  'talk',
  'meet',
  'deep_conversation',
  'create',
  'debate',
  'listen',
  'hang_out',
] as const;

export type SocialIntent = (typeof SOCIAL_INTENTS)[number];
export type ResonanceReasonCode =
  | 'same_intent'
  | 'complementary_intent'
  | 'shared_interests'
  | 'compatible_intent';

export interface ResonanceProfile {
  id: string;
  intent: SocialIntent;
  interests: readonly string[];
  eligible?: boolean;
  blocked?: boolean;
}

export interface ResonanceScore {
  score: number;
  intentScore: number;
  interestScore: number;
  sharedInterests: string[];
  reasons: string[];
  reasonCode: ResonanceReasonCode | null;
}

export interface RankedResonance<T extends ResonanceProfile> {
  candidate: T;
  resonance: ResonanceScore;
}

const INTENT_AFFINITY: Record<SocialIntent, Record<SocialIntent, number>> = {
  talk: {
    talk: 1,
    meet: 0.84,
    deep_conversation: 0.78,
    create: 0.58,
    debate: 0.56,
    listen: 0.94,
    hang_out: 0.86,
  },
  meet: {
    talk: 0.84,
    meet: 1,
    deep_conversation: 0.72,
    create: 0.56,
    debate: 0.46,
    listen: 0.78,
    hang_out: 0.9,
  },
  deep_conversation: {
    talk: 0.78,
    meet: 0.72,
    deep_conversation: 1,
    create: 0.62,
    debate: 0.76,
    listen: 0.92,
    hang_out: 0.58,
  },
  create: {
    talk: 0.58,
    meet: 0.56,
    deep_conversation: 0.62,
    create: 1,
    debate: 0.5,
    listen: 0.68,
    hang_out: 0.66,
  },
  debate: {
    talk: 0.56,
    meet: 0.46,
    deep_conversation: 0.76,
    create: 0.5,
    debate: 1,
    listen: 0.72,
    hang_out: 0.38,
  },
  listen: {
    talk: 0.94,
    meet: 0.78,
    deep_conversation: 0.92,
    create: 0.68,
    debate: 0.72,
    listen: 0.74,
    hang_out: 0.8,
  },
  hang_out: {
    talk: 0.86,
    meet: 0.9,
    deep_conversation: 0.58,
    create: 0.66,
    debate: 0.38,
    listen: 0.8,
    hang_out: 1,
  },
};

export function scoreIntentAffinity(viewer: SocialIntent, candidate: SocialIntent): number {
  return INTENT_AFFINITY[viewer][candidate];
}

export function scoreResonance(viewer: ResonanceProfile, candidate: ResonanceProfile): ResonanceScore {
  if (viewer.id === candidate.id) {
    return emptyScore('same_profile');
  }

  if (candidate.blocked || candidate.eligible === false) {
    return emptyScore('not_eligible');
  }

  const intentScore = scoreIntentAffinity(viewer.intent, candidate.intent);
  const sharedInterests = intersectNormalized(viewer.interests, candidate.interests);
  const interestScore = diceOverlap(viewer.interests, candidate.interests);

  // Intent is intentionally dominant for cold-start discovery. Interests refine the
  // result without letting popularity, gifts, or spending determine who is seen.
  const score = Math.round((intentScore * 0.65 + interestScore * 0.35) * 100);

  const reasons: string[] = [];
  let reasonCode: ResonanceReasonCode;

  if (viewer.intent === candidate.intent) {
    reasonCode = 'same_intent';
    reasons.push(`Both here to ${humanizeIntent(viewer.intent)}`);
  } else if (intentScore >= 0.85) {
    reasonCode = 'complementary_intent';
    reasons.push(
      `${humanizeIntent(viewer.intent)} pairs well with ${humanizeIntent(candidate.intent)}`,
    );
  } else if (sharedInterests.length > 0) {
    reasonCode = 'shared_interests';
  } else {
    reasonCode = 'compatible_intent';
  }

  if (sharedInterests.length > 0) {
    reasons.push(`Shared: ${sharedInterests.slice(0, 3).join(', ')}`);
  }

  if (reasons.length === 0) {
    reasons.push('A different perspective with compatible intent');
  }

  return {
    score,
    intentScore,
    interestScore,
    sharedInterests,
    reasons,
    reasonCode,
  };
}

export function rankResonance<T extends ResonanceProfile>(
  viewer: ResonanceProfile,
  candidates: readonly T[],
): RankedResonance<T>[] {
  return candidates
    .filter((candidate) => candidate.id !== viewer.id && !candidate.blocked && candidate.eligible !== false)
    .map((candidate) => ({
      candidate,
      resonance: scoreResonance(viewer, candidate),
    }))
    .sort(
      (a, b) =>
        b.resonance.score - a.resonance.score ||
        a.candidate.id.localeCompare(b.candidate.id),
    );
}

function emptyScore(reason: string): ResonanceScore {
  return {
    score: 0,
    intentScore: 0,
    interestScore: 0,
    sharedInterests: [],
    reasons: [reason],
    reasonCode: null,
  };
}

function diceOverlap(left: readonly string[], right: readonly string[]): number {
  const a = normalizedSet(left);
  const b = normalizedSet(right);

  if (a.size === 0 && b.size === 0) return 0.5;
  if (a.size === 0 || b.size === 0) return 0.35;

  let intersection = 0;
  for (const value of a) {
    if (b.has(value)) intersection += 1;
  }

  return (2 * intersection) / (a.size + b.size);
}

function intersectNormalized(left: readonly string[], right: readonly string[]): string[] {
  const a = normalizedSet(left);
  const b = normalizedSet(right);
  return [...a].filter((value) => b.has(value)).sort();
}

function normalizedSet(values: readonly string[]): Set<string> {
  return new Set(
    values
      .map((value) => value.trim().toLowerCase().replace(/\s+/g, ' '))
      .filter(Boolean),
  );
}

function humanizeIntent(intent: SocialIntent): string {
  return intent.replaceAll('_', ' ');
}
