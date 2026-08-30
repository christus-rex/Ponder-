const LANGUAGES = {
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
};

const localeByLanguage = {
  ar: "ar-SA",
  de: "de-DE",
  en: "en-US",
  es: "es-ES",
  fr: "fr-FR",
  hi: "hi-IN",
  it: "it-IT",
  ja: "ja-JP",
  ko: "ko-KR",
  pt: "pt-BR",
  ru: "ru-RU",
  uk: "uk-UA",
  zh: "zh-CN",
};

const sourceLanguage = document.querySelector("#sourceLanguage");
const targetLanguage = document.querySelector("#targetLanguage");
const toggle = document.querySelector("#toggle");
const swap = document.querySelector("#swap");
const sourceTranscript = document.querySelector("#sourceTranscript");
const translatedTranscript = document.querySelector("#translatedTranscript");
const speakTranslation = document.querySelector("#speakTranslation");
const translateText = document.querySelector("#translateText");
const manualText = document.querySelector("#manualText");
const status = document.querySelector("#status");
const compatibility = document.querySelector("#compatibility");

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition;
let running = false;
let finalText = "";
let translator;
let translatorPair = "";

function populateLanguages() {
  for (const [code, name] of Object.entries(LANGUAGES)) {
    for (const select of [sourceLanguage, targetLanguage]) {
      const option = document.createElement("option");
      option.value = code;
      option.textContent = name;
      select.append(option);
    }
  }
  sourceLanguage.value = "en";
  targetLanguage.value = "es";
}

function setStatus(message, state = "idle") {
  status.textContent = message;
  status.dataset.state = state;
}

function showCompatibility() {
  const hasTranslator = "Translator" in self;
  const hasRecognition = Boolean(Recognition);

  if (hasTranslator && hasRecognition) {
    compatibility.textContent = "Ready for live browser translation. The first language pair may download a small model.";
    compatibility.dataset.kind = "ok";
    return;
  }

  if (!hasTranslator && hasRecognition) {
    compatibility.textContent = "Speech recognition is available, but this browser does not expose the built-in Translator AI. Use current desktop Chrome for the full preview.";
    compatibility.dataset.kind = "warn";
    return;
  }

  compatibility.textContent = "This browser does not support the speech/translation APIs needed for the full preview. The production Ponder+ translator uses a separate realtime backend.";
  compatibility.dataset.kind = "warn";
}

async function getTranslator() {
  if (!("Translator" in self)) {
    throw new Error("Built-in Translator AI is not available in this browser.");
  }

  const source = sourceLanguage.value;
  const target = targetLanguage.value;
  const pair = `${source}:${target}`;

  if (source === target) {
    return {
      translate: async (text) => text,
    };
  }

  if (translator && translatorPair === pair) return translator;

  translator?.destroy?.();
  translator = undefined;
  translatorPair = "";

  setStatus("Preparing language model…", "working");

  const availability = await Translator.availability({
    sourceLanguage: source,
    targetLanguage: target,
  });

  if (availability === "unavailable") {
    throw new Error("That language pair is not available on this device.");
  }

  translator = await Translator.create({
    sourceLanguage: source,
    targetLanguage: target,
    monitor(monitor) {
      monitor.addEventListener("downloadprogress", (event) => {
        const percent = Math.round(event.loaded * 100);
        setStatus(`Downloading language model… ${percent}%`, "working");
      });
    },
  });

  translatorPair = pair;
  return translator;
}

async function translate(value) {
  const text = value.trim();
  if (!text) return "";

  const activeTranslator = await getTranslator();
  setStatus("Translating…", "working");
  const result = await activeTranslator.translate(text);

  translatedTranscript.textContent = result;
  speakTranslation.disabled = !result;
  setStatus(running ? "Listening" : "Ready", running ? "live" : "idle");
  return result;
}

function startRecognition() {
  if (!Recognition) {
    setStatus("Speech recognition unavailable", "error");
    return;
  }

  recognition = new Recognition();
  recognition.lang = localeByLanguage[sourceLanguage.value] || sourceLanguage.value;
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  finalText = "";
  sourceTranscript.textContent = "Listening…";

  recognition.onstart = () => {
    running = true;
    toggle.textContent = "Stop listening";
    sourceLanguage.disabled = true;
    setStatus("Listening", "live");
  };

  recognition.onresult = async (event) => {
    let interim = "";

    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const text = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalText += `${text} `;
      else interim += text;
    }

    const display = `${finalText}${interim}`.trim();
    sourceTranscript.textContent = display || "Listening…";

    if (finalText.trim()) {
      try {
        await translate(finalText);
      } catch (error) {
        setStatus(error.message, "error");
      }
    }
  };

  recognition.onerror = (event) => {
    if (event.error !== "no-speech" && event.error !== "aborted") {
      setStatus(`Speech error: ${event.error}`, "error");
    }
  };

  recognition.onend = () => {
    if (running) {
      try {
        recognition.start();
      } catch {
        stopRecognition();
      }
    }
  };

  recognition.start();
}

function stopRecognition() {
  running = false;
  recognition?.stop();
  recognition = undefined;
  toggle.textContent = "Start listening";
  sourceLanguage.disabled = false;
  setStatus("Idle", "idle");
}

toggle.addEventListener("click", async () => {
  if (running) {
    stopRecognition();
    return;
  }

  try {
    // User activation here also allows Translator.create() to download a model.
    await getTranslator();
    startRecognition();
  } catch (error) {
    setStatus(error.message, "error");
  }
});

translateText.addEventListener("click", async () => {
  sourceTranscript.textContent = manualText.value.trim() || "Nothing entered.";
  try {
    await translate(manualText.value);
  } catch (error) {
    setStatus(error.message, "error");
  }
});

manualText.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    translateText.click();
  }
});

swap.addEventListener("click", () => {
  const currentSource = sourceLanguage.value;
  sourceLanguage.value = targetLanguage.value;
  targetLanguage.value = currentSource;
  translator?.destroy?.();
  translator = undefined;
  translatorPair = "";
});

[sourceLanguage, targetLanguage].forEach((select) => {
  select.addEventListener("change", () => {
    translator?.destroy?.();
    translator = undefined;
    translatorPair = "";
  });
});

speakTranslation.addEventListener("click", () => {
  const text = translatedTranscript.textContent.trim();
  if (!text || text === "Translation will appear here.") return;

  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = localeByLanguage[targetLanguage.value] || targetLanguage.value;
  speechSynthesis.speak(utterance);
});

populateLanguages();
showCompatibility();
