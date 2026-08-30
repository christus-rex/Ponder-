import { createHash } from "node:crypto";

export const SUPPORTED_LANGUAGES = Object.freeze({
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
  zh: "Chinese",
});

export function normalizeTargetLanguage(value) {
  const language = String(value ?? "").trim().toLowerCase();
  if (!Object.hasOwn(SUPPORTED_LANGUAGES, language)) {
    throw new RangeError(`Unsupported target language: ${language || "(empty)"}`);
  }
  return language;
}

export function buildTranslationSessionRequest(targetLanguage) {
  const language = normalizeTargetLanguage(targetLanguage);

  return {
    session: {
      model: "gpt-realtime-translate",
      audio: {
        output: {
          language,
        },
      },
    },
  };
}

export function safetyIdentifier(value) {
  return createHash("sha256")
    .update(String(value || "ponder-anonymous"))
    .digest("hex");
}
