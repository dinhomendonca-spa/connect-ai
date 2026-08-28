import Link from "next/link";

import MeetingControls from "@/components/MeetingControls";

export default function NovaReuniaoPage() {
  return (
    // Página utilizada para preparar os dispositivos antes da reunião.
    <main className="min-h-screen bg-zinc-950 px-6 py-8 text-white">
      <section className="mx-auto w-full max-w-6xl">
        <header className="flex flex-col gap-4 border-b border-zinc-800 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-blue-400">
              ConnectAI
            </p>

            <h1 className="mt-2 text-3xl font-bold">
              Nova reunião
            </h1>

            <p className="mt-2 text-zinc-400">
              Prepare sua câmera e microfone antes de iniciar a conversa.
            </p>
          </div>

          <Link
            href="/dashboard"
            className="w-fit rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-900 hover:text-white"
          >
            Voltar ao Dashboard
          </Link>
        </header>

        {/* Responsável pela câmera, microfone e seus controles. */}
        <MeetingControls />
      </section>
    </main>
  );
}