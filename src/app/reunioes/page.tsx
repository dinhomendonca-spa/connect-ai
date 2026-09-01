"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useState,
} from "react";

import PlatformShell from "@/components/layout/PlatformShell";
import { supabase } from "@/lib/supabase";

type Meeting = {
  id: string;
  folder_id: string | null;
  host_id: string;
  room_id: string;
  title: string;
  participants: unknown;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number;
  created_at: string;
};

function formatDate(
  value: string | null
) {
  if (!value) {
    return "Data não informada";
  }

  try {
    return new Intl.DateTimeFormat(
      "pt-BR",
      {
        dateStyle: "medium",
        timeStyle: "short",
      }
    ).format(
      new Date(value)
    );
  } catch {
    return value;
  }
}

function formatDuration(
  seconds: number
) {
  if (
    !Number.isFinite(seconds) ||
    seconds <= 0
  ) {
    return "Duração não informada";
  }

  const hours =
    Math.floor(
      seconds / 3600
    );

  const minutes =
    Math.floor(
      (seconds % 3600) / 60
    );

  if (hours > 0) {
    return `${hours}h ${minutes}min`;
  }

  return `${Math.max(
    1,
    minutes
  )} min`;
}

export default function ReunioesPage() {
  const [
    meetings,
    setMeetings,
  ] = useState<Meeting[]>([]);

  const [
    isLoading,
    setIsLoading,
  ] = useState(true);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const loadMeetings =
    useCallback(
      async () => {
        setIsLoading(true);
        setErrorMessage("");

        const {
          data: userData,
          error: userError,
        } =
          await supabase.auth.getUser();

        if (
          userError ||
          !userData.user
        ) {
          setErrorMessage(
            "Não foi possível identificar o usuário."
          );

          setIsLoading(false);

          return;
        }

        const {
          data,
          error,
        } =
          await supabase
            .from("meetings")
            .select(
              "id, folder_id, host_id, room_id, title, participants, started_at, ended_at, duration_seconds, created_at"
            )
            .eq(
              "host_id",
              userData.user.id
            )
            .order(
              "created_at",
              {
                ascending: false,
              }
            )
            .limit(20);

        if (error) {
          console.error(
            "Erro ao carregar reuniões:",
            error
          );

          setErrorMessage(
            "Não foi possível carregar suas reuniões."
          );

          setIsLoading(false);

          return;
        }

        setMeetings(
          (data || []) as Meeting[]
        );

        setIsLoading(false);
      },
      []
    );

  useEffect(() => {
    void loadMeetings();
  }, [loadMeetings]);

  return (
    <PlatformShell>
      <div className="space-y-5 sm:space-y-6">
        <section className="relative overflow-hidden rounded-[1.75rem] border border-cyan-400/15 bg-white/[0.035] p-4 shadow-2xl shadow-black/10 backdrop-blur-2xl sm:p-6">
          <div className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-cyan-500/15 blur-3xl" />

          <div className="pointer-events-none absolute -bottom-20 -left-20 h-48 w-48 rounded-full bg-sky-500/10 blur-3xl" />

          <div className="relative">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_14px_rgba(34,211,238,0.9)]" />

              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-300">
                ConnectAI Meet
              </p>
            </div>

            <h1 className="mt-3 text-2xl font-bold leading-tight tracking-tight text-white sm:text-3xl">
              Sala de Reuniões
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
              Crie conversas, convide participantes e acompanhe suas
              reuniões em um único espaço.
            </p>

            <div className="mt-5 grid grid-cols-2 gap-2.5 sm:flex sm:flex-wrap">
              <Link
                href="/reuniao/nova"
                className="group flex min-h-16 items-center gap-3 rounded-2xl border border-cyan-300/20 bg-cyan-400/[0.08] px-3 shadow-[0_12px_35px_rgba(34,211,238,0.10)] backdrop-blur-2xl transition hover:-translate-y-0.5 hover:bg-cyan-400/[0.14] sm:min-w-48 sm:px-4"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-400/10 text-lg">
                  🎥
                </span>

                <span className="min-w-0 text-left">
                  <span className="block text-[10px] text-cyan-300/70">
                    Criar
                  </span>

                  <span className="block truncate text-xs font-bold text-cyan-50 sm:text-sm">
                    Nova reunião
                  </span>
                </span>
              </Link>

              <Link
                href="/dashboard"
                className="group flex min-h-16 items-center gap-3 rounded-2xl border border-blue-300/15 bg-blue-400/[0.06] px-3 shadow-[0_12px_35px_rgba(59,130,246,0.08)] backdrop-blur-2xl transition hover:-translate-y-0.5 hover:bg-blue-400/[0.12] sm:min-w-48 sm:px-4"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-300/15 bg-blue-400/10 text-lg">
                  📁
                </span>

                <span className="min-w-0 text-left">
                  <span className="block text-[10px] text-blue-300/70">
                    Organizar
                  </span>

                  <span className="block truncate text-xs font-bold text-blue-50 sm:text-sm">
                    Workspace
                  </span>
                </span>
              </Link>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-3 gap-2.5">
          <article className="rounded-2xl border border-cyan-400/10 bg-cyan-500/[0.04] p-3 text-center backdrop-blur-xl">
            <p className="text-xl font-bold text-cyan-100">
              {meetings.length}
            </p>

            <p className="mt-1 text-[9px] uppercase tracking-wide text-zinc-500">
              Recentes
            </p>
          </article>

          <article className="rounded-2xl border border-emerald-400/10 bg-emerald-500/[0.04] p-3 text-center backdrop-blur-xl">
            <p className="text-xl font-bold text-emerald-100">
              ●
            </p>

            <p className="mt-1 text-[9px] uppercase tracking-wide text-zinc-500">
              Online
            </p>
          </article>

          <article className="rounded-2xl border border-blue-400/10 bg-blue-500/[0.04] p-3 text-center backdrop-blur-xl">
            <p className="text-xl font-bold text-blue-100">
              P2P
            </p>

            <p className="mt-1 text-[9px] uppercase tracking-wide text-zinc-500">
              WebRTC
            </p>
          </article>
        </section>

        <section>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-400">
                Histórico
              </p>

              <h2 className="mt-1 text-lg font-bold text-white sm:text-xl">
                Reuniões recentes
              </h2>

              <p className="mt-1 text-xs leading-5 text-zinc-500">
                Abra o relatório completo de cada conversa.
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                void loadMeetings()
              }
              className="shrink-0 rounded-xl border border-cyan-400/15 bg-cyan-500/[0.06] px-3 py-2 text-[10px] font-semibold text-cyan-200 backdrop-blur-xl transition hover:bg-cyan-500/10"
            >
              ↻ Atualizar
            </button>
          </div>

          {errorMessage && (
            <div className="mb-3 rounded-2xl border border-red-400/15 bg-red-500/[0.08] px-4 py-3 text-xs text-red-200 backdrop-blur-xl">
              {errorMessage}
            </div>
          )}

          {isLoading ? (
            <div className="flex min-h-48 items-center justify-center rounded-[1.5rem] border border-white/[0.08] bg-white/[0.025] backdrop-blur-xl">
              <div className="text-center">
                <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-cyan-400" />

                <p className="mt-4 text-xs text-zinc-500">
                  Carregando reuniões...
                </p>
              </div>
            </div>
          ) : meetings.length === 0 ? (
            <div className="rounded-[1.5rem] border border-dashed border-cyan-400/15 bg-white/[0.025] px-5 py-10 text-center backdrop-blur-xl">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-500/10 text-2xl">
                🎥
              </div>

              <h3 className="mt-4 text-base font-bold text-white">
                Nenhuma reunião ainda
              </h3>

              <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-zinc-500">
                Quando você criar sua primeira reunião, ela aparecerá
                automaticamente aqui.
              </p>

              <Link
                href="/reuniao/nova"
                className="mt-5 inline-flex min-h-12 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-500/10 px-5 text-xs font-bold text-cyan-100 backdrop-blur-xl transition hover:bg-cyan-500/15"
              >
                Criar primeira reunião
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {meetings.map(
                (meeting) => (
                  <article
                    key={meeting.id}
                    className="rounded-[1.35rem] border border-white/[0.08] bg-white/[0.025] p-3.5 shadow-lg shadow-black/5 backdrop-blur-xl sm:p-4"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan-400/15 bg-cyan-500/10 text-lg">
                        🎥
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="truncate text-sm font-semibold text-white sm:text-base">
                            {meeting.title ||
                              "Reunião"}
                          </h3>

                          <span className="shrink-0 rounded-full border border-emerald-400/15 bg-emerald-500/[0.08] px-2 py-1 text-[9px] font-semibold text-emerald-300">
                            Salva
                          </span>
                        </div>

                        <p className="mt-1 text-[11px] text-zinc-500">
                          {formatDate(
                            meeting.started_at ||
                              meeting.created_at
                          )}
                        </p>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span className="rounded-lg border border-white/[0.06] bg-white/[0.025] px-2 py-1 text-[9px] text-zinc-500">
                            {formatDuration(
                              meeting.duration_seconds
                            )}
                          </span>

                          <span className="max-w-full truncate rounded-lg border border-white/[0.06] bg-white/[0.025] px-2 py-1 text-[9px] text-zinc-500">
                            Sala{" "}
                            {meeting.room_id}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 border-t border-white/[0.06] pt-3">
                      <Link
                        href={`/reunioes/${meeting.id}`}
                        className="flex min-h-12 w-full items-center justify-between rounded-2xl border border-cyan-300/20 bg-cyan-500/[0.08] px-4 text-xs font-bold text-cyan-100 shadow-[0_10px_30px_rgba(34,211,238,0.07)] backdrop-blur-xl transition hover:border-cyan-300/30 hover:bg-cyan-500/[0.14]"
                      >
                        <span className="flex items-center gap-2">
                          <span>
                            📄
                          </span>

                          <span>
                            Ver relatório
                          </span>
                        </span>

                        <span className="text-cyan-300">
                          →
                        </span>
                      </Link>
                    </div>
                  </article>
                )
              )}
            </div>
          )}
        </section>

        <section className="pb-6">
          <div className="rounded-[1.5rem] border border-cyan-400/10 bg-cyan-500/[0.035] p-4 backdrop-blur-xl sm:p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-400/15 bg-cyan-500/10 text-lg">
                ✦
              </div>

              <div>
                <p className="text-sm font-semibold text-white">
                  ConnectAI Meet
                </p>

                <p className="mt-1 text-xs leading-5 text-zinc-500">
                  Os relatórios das suas reuniões ficam disponíveis
                  diretamente no histórico para consulta.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </PlatformShell>
  );
}