const targetLanguage = document.querySelector("#targetLanguage");
const toggle = document.querySelector("#toggle");
const status = document.querySelector("#status");
const sourceTranscript = document.querySelector("#sourceTranscript");
const translatedTranscript = document.querySelector("#translatedTranscript");
const translatedAudio = document.querySelector("#translatedAudio");

let peerConnection;
let sourceStream;
let eventChannel;
let running = false;

function setStatus(label, state) {
  status.textContent = label;
  status.dataset.state = state;
}

function appendTranscript(node, delta) {
  if (node.textContent === "—") node.textContent = "";
  node.textContent += delta;
}

async function loadLanguages() {
  const languages = await fetch("/api/translator/languages").then((response) =>
    response.json(),
  );

  for (const [code, label] of Object.entries(languages)) {
    const option = document.createElement("option");
    option.value = code;
    option.textContent = label;
    option.selected = code === "es";
    targetLanguage.append(option);
  }
}

async function start() {
  setStatus("Connecting…", "connecting");
  toggle.disabled = true;
  sourceTranscript.textContent = "—";
  translatedTranscript.textContent = "—";

  try {
    const secretResponse = await fetch("/api/translator/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetLanguage: targetLanguage.value }),
    });
    const secret = await secretResponse.json();

    if (!secretResponse.ok || !secret.value) {
      throw new Error(secret.error || "Unable to create translation session.");
    }

    sourceStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        autoGainControl: true,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    peerConnection = new RTCPeerConnection();
    const [audioTrack] = sourceStream.getAudioTracks();
    peerConnection.addTrack(audioTrack, sourceStream);

    peerConnection.ontrack = ({ streams }) => {
      translatedAudio.srcObject = streams[0];
    };

    peerConnection.onconnectionstatechange = () => {
      if (peerConnection?.connectionState === "failed") {
        stop("Connection failed");
      }
    };

    eventChannel = peerConnection.createDataChannel("oai-events");
    eventChannel.onopen = () => setStatus("Live", "live");
    eventChannel.onmessage = ({ data }) => {
      const event = JSON.parse(data);

      if (event.type === "session.input_transcript.delta") {
        appendTranscript(sourceTranscript, event.delta);
      }

      if (event.type === "session.output_transcript.delta") {
        appendTranscript(translatedTranscript, event.delta);
      }

      if (event.type === "error") {
        console.error("Realtime translation error", event);
      }
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
      throw new Error(await sdpResponse.text());
    }

    await peerConnection.setRemoteDescription({
      type: "answer",
      sdp: await sdpResponse.text(),
    });

    running = true;
    targetLanguage.disabled = true;
    toggle.textContent = "Stop translating";
  } catch (error) {
    console.error(error);
    stop(error.message || "Unable to start");
  } finally {
    toggle.disabled = false;
  }
}

function stop(message = "Idle") {
  running = false;
  eventChannel?.close();
  peerConnection?.close();
  sourceStream?.getTracks().forEach((track) => track.stop());
  translatedAudio.srcObject = null;

  eventChannel = undefined;
  peerConnection = undefined;
  sourceStream = undefined;

  targetLanguage.disabled = false;
  toggle.textContent = "Start translating";
  setStatus(message, message === "Idle" ? "idle" : "error");
}

toggle.addEventListener("click", () => {
  if (running) stop();
  else start();
});

targetLanguage.addEventListener("change", () => {
  sourceTranscript.textContent = "—";
  translatedTranscript.textContent = "—";
});

loadLanguages().catch((error) => {
  console.error(error);
  setStatus("Setup failed", "error");
});
