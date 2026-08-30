import MeetingRoom from "@/components/MeetingRoom";
import RequireAuth from "@/components/RequireAuth";

type MeetingRoomPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function MeetingRoomPage({
  params,
}: MeetingRoomPageProps) {
  const { id } =
    await params;

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-8 text-white">
      <RequireAuth
        establishServerSession
      >
        <section className="mx-auto w-full max-w-6xl">
          <MeetingRoom
            roomId={id}
          />
        </section>
      </RequireAuth>
    </main>
  );
}
