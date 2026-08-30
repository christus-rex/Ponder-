export const TRANSLATION_LANGUAGES = {
  ar: "Arabic",
  de: "German",
  en: "English",
  es: "Spanish",
  fr: "French",
  hi: "Hindi",
  it: "Italian",
  ja: "Japanese",
  ko: "Korean",
  pt: "Portuguese",
  ru: "Russian",
  uk: "Ukrainian",
  zh: "Chinese",
} as const;

export type TranslationLanguage = keyof typeof TRANSLATION_LANGUAGES;

export function normalizeTranslationLanguage(value: unknown): TranslationLanguage {
  const language = String(value ?? "").trim().toLowerCase();

  if (!(language in TRANSLATION_LANGUAGES)) {
    throw new RangeError(`Unsupported translation language: ${language || "(empty)"}`);
  }

  return language as TranslationLanguage;
}

export function buildRealtimeTranslationSession(targetLanguage: unknown) {
  const language = normalizeTranslationLanguage(targetLanguage);

  return {
    session: {
      model: "gpt-realtime-translate",
      audio: {
        output: {
          language,
        },
      },
    },
  } as const;
}
