const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseBirthDate(value: string): Date | null {
  if (!ISO_DATE.test(value)) return null;

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

export function isAtLeast18(value: string, today = new Date()): boolean {
  const dob = parseBirthDate(value);
  if (!dob) return false;

  const year = today.getUTCFullYear() - 18;
  const cutoff = new Date(Date.UTC(year, today.getUTCMonth(), today.getUTCDate()));

  return dob <= cutoff;
}
