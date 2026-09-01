import PlatformShell from "@/components/layout/PlatformShell";

export default function SocialPage() {
  return (
    <PlatformShell>
      <div className="space-y-5 sm:space-y-6">
        <section className="relative overflow-hidden rounded-[1.75rem] border border-pink-400/15 bg-white/[0.035] p-4 shadow-2xl shadow-black/10 backdrop-blur-2xl sm:p-6">
          <div className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-pink-500/15 blur-3xl" />

          <div className="pointer-events-none absolute -bottom-20 -left-20 h-48 w-48 rounded-full bg-rose-500/10 blur-3xl" />

          <div className="relative">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-pink-400 shadow-[0_0_14px_rgba(244,114,182,0.9)]" />

              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-pink-300">
                ConnectAI Social
              </p>
            </div>

            <h1 className="mt-3 text-2xl font-bold leading-tight tracking-tight text-white sm:text-3xl">
              Conecte-se com pessoas
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
              Encontre pessoas com interesses em comum, converse,
              organize seus contatos e transforme conexões em
              reuniões, projetos e novas ideias.
            </p>

            <div className="mt-5">
              <label className="block">
                <span className="sr-only">
                  Pesquisar pessoas
                </span>

                <div className="flex min-h-14 items-center gap-3 rounded-2xl border border-pink-400/15 bg-black/20 px-4 shadow-lg shadow-pink-500/5 backdrop-blur-xl transition focus-within:border-pink-400/30 focus-within:bg-pink-500/[0.04]">
                  <span className="shrink-0 text-pink-300">
                    ◎
                  </span>

                  <input
                    type="search"
                    placeholder="Pesquisar pessoas, interesses ou profissão..."
                    className="min-w-0 flex-1 bg-transparent text-base text-white outline-none placeholder:text-zinc-600"
                  />
                </div>
              </label>
            </div>
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-pink-400">
                Descobrir
              </p>

              <h2 className="mt-1 text-lg font-bold text-white sm:text-xl">
                Pessoas online
              </h2>
            </div>

            <span className="rounded-full border border-emerald-400/15 bg-emerald-500/[0.08] px-3 py-1.5 text-[10px] font-semibold text-emerald-300 backdrop-blur-xl">
              ● Online
            </span>
          </div>

          <div className="rounded-[1.5rem] border border-dashed border-pink-400/15 bg-white/[0.025] p-5 text-center backdrop-blur-xl sm:p-8">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-pink-400/20 bg-pink-500/10 text-2xl text-pink-200 shadow-lg shadow-pink-500/5">
              ◎
            </div>

            <h3 className="mt-4 text-base font-bold text-white">
              Descoberta de pessoas
            </h3>

            <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-zinc-500 sm:text-sm sm:leading-6">
              Aqui aparecerão usuários online, pessoas com interesses
              semelhantes e sugestões de novas conexões.
            </p>
          </div>
        </section>

        <section>
          <div className="mb-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-rose-400">
              Conexões
            </p>

            <h2 className="mt-1 text-lg font-bold text-white sm:text-xl">
              Meus contatos
            </h2>

            <p className="mt-1 text-xs leading-5 text-zinc-500 sm:text-sm">
              Organize seus contatos de acordo com o contexto de cada
              relação.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
            <article className="rounded-2xl border border-blue-400/15 bg-blue-500/[0.07] p-3 shadow-lg shadow-black/5 backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-blue-500/10">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-blue-400/15 bg-blue-500/10 text-sm">
                💼
              </div>

              <h3 className="mt-3 text-sm font-semibold text-blue-100">
                Trabalho
              </h3>

              <p className="mt-1 text-[10px] text-blue-300/60">
                Contatos profissionais
              </p>
            </article>

            <article className="rounded-2xl border border-cyan-400/15 bg-cyan-500/[0.07] p-3 shadow-lg shadow-black/5 backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-cyan-500/10">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-400/15 bg-cyan-500/10 text-sm">
                💻
              </div>

              <h3 className="mt-3 text-sm font-semibold text-cyan-100">
                Tecnologia
              </h3>

              <p className="mt-1 text-[10px] text-cyan-300/60">
                Desenvolvimento e IA
              </p>
            </article>

            <article className="rounded-2xl border border-pink-400/15 bg-pink-500/[0.07] p-3 shadow-lg shadow-black/5 backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-pink-500/10">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-pink-400/15 bg-pink-500/10 text-sm">
                🎙
              </div>

              <h3 className="mt-3 text-sm font-semibold text-pink-100">
                Podcast
              </h3>

              <p className="mt-1 text-[10px] text-pink-300/60">
                Criadores e convidados
              </p>
            </article>

            <article className="rounded-2xl border border-emerald-400/15 bg-emerald-500/[0.07] p-3 shadow-lg shadow-black/5 backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-emerald-500/10">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-400/15 bg-emerald-500/10 text-sm">
                🤝
              </div>

              <h3 className="mt-3 text-sm font-semibold text-emerald-100">
                Networking
              </h3>

              <p className="mt-1 text-[10px] text-emerald-300/60">
                Novas oportunidades
              </p>
            </article>

            <article className="col-span-2 rounded-2xl border border-white/10 bg-white/[0.025] p-3 shadow-lg shadow-black/5 backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-white/[0.05] sm:col-span-1">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-lg text-zinc-300">
                +
              </div>

              <h3 className="mt-3 text-sm font-semibold text-white">
                Nova lista
              </h3>

              <p className="mt-1 text-[10px] text-zinc-500">
                Crie seu próprio contexto
              </p>
            </article>
          </div>
        </section>

        <section className="pb-6">
          <div className="mb-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-pink-400">
              Conversas
            </p>

            <h2 className="mt-1 text-lg font-bold text-white sm:text-xl">
              Mensagens
            </h2>
          </div>

          <div className="rounded-[1.5rem] border border-pink-400/10 bg-white/[0.025] p-4 shadow-xl shadow-black/10 backdrop-blur-xl sm:p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-pink-400/20 bg-pink-500/10 text-sm font-bold text-pink-200">
                +
              </div>

              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-white">
                  Suas conversas aparecerão aqui
                </h3>

                <p className="mt-1 text-xs leading-5 text-zinc-500">
                  Depois vamos conectar mensagens em tempo real,
                  presença online e convites para reuniões.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </PlatformShell>
  );
}