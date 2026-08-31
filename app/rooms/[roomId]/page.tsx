import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LiveRoomClient } from "@/components/LiveRoomClient";

type LiveRoomPageProps = {
  params: Promise<{ roomId: string }>;
};

export default async function LiveRoomPage({ params }: LiveRoomPageProps) {
  const { roomId } = await params;
  if (!isUuid(roomId)) notFound();

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) redirect("/auth");

  const { data: canEnter, error: accessError } = await supabase.rpc(
    "current_user_can_enter",
  );
  if (accessError) {
    throw new Error("Authorization service unavailable.");
  }
  if (!canEnter) redirect("/onboarding");

  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("id,title,description,status,created_by")
    .eq("id", roomId)
    .maybeSingle();

  if (roomError) throw new Error("Unable to load live room.");
  if (!room || room.status !== "open") notFound();

  if (room.created_by !== userData.user.id) {
    const { data: membership, error: membershipError } = await supabase
      .from("room_members")
      .select("entry_state")
      .eq("room_id", roomId)
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (membershipError) throw new Error("Unable to verify room membership.");
    if (membership?.entry_state === "ejected") notFound();
  }

  return (
    <LiveRoomClient
      roomId={room.id}
      userId={userData.user.id}
      title={room.title}
      description={room.description ?? ""}
      isHost={room.created_by === userData.user.id}
    />
  );
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
