"use client";

import { FormEvent, useState } from "react";

const intents = [
  ["talk", "Talk"],
  ["meet", "Meet"],
  ["deep_conversation", "Deep conversation"],
  ["create", "Create"],
  ["debate", "Debate"],
  ["listen", "Listen"],
  ["hang_out", "Hang out"],
] as const;

export function CreateRoomPanel() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");

    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") ?? "");
    const description = String(form.get("description") ?? "");
    const currentIntent = String(form.get("currentIntent") ?? "talk");
    const maxParticipants = Number(form.get("maxParticipants") ?? 8);

    try {
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          description,
          currentIntent,
          maxParticipants,
        }),
        cache: "no-store",
      });

      const payload = (await response.json().catch(() => ({}))) as {
        roomId?: string;
        error?: string;
      };

      if (!response.ok || !payload.roomId) {
        throw new Error(payload.error ?? "Unable to create room.");
      }

      window.location.assign(`/rooms/${encodeURIComponent(payload.roomId)}`);
    } catch (cause) {
      setBusy(false);
      setError(
        cause instanceof Error ? cause.message : "Unable to create room.",
      );
    }
  }

  if (!open) {
    return (
      <button className="primaryButton" type="button" onClick={() => setOpen(true)}>
        Create live room
      </button>
    );
  }

  return (
    <form className="panel createRoomPanel" onSubmit={submit}>
      <div className="createRoomHeading">
        <div>
          <p className="sectionLabel">START A SMALL ROOM</p>
          <h2>Create with intent.</h2>
        </div>
        <button
          className="secondaryButton"
          type="button"
          onClick={() => setOpen(false)}
          disabled={busy}
        >
          Cancel
        </button>
      </div>

      <div className="createRoomFields">
        <label>
          Room title
          <input
            name="title"
            required
            minLength={3}
            maxLength={100}
            placeholder="What do you want to talk about?"
          />
        </label>

        <label>
          Intent
          <select name="currentIntent" defaultValue="talk">
            {intents.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="createRoomDescription">
          Description
          <textarea
            name="description"
            maxLength={2000}
            rows={3}
            placeholder="Give people a reason to join."
          />
        </label>

        <label>
          Capacity
          <select name="maxParticipants" defaultValue="8">
            {[4, 6, 8, 12, 16, 24].map((capacity) => (
              <option key={capacity} value={capacity}>
                {capacity} people
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? <div className="notice">{error}</div> : null}

      <button className="primaryButton" type="submit" disabled={busy}>
        {busy ? "Provisioning secure room…" : "Open room"}
      </button>
    </form>
  );
}
