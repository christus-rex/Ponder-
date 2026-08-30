import type { TranslationLanguage } from "./config";

export type RealtimeTranslationEvent = {
  sourceTranscript: string;
  translatedTranscript: string;
};

export type TranslationConnection = {
  outputStream: MediaStream;
  close: () => void;
};

type ConnectOptions = {
  inputTrack: MediaStreamTrack;
  targetLanguage: TranslationLanguage;
  onTranscript?: (event: RealtimeTranslationEvent) => void;
  onStateChange?: (state: RTCPeerConnectionState) => void;
};

type RealtimeServerEvent = {
  type?: string;
  delta?: string;
  error?: {
    message?: string;
  };
};

export async function connectRealtimeTranslation({
  inputTrack,
  targetLanguage,
  onTranscript,
  onStateChange,
}: ConnectOptions): Promise<TranslationConnection> {
  const secretResponse = await fetch("/api/translation/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetLanguage }),
  });

  const secret = (await secretResponse.json()) as {
    value?: string;
    error?: string;
  };

  if (!secretResponse.ok || !secret.value) {
    throw new Error(secret.error || "Unable to create translation session.");
  }

  const peerConnection = new RTCPeerConnection();
  const inputStream = new MediaStream([inputTrack]);
  peerConnection.addTrack(inputTrack, inputStream);

  const outputStream = new MediaStream();
  peerConnection.ontrack = ({ track }) => {
    outputStream.addTrack(track);
  };

  let sourceTranscript = "";
  let translatedTranscript = "";

  const eventChannel = peerConnection.createDataChannel("oai-events");
  eventChannel.onmessage = ({ data }) => {
    let event: RealtimeServerEvent;

    try {
      event = JSON.parse(String(data)) as RealtimeServerEvent;
    } catch {
      return;
    }

    if (event.type === "session.input_transcript.delta" && event.delta) {
      sourceTranscript += event.delta;
      onTranscript?.({ sourceTranscript, translatedTranscript });
    }

    if (event.type === "session.output_transcript.delta" && event.delta) {
      translatedTranscript += event.delta;
      onTranscript?.({ sourceTranscript, translatedTranscript });
    }

    if (event.type === "error") {
      console.error("Realtime translation error", event.error?.message ?? event);
    }
  };

  peerConnection.onconnectionstatechange = () => {
    onStateChange?.(peerConnection.connectionState);
  };

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  const sdpResponse = await fetch(
    "https://api.openai.com/v1/realtime/translations/calls",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret.value}`,
        "Content-Type": "application/sdp",
      },
      body: offer.sdp,
    },
  );

  if (!sdpResponse.ok) {
    const message = await sdpResponse.text();
    eventChannel.close();
    peerConnection.close();
    throw new Error(message || "Unable to establish realtime translation.");
  }

  await peerConnection.setRemoteDescription({
    type: "answer",
    sdp: await sdpResponse.text(),
  });

  return {
    outputStream,
    close() {
      eventChannel.close();
      peerConnection.close();
    },
  };
}
