import MeetingRoom from "@/components/MeetingRoom";

type MeetingRoomPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function MeetingRoomPage({
  params,
}: MeetingRoomPageProps) {
  // Recupera o código da reunião presente na URL.
  const { id } = await params;

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-8 text-white">
      <section className="mx-auto w-full max-w-6xl">
        {/* Toda a parte interativa da reunião fica neste componente. */}
        <MeetingRoom roomId={id} />
      </section>
    </main>
  );
}