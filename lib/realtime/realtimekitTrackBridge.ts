export type ParticipantAudioTrack = {
  participantId: string;
  participantName: string;
  audioTrack: MediaStreamTrack;
};

type AudioUpdatePayload = {
  audioEnabled: boolean;
  audioTrack?: MediaStreamTrack;
};

type RealtimeKitParticipant = {
  id: string;
  name?: string;
};

type JoinedParticipants = {
  on: (
    event: "audioUpdate",
    listener: (
      participant: RealtimeKitParticipant,
      payload: AudioUpdatePayload,
    ) => void,
  ) => void;
  off: (
    event: "audioUpdate",
    listener: (
      participant: RealtimeKitParticipant,
      payload: AudioUpdatePayload,
    ) => void,
  ) => void;
};

export type RealtimeKitMeetingLike = {
  participants: {
    joined: JoinedParticipants;
  };
};

/**
 * Bridges RealtimeKit's per-participant audioUpdate events into Ponder+'s
 * provider-neutral translation sidecar interface.
 */
export function subscribeToRealtimeKitAudioTracks(
  meeting: RealtimeKitMeetingLike,
  onTrack: (track: ParticipantAudioTrack) => void,
) {
  const handleAudioUpdate = (
    participant: RealtimeKitParticipant,
    { audioEnabled, audioTrack }: AudioUpdatePayload,
  ) => {
    if (!audioEnabled || !audioTrack) return;

    onTrack({
      participantId: participant.id,
      participantName: participant.name || "Participant",
      audioTrack,
    });
  };

  meeting.participants.joined.on("audioUpdate", handleAudioUpdate);

  return () => {
    meeting.participants.joined.off("audioUpdate", handleAudioUpdate);
  };
}
