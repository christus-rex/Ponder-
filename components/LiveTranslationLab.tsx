"use client";

import { useEffect, useRef, useState } from "react";
import {
  TRANSLATION_LANGUAGES,
  type TranslationLanguage,
} from "@/lib/translation/config";
import {
  connectRealtimeTranslation,
  type TranslationConnection,
} from "@/lib/translation/openaiRealtimeClient";

type LabState = "idle" | "requesting-mic" | "connecting" | "live" | "error";

export function LiveTranslationLab() {
  const [targetLanguage, setTargetLanguage] =
    useState<TranslationLanguage>("es");
  const [state, setState] = useState<LabState>("idle");
  const [sourceTranscript, setSourceTranscript] = useState("");
  const [translatedTranscript, setTranslatedTranscript] = useState("");
  const [error, setError] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);
  const microphoneRef = useRef<MediaStream | null>(null);
  const translationRef = useRef<TranslationConnection | null>(null);

  function stop() {
    translationRef.current?.close();
    translationRef.current = null;

    microphoneRef.current?.getTracks().forEach((track) => track.stop());
    microphoneRef.current = null;

    if (audioRef.current) {
      audioRef.current.srcObject = null;
    }

    setState("idle");
  }

  useEffect(() => stop, []);

  async function start() {
    setError("");
    setSourceTranscript("");
    setTranslatedTranscript("");
    setState("requesting-mic");

    try {
      const microphone = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      microphoneRef.current = microphone;
      const [track] = microphone.getAudioTracks();

      if (!track) {
        throw new Error("No microphone audio track is available.");
      }

      setState("connecting");

      const connection = await connectRealtimeTranslation({
        inputTrack: track,
        targetLanguage,
        onTranscript: ({ sourceTranscript: source, translatedTranscript: translated }) => {
          setSourceTranscript(source);
          setTranslatedTranscript(translated);
        },
        onStateChange(connectionState) {
          if (connectionState === "connected") setState("live");
          if (connectionState === "failed") {
            setState("error");
            setError("The realtime translation connection failed.");
          }
        },
      });

      translationRef.current = connection;

      if (audioRef.current) {
        audioRef.current.srcObject = connection.outputStream;
        await audioRef.current.play().catch(() => undefined);
      }

      setState("live");
    } catch (reason) {
      stop();
      setState("error");
      setError(reason instanceof Error ? reason.message : "Unable to start translation.");
    }
  }

  const isRunning = state === "requesting-mic" || state === "connecting" || state === "live";

  return (
    <section className="translationLab">
      <div className="translationToolbar">
        <div>
          <p className="sectionLabel">TRACK SIDECAR</p>
          <h2>Translate one speaker without changing the room.</h2>
          <p className="bodyCopy">
            This lab uses your microphone as a stand-in for one remote participant
            track. The same sidecar accepts a RealtimeKit participant audioTrack.
          </p>
        </div>

        <div className="translationControls">
          <label className="translationLabel">
            Listen in
            <select
              className="translationSelect"
              value={targetLanguage}
              disabled={isRunning}
              onChange={(event) =>
                setTargetLanguage(event.target.value as TranslationLanguage)
              }
            >
              {Object.entries(TRANSLATION_LANGUAGES).map(([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className={isRunning ? "secondaryButton" : "primaryButton"}
            onClick={isRunning ? stop : start}
          >
            {isRunning ? "Stop translation" : "Translate this speaker"}
          </button>
        </div>
      </div>

      <div className="translationStatusRow">
        <span className="statusPill">
          {state === "idle" && "Ready"}
          {state === "requesting-mic" && "Requesting microphone"}
          {state === "connecting" && "Connecting to translator"}
          {state === "live" && "Live translation"}
          {state === "error" && "Translation unavailable"}
        </span>
        <span className="quietMetric">Per-listener · ephemeral by default</span>
      </div>

      {error && <p className="walletError">{error}</p>}

      <div className="translationTranscriptGrid">
        <article className="translationTranscriptCard">
          <span className="roomMeta">SOURCE</span>
          <p>{sourceTranscript || "The speaker transcript will appear here."}</p>
        </article>
        <article className="translationTranscriptCard translated">
          <span className="roomMeta">TRANSLATED</span>
          <p>{translatedTranscript || "The translated transcript will appear here."}</p>
        </article>
      </div>

      <audio ref={audioRef} autoPlay />
    </section>
  );
}
