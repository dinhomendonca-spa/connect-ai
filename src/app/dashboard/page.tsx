export default function DashboardPage() {
    return (
      // Página principal que será exibida após o login.
      <main className="min-h-screen bg-zinc-950 px-6 py-10 text-white">
        <section className="mx-auto w-full max-w-5xl">
          <header>
            <p className="text-sm font-medium text-blue-400">
              ConnectAI
            </p>
  
            <h1 className="mt-2 text-3xl font-bold">
              Dashboard
            </h1>
  
            <p className="mt-2 text-zinc-400">
              Bem-vindo ao seu espaço de comunicação.
            </p>
          </header>
  
          {/* Área onde adicionaremos as funcionalidades do usuário. */}
          <section className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <article className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
              <h2 className="text-lg font-semibold">
                Nova reunião
              </h2>
  
              <p className="mt-2 text-sm text-zinc-400">
                Crie uma sala para iniciar uma nova conversa.
              </p>
            </article>
  
            <article className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
              <h2 className="text-lg font-semibold">
                Reuniões
              </h2>
  
              <p className="mt-2 text-sm text-zinc-400">
                Acompanhe suas reuniões agendadas e recentes.
              </p>
            </article>
  
            <article className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
              <h2 className="text-lg font-semibold">
                Histórico
              </h2>
  
              <p className="mt-2 text-sm text-zinc-400">
                Consulte conversas e reuniões anteriores.
              </p>
            </article>
          </section>
        </section>
      </main>
    );
  }