import { describe, expect, it } from "vitest";
import {
  buildRealtimeTranslationSession,
  normalizeTranslationLanguage,
} from "./config";

describe("translation config", () => {
  it("normalizes supported language codes", () => {
    expect(normalizeTranslationLanguage(" ES ")).toBe("es");
  });

  it("rejects unsupported languages", () => {
    expect(() => normalizeTranslationLanguage("xx")).toThrow(RangeError);
  });

  it("builds an OpenAI realtime translation session", () => {
    expect(buildRealtimeTranslationSession("fr")).toEqual({
      session: {
        model: "gpt-realtime-translate",
        audio: {
          output: {
            language: "fr",
          },
        },
      },
    });
  });
});
