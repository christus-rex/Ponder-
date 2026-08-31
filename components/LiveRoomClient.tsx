"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  MediaParticipant,
  RoomBrainClientSyncState,
  RoomBrainRole,
} from "@/packages/domain/src/index";
import { ManagedRoomBrainClient } from "@/lib/realtime/roomBrainClient";
import { requestRoomMediaJoinAuthorization } from "@/lib/realtime/roomMediaAuthorization";
import {
  RoomMediaSessionCoordinator,
  type RoomMediaSessionCoordinatorState,
} from "@/lib/realtime/roomMediaSessionCoordinator";
import { RealtimeKitMediaProvider } from "@/lib/realtime/realtimeKitMediaProvider";

type LiveRoomClientProps = {
  roomId: string;
  userId: string;
  title: string;
  description: string;
  isHost: boolean;
};

const EMPTY_MEDIA_STATE: RoomMediaSessionCoordinatorState = {
  phase: "idle",
  decision: {
    authorityStatus: "awaiting_snapshot",
    authoritySequence: null,
    role: null,
    shouldJoinSfu: false,
    shouldLeaveSfu: false,
    mayPublishAudio: false,
    mayPublishVideo: false,
    mustUnpublishAudio: true,
    mustUnpublishVideo: true,
    mustUnpublish: true,
  },
  joinedRole: null,
  microphoneRequested: false,
  microphoneEnabled: false,
  cameraRequested: false,
  cameraEnabled: false,
  lastError: null,
};

