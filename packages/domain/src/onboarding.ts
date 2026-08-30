export interface BirthDate {
  year: number;
  month: number;
  day: number;
}

export type OnboardingStep = 'age_gate' | 'terms' | 'profile' | 'preferences' | 'complete';

export function isAdultOnDate(birth: BirthDate, today: BirthDate, minimumAge = 18): boolean {
  if (!Number.isInteger(minimumAge) || minimumAge < 1) throw new Error('minimumAge must be a positive integer');
  if (!isValidDate(birth) || !isValidDate(today)) throw new Error('Invalid calendar date');

  let age = today.year - birth.year;
  if (today.month < birth.month || (today.month === birth.month && today.day < birth.day)) age -= 1;
  return age >= minimumAge;
}

export function nextOnboardingStep(current: OnboardingStep): OnboardingStep {
  switch (current) {
    case 'age_gate': return 'terms';
    case 'terms': return 'profile';
    case 'profile': return 'preferences';
    case 'preferences': return 'complete';
    case 'complete': return 'complete';
  }
}

function isValidDate(value: BirthDate): boolean {
  const d = new Date(Date.UTC(value.year, value.month - 1, value.day));
  return d.getUTCFullYear() === value.year && d.getUTCMonth() === value.month - 1 && d.getUTCDate() === value.day;
}
