"use client";

import { useRouter } from "next/navigation";

export default function DashboardHeader() {
  // O router permite navegar entre as páginas através do código.
  const router = useRouter();

  function handleLogout() {
    // Por enquanto não existe sessão real.
    // Apenas retornamos o usuário para a tela de login.
    router.push("/");
  }

  return (
    <header className="flex flex-col gap-4 border-b border-zinc-800 pb-6 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-medium text-blue-400">
          ConnectAI
        </p>

        <h1 className="mt-2 text-3xl font-bold">
          Dashboard
        </h1>

        <p className="mt-2 text-zinc-400">
          Bem-vindo ao seu espaço de comunicação.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="text-sm font-medium">
            Usuário
          </p>

          <p className="text-xs text-zinc-500">
            usuario@email.com
          </p>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="cursor-pointer rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-900 hover:text-white"
        >
          Sair
        </button>
      </div>
    </header>
  );
}