export function LiveRoomClient({
  roomId,
  userId,
  title,
  description,
  isHost,
}: LiveRoomClientProps) {
  const brainRef = useRef<ManagedRoomBrainClient | null>(null);
  const coordinatorRef = useRef<RoomMediaSessionCoordinator | null>(null);
  const providerRef = useRef<RealtimeKitMediaProvider | null>(null);

  const [syncState, setSyncState] = useState<RoomBrainClientSyncState>({
    status: "awaiting_snapshot",
    room: null,
  });
  const [mediaState, setMediaState] =
    useState<RoomMediaSessionCoordinatorState>(EMPTY_MEDIA_STATE);
  const [mediaParticipants, setMediaParticipants] = useState<
    readonly MediaParticipant[]
  >([]);
  const [notice, setNotice] = useState<string>("");
  const [busyAction, setBusyAction] = useState<string>("");

  useEffect(() => {
    let active = true;
    const provider = new RealtimeKitMediaProvider();
    const coordinator = new RoomMediaSessionCoordinator({
      roomId,
      userId,
      provider,
      requestJoinAuthorization: requestRoomMediaJoinAuthorization,
      onStateChange(state) {
        if (active) setMediaState(state);
      },
      onError(error) {
        if (active) setNotice(error.message);
      },
    });
    const brain = new ManagedRoomBrainClient(roomId, {
      onSyncStateChange(state) {
        if (!active) return;
        setSyncState(state);
        coordinator.updateRoomBrainState(state);
      },
      onError(error) {
        if (active) setNotice(error.message);
      },
    });

    providerRef.current = provider;
    coordinatorRef.current = coordinator;
    brainRef.current = brain;

    void brain.start().catch((error: unknown) => {
      if (active) {
        setNotice(
          error instanceof Error
            ? error.message
            : "Unable to start Room Brain connection.",
        );
      }
    });

    const participantRefresh = window.setInterval(() => {
      if (!active) return;
      try {
        setMediaParticipants(provider.participants());
      } catch {
        setMediaParticipants([]);
      }
    }, 750);

    return () => {
      active = false;
      window.clearInterval(participantRefresh);
      brain.stop();
      void coordinator.stop();
      brainRef.current = null;
      coordinatorRef.current = null;
      providerRef.current = null;
    };
  }, [roomId, userId]);

  const room = syncState.room;
  const self = room?.participants[userId] ?? null;
  const role = self?.role ?? null;
  const queued = room?.speakerQueue.includes(userId) ?? false;
  const participantRows = useMemo(() => {
    if (!room) return [];
    const mediaByUser = new Map(
      mediaParticipants.map((participant) => [participant.userId, participant]),
    );
    return Object.values(room.participants)
      .map((participant) => ({
        ...participant,
        media: mediaByUser.get(participant.userId) ?? null,
      }))
      .sort((a, b) => roleRank(a.role) - roleRank(b.role));
  }, [room, mediaParticipants]);

  function sendCommand(
    command:
      | { type: "request_seat"; userId: string }
      | { type: "cancel_seat"; userId: string }
      | { type: "grant_seat"; actorUserId: string; targetUserId: string }
      | { type: "set_room_lock"; actorUserId: string; locked: boolean }
      | { type: "react"; userId: string; reaction: string },
  ) {
    try {
      brainRef.current?.sendCommand(command);
      setNotice("");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Room command could not be sent.",
      );
    }
  }

  async function demoteSpeaker(targetUserId: string) {
    if (!room || !isHost) return;
    setBusyAction(`demote:${targetUserId}`);
    try {
      const response = await fetch(
        `/api/rooms/${encodeURIComponent(roomId)}/participants/${encodeURIComponent(
          targetUserId,
        )}/demote`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ expectedSequence: room.sequence }),
          cache: "no-store",
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to demote speaker.");
      }
      setNotice("Speaker returned to the audience.");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Unable to demote speaker.",
      );
    } finally {
      setBusyAction("");
    }
  }

  async function closeRoom() {
    if (!isHost) return;
    setBusyAction("close");
    try {
      const response = await fetch(
        `/api/rooms/${encodeURIComponent(roomId)}/close`,
        {
          method: "POST",
          headers: { Accept: "application/json" },
          cache: "no-store",
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to close room.");
      }
      window.location.assign("/discover");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to close room.");
      setBusyAction("");
    }
  }

  const synchronized = syncState.status === "synchronized" && Boolean(room);
  const canPublish = role === "host" || role === "moderator" || role === "speaker";

  return (
    <main className="shell liveRoomShell">
      <nav className="nav">
        <a className="brand" href="/discover">
          <span className="brandMark">P+</span>
          <span>Back to discover</span>
        </a>
        <span className="statusPill">
          {syncState.status === "synchronized"
            ? `Room Brain · #${room?.sequence ?? 0}`
            : syncState.status === "resync_required"
              ? "Resynchronizing…"
              : "Connecting…"}
        </span>
      </nav>

      <section className="liveRoomHeader">
        <div>
          <p className="sectionLabel">LIVE ROOM</p>
          <h1>{title}</h1>
          <p>{description || "A small room for intentional conversation."}</p>
        </div>
        <div className="liveRoomHeaderActions">
          <span className="statusPill">
            {role ? `${role} · ${mediaState.phase}` : "awaiting authority"}
          </span>
          {isHost ? (
            <button
              className="secondaryButton"
              type="button"
              onClick={() =>
                room &&
                sendCommand({
                  type: "set_room_lock",
                  actorUserId: userId,
                  locked: !room.locked,
                })
              }
              disabled={!synchronized}
            >
              {room?.locked ? "Unlock room" : "Lock room"}
            </button>
          ) : null}
          {isHost ? (
            <button
              className="dangerButton"
              type="button"
              onClick={() => void closeRoom()}
              disabled={busyAction === "close"}
            >
              {busyAction === "close" ? "Closing…" : "Close room"}
            </button>
          ) : null}
        </div>
      </section>

      {syncState.status !== "synchronized" ? (
        <div className="notice liveRoomNotice">
          {syncState.status === "resync_required"
            ? "Room authority changed out of sequence. Publication is suspended while Ponder+ reconnects and resynchronizes."
            : "Connecting to authoritative room state. Microphone and camera remain unavailable until synchronization completes."}
        </div>
      ) : null}

      {notice ? <div className="notice liveRoomNotice">{notice}</div> : null}

      <section className="liveRoomLayout">
        <div className="liveRoomStage">
          <div className="liveParticipantGrid">
            {participantRows.map((participant) => (
              <ParticipantTile
                key={participant.userId}
                participant={participant}
                selfUserId={userId}
                provider={providerRef.current}
                canModerate={isHost}
                demoting={busyAction === `demote:${participant.userId}`}
                onDemote={() => void demoteSpeaker(participant.userId)}
              />
            ))}
            {participantRows.length === 0 ? (
              <div className="liveEmptyState">
                <strong>Waiting for room state…</strong>
                <span>Participants appear after the authoritative snapshot arrives.</span>
              </div>
            ) : null}
          </div>

          <div className="liveControlBar">
            <button
              className={mediaState.microphoneRequested ? "primaryButton" : "secondaryButton"}
              type="button"
              disabled={!synchronized || !canPublish}
              onClick={() =>
                coordinatorRef.current?.setMicrophoneRequested(
                  !mediaState.microphoneRequested,
                )
              }
            >
              {mediaState.microphoneRequested ? "Mic requested · on" : "Microphone"}
            </button>
            <button
              className={mediaState.cameraRequested ? "primaryButton" : "secondaryButton"}
              type="button"
              disabled={!synchronized || !canPublish}
              onClick={() =>
                coordinatorRef.current?.setCameraRequested(
                  !mediaState.cameraRequested,
                )
              }
            >
              {mediaState.cameraRequested ? "Camera requested · on" : "Camera"}
            </button>

            {role === "viewer" ? (
              <button
                className={queued ? "primaryButton" : "secondaryButton"}
                type="button"
                disabled={!synchronized}
                onClick={() =>
                  sendCommand(
                    queued
                      ? { type: "cancel_seat", userId }
                      : { type: "request_seat", userId },
                  )
                }
              >
                {queued ? "Cancel seat request" : "Request to speak"}
              </button>
            ) : null}

            {["❤️", "👏", "💡"].map((reaction) => (
              <button
                className="reactionButton"
                key={reaction}
                type="button"
                disabled={!synchronized}
                onClick={() =>
                  sendCommand({ type: "react", userId, reaction })
                }
              >
                {reaction} {room?.reactionBuckets[reaction] ?? 0}
              </button>
            ))}
          </div>
        </div>

        <aside className="liveRoomSidebar">
          <section className="panel liveSidebarPanel">
            <p className="sectionLabel">SPEAKER QUEUE</p>
            {room?.speakerQueue.length ? (
              room.speakerQueue.map((targetUserId, index) => (
                <div className="queueRow" key={targetUserId}>
                  <span>
                    {index + 1}. {shortUserId(targetUserId)}
                  </span>
                  {isHost ? (
                    <button
                      className="secondaryButton compactButton"
                      type="button"
                      onClick={() =>
                        sendCommand({
                          type: "grant_seat",
                          actorUserId: userId,
                          targetUserId,
                        })
                      }
                    >
                      Invite up
                    </button>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="walletNote">No one is waiting for a seat.</p>
            )}
          </section>

          <section className="panel liveSidebarPanel">
            <p className="sectionLabel">MEDIA AUTHORITY</p>
            <dl className="liveDiagnostics">
              <div>
                <dt>Room Brain</dt>
                <dd>{syncState.status}</dd>
              </div>
              <div>
                <dt>SFU</dt>
                <dd>{mediaState.phase}</dd>
              </div>
              <div>
                <dt>Role</dt>
                <dd>{role ?? "pending"}</dd>
              </div>
              <div>
                <dt>Mic</dt>
                <dd>{mediaState.microphoneEnabled ? "publishing" : "off"}</dd>
              </div>
              <div>
                <dt>Camera</dt>
                <dd>{mediaState.cameraEnabled ? "publishing" : "off"}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </section>
    </main>
  );
}

function ParticipantTile({
  participant,
  selfUserId,
  provider,
  canModerate,
  demoting,
  onDemote,
}: {
  participant: {
    userId: string;
    role: RoomBrainRole;
    media: MediaParticipant | null;
  };
  selfUserId: string;
  provider: RealtimeKitMediaProvider | null;
  canModerate: boolean;
  demoting: boolean;
  onDemote: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = videoRef.current;
    if (!provider || !element || !participant.media?.cameraEnabled) return;

    try {
      return provider.registerVideoElement(participant.userId, element);
    } catch {
      return;
    }
  }, [participant.userId, participant.media?.cameraEnabled, provider]);

  const isSelf = participant.userId === selfUserId;

  return (
    <article className="liveParticipantCard">
      <div className="liveVideoFrame">
        {participant.media?.cameraEnabled ? (
          <video ref={videoRef} autoPlay playsInline muted={isSelf} />
        ) : (
          <div className="liveAvatar">
            {isSelf ? "You" : shortUserId(participant.userId).slice(0, 2)}
          </div>
        )}
        <span className="liveRoleBadge">{participant.role}</span>
      </div>
      <div className="liveParticipantMeta">
        <strong>{isSelf ? "You" : shortUserId(participant.userId)}</strong>
        <span>
          {participant.media?.microphoneEnabled ? "mic on" : "mic off"} ·{" "}
          {participant.media?.cameraEnabled ? "camera on" : "camera off"}
        </span>
        {canModerate && participant.role === "speaker" && !isSelf ? (
          <button
            className="secondaryButton compactButton"
            type="button"
            onClick={onDemote}
            disabled={demoting}
          >
            {demoting ? "Demoting…" : "Return to audience"}
          </button>
        ) : null}
      </div>
    </article>
  );
}

function shortUserId(userId: string) {
  return userId.length > 12
    ? `${userId.slice(0, 6)}…${userId.slice(-4)}`
    : userId;
}

function roleRank(role: RoomBrainRole) {
  switch (role) {
    case "host":
      return 0;
    case "moderator":
      return 1;
    case "speaker":
      return 2;
    case "viewer":
      return 3;
  }
}
