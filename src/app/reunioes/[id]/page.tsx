"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  useParams,
  useRouter,
} from "next/navigation";

import RequireAuth from "@/components/RequireAuth";
import { supabase } from "@/lib/supabase";

type SavedTranscriptEntry = {
  id?: string;
  senderId?: string;
  senderName?: string;
  text?: string;
  time?: string;
  createdAt?: number | null;
};

type SavedParticipant = {
  name?: string;
  role?: string;
};

type MeetingReportActionItem = {
  task: string;
  owner: string;
  deadline: string;
};

type MeetingReportClarification = {
  topic: string;
  explanation: string;
};

type MeetingReport = {
  id?: string;
  roomId?: string;
  generatedAt?: number;
  startedAt?: number;
  durationSeconds?: number;
  participants?: string[];
  transcriptEntryCount?: number;
  title?: string;
  executiveSummary?: string;
  topics?: string[];
  keyPoints?: string[];
  decisions?: string[];
  actionItems?: MeetingReportActionItem[];
  conversationAnalysis?: {
    overview?: string;
    alignment?: string;
    divergences?: string;
    communicationClarity?: string;
    risksAndAttentionPoints?: string[];
  };
  clarifications?: MeetingReportClarification[];
  unresolvedPoints?: string[];
};

type SavedMeeting = {
  id: string;
  folder_id: string | null;
  host_id: string;
  room_id: string;
  title: string;
  participants: unknown;
  transcript: unknown;
  report: unknown;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number;
  created_at: string;
};

function formatDate(
  value:
    | string
    | null
    | undefined
) {
  if (!value) {
    return "Não informado";
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

function formatTimestamp(
  value:
    | number
    | undefined
) {
  if (
    !value ||
    !Number.isFinite(value)
  ) {
    return "Não informado";
  }

  return new Date(
    value
  ).toLocaleString(
    "pt-BR",
    {
      dateStyle: "short",
      timeStyle: "short",
    }
  );
}

function formatDuration(
  totalSeconds:
    | number
    | undefined
) {
  if (
    !Number.isFinite(
      totalSeconds
    ) ||
    !totalSeconds ||
    totalSeconds <= 0
  ) {
    return "Duração não informada";
  }

  const hours =
    Math.floor(
      totalSeconds / 3600
    );

  const minutes =
    Math.floor(
      (totalSeconds % 3600) /
        60
    );

  const seconds =
    Math.floor(
      totalSeconds % 60
    );

  if (hours > 0) {
    return `${hours}h ${minutes}min ${seconds}s`;
  }

  if (minutes > 0) {
    return `${minutes}min ${seconds}s`;
  }

  return `${seconds}s`;
}

function asReport(
  value: unknown
): MeetingReport | null {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  return value as MeetingReport;
}

function asTranscript(
  value: unknown
): SavedTranscriptEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item) =>
      item &&
      typeof item ===
        "object"
  ) as SavedTranscriptEntry[];
}

function asParticipants(
  value: unknown
): SavedParticipant[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item) =>
      item &&
      typeof item ===
        "object"
  ) as SavedParticipant[];
}

function EmptyBlock({
  children,
}: {
  children: string;
}) {
  return (
    <p className="mt-3 text-sm leading-6 text-zinc-500">
      {children}
    </p>
  );
}

function SavedMeetingContent() {
  const params =
    useParams<{
      id: string;
    }>();

  const router =
    useRouter();

  const meetingId =
    typeof params?.id ===
      "string"
      ? params.id
      : "";

  const [
    meeting,
    setMeeting,
  ] =
    useState<SavedMeeting | null>(
      null
    );

  const [
    isLoading,
    setIsLoading,
  ] = useState(true);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  useEffect(() => {
    let active =
      true;

    async function loadMeeting() {
      if (!meetingId) {
        setErrorMessage(
          "Reunião inválida."
        );

        setIsLoading(
          false
        );

        return;
      }

      setIsLoading(
        true
      );

      setErrorMessage(
        ""
      );

      const {
        data:
          userData,
        error:
          userError,
      } =
        await supabase.auth.getUser();

      if (
        !active
      ) {
        return;
      }

      if (
        userError ||
        !userData.user
      ) {
        router.replace(
          "/"
        );

        return;
      }

      const {
        data,
        error,
      } =
        await supabase
          .from(
            "meetings"
          )
          .select(
            "id, folder_id, host_id, room_id, title, participants, transcript, report, started_at, ended_at, duration_seconds, created_at"
          )
          .eq(
            "id",
            meetingId
          )
          .maybeSingle();

      if (
        !active
      ) {
        return;
      }

      if (error) {
        console.error(
          "Erro ao carregar reunião:",
          error
        );

        setErrorMessage(
          "Não foi possível carregar esta reunião."
        );

        setIsLoading(
          false
        );

        return;
      }

      if (!data) {
        setErrorMessage(
          "Esta reunião não existe ou você não tem acesso a ela."
        );

        setIsLoading(
          false
        );

        return;
      }

      setMeeting(
        data as SavedMeeting
      );

      setIsLoading(
        false
      );
    }

    void loadMeeting();

    return () => {
      active =
        false;
    };
  }, [
    meetingId,
    router,
  ]);

  const report =
    useMemo(
      () =>
        asReport(
          meeting?.report
        ),
      [meeting]
    );

  const transcript =
    useMemo(
      () =>
        asTranscript(
          meeting?.transcript
        ),
      [meeting]
    );

  const participants =
    useMemo(
      () =>
        asParticipants(
          meeting?.participants
        ),
      [meeting]
    );

  if (isLoading) {
    return (
      <main className="min-h-screen bg-[#05070d] px-4 py-8 text-white">
        <div className="mx-auto flex min-h-[70vh] max-w-5xl items-center justify-center">
          <div className="text-center">
            <div className="mx-auto h-9 w-9 animate-spin rounded-full border-2 border-white/15 border-t-blue-400" />

            <p className="mt-4 text-sm text-zinc-400">
              Carregando reunião salva...
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (
    errorMessage ||
    !meeting
  ) {
    return (
      <main className="min-h-screen bg-[#05070d] px-4 py-8 text-white">
        <div className="mx-auto max-w-3xl">
          <Link
            href="/dashboard"
            className="text-sm font-medium text-blue-300 transition hover:text-blue-200"
          >
            ← Voltar ao Dashboard
          </Link>

          <div className="mt-8 rounded-3xl border border-red-400/20 bg-red-500/10 p-6">
            <h1 className="text-xl font-bold">
              Não foi possível abrir a reunião
            </h1>

            <p className="mt-3 text-sm leading-6 text-red-100">
              {errorMessage ||
                "Reunião não encontrada."}
            </p>
          </div>
        </div>
      </main>
    );
  }

  const reportParticipants =
    report?.participants ??
    [];

  const participantNames =
    reportParticipants.length >
      0
      ? reportParticipants
      : participants
          .map(
            (participant) =>
              String(
                participant.name ||
                  ""
              ).trim()
          )
          .filter(
            Boolean
          );

  return (
    <main className="min-h-screen bg-[#05070d] px-4 py-6 text-white sm:px-6 sm:py-8">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" />

        <div className="absolute -right-32 top-1/3 h-96 w-96 rounded-full bg-violet-500/10 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto max-w-6xl">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/dashboard"
            className="w-fit text-sm font-medium text-blue-300 transition hover:text-blue-200"
          >
            ← Voltar ao Dashboard
          </Link>

          <span className="text-xs text-zinc-600">
            Histórico somente leitura
          </span>
        </div>

        <header className="mt-5 rounded-3xl border border-white/10 bg-white/[0.045] p-5 shadow-2xl backdrop-blur-xl sm:p-7">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-emerald-400/15 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200">
              💾 Reunião salva
            </span>

            {report && (
              <span className="rounded-full border border-amber-400/15 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200">
                ✨ Relatório disponível
              </span>
            )}
          </div>

          <h1 className="mt-4 text-2xl font-bold sm:text-3xl">
            {meeting.title ||
              report?.title ||
              "Reunião"}
          </h1>

          <div className="mt-4 flex flex-wrap gap-2 text-xs text-zinc-400">
            <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5">
              📅{" "}
              {formatDate(
                meeting.started_at ||
                  meeting.created_at
              )}
            </span>

            <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5">
              ⏱{" "}
              {formatDuration(
                report?.durationSeconds ??
                  meeting.duration_seconds
              )}
            </span>

            <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5">
              👥{" "}
              {
                participantNames.length
              }{" "}
              participante(s)
            </span>

            <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5">
              📝{" "}
              {
                transcript.length
              }{" "}
              falas salvas
            </span>
          </div>

          {participantNames.length >
            0 && (
            <p className="mt-4 text-sm leading-6 text-zinc-500">
              Participantes:{" "}
              {participantNames.join(
                ", "
              )}
            </p>
          )}

          {meeting.ended_at && (
            <p className="mt-2 text-xs text-zinc-600">
              Encerrada em{" "}
              {formatDate(
                meeting.ended_at
              )}
            </p>
          )}
        </header>

        {!report ? (
          <section className="mt-5 rounded-3xl border border-amber-400/15 bg-amber-500/[0.06] p-5 sm:p-6">
            <h2 className="text-lg font-bold text-amber-100">
              📊 Relatório ainda não salvo
            </h2>

            <p className="mt-3 text-sm leading-6 text-zinc-400">
              A reunião foi salva e a transcrição pode ser consultada abaixo, mas nenhum relatório de IA foi salvo para esta conversa.
            </p>

            {transcript.length >
              0 && (
              <p className="mt-3 text-sm leading-6 text-zinc-500">
                Nas próximas reuniões, gere o relatório antes de encerrar para que ele fique disponível aqui automaticamente.
              </p>
            )}
          </section>
        ) : (
          <section className="mt-5 space-y-4">
            <article className="rounded-3xl border border-blue-400/15 bg-blue-500/[0.06] p-5 sm:p-6">
              <h2 className="font-bold text-blue-200">
                📌 Resumo executivo
              </h2>

              <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-zinc-200">
                {report.executiveSummary ||
                  "Não definido durante a reunião."}
              </p>
            </article>

            <div className="grid gap-4 lg:grid-cols-2">
              <article className="rounded-3xl border border-cyan-400/15 bg-cyan-500/[0.04] p-5">
                <h2 className="font-bold text-cyan-200">
                  🧩 Tópicos abordados
                </h2>

                {report.topics &&
                report.topics.length >
                  0 ? (
                  <ul className="mt-3 space-y-2 text-sm leading-6 text-zinc-300">
                    {report.topics.map(
                      (
                        item,
                        index
                      ) => (
                        <li
                          key={`topic-${index}`}
                          className="flex gap-2"
                        >
                          <span className="text-cyan-400">
                            •
                          </span>

                          <span>
                            {item}
                          </span>
                        </li>
                      )
                    )}
                  </ul>
                ) : (
                  <EmptyBlock>
                    Nenhum tópico registrado.
                  </EmptyBlock>
                )}
              </article>

              <article className="rounded-3xl border border-violet-400/15 bg-violet-500/[0.04] p-5">
                <h2 className="font-bold text-violet-200">
                  🔎 Principais pontos
                </h2>

                {report.keyPoints &&
                report.keyPoints.length >
                  0 ? (
                  <ul className="mt-3 space-y-2 text-sm leading-6 text-zinc-300">
                    {report.keyPoints.map(
                      (
                        item,
                        index
                      ) => (
                        <li
                          key={`key-${index}`}
                          className="flex gap-2"
                        >
                          <span className="text-violet-400">
                            •
                          </span>

                          <span>
                            {item}
                          </span>
                        </li>
                      )
                    )}
                  </ul>
                ) : (
                  <EmptyBlock>
                    Nenhum ponto principal registrado.
                  </EmptyBlock>
                )}
              </article>
            </div>

            <article className="rounded-3xl border border-emerald-400/15 bg-emerald-500/[0.05] p-5">
              <h2 className="font-bold text-emerald-200">
                ✅ Decisões tomadas
              </h2>

              {report.decisions &&
              report.decisions.length >
                0 ? (
                <ul className="mt-3 space-y-2 text-sm leading-6 text-zinc-300">
                  {report.decisions.map(
                    (
                      item,
                      index
                    ) => (
                      <li
                        key={`decision-${index}`}
                        className="flex gap-2"
                      >
                        <span className="text-emerald-400">
                          •
                        </span>

                        <span>
                          {item}
                        </span>
                      </li>
                    )
                  )}
                </ul>
              ) : (
                <EmptyBlock>
                  Nenhuma decisão registrada.
                </EmptyBlock>
              )}
            </article>

            <article className="rounded-3xl border border-purple-400/15 bg-purple-500/[0.05] p-5">
              <h2 className="font-bold text-purple-200">
                🚀 Pendências e próximos passos
              </h2>

              {report.actionItems &&
              report.actionItems.length >
                0 ? (
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {report.actionItems.map(
                    (
                      item,
                      index
                    ) => (
                      <div
                        key={`action-${index}`}
                        className="rounded-2xl border border-white/10 bg-black/20 p-4"
                      >
                        <p className="text-sm leading-6 text-zinc-200">
                          {item.task}
                        </p>

                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-500">
                          <span className="rounded-lg bg-white/5 px-2 py-1">
                            👤{" "}
                            {item.owner}
                          </span>

                          <span className="rounded-lg bg-white/5 px-2 py-1">
                            📅{" "}
                            {item.deadline}
                          </span>
                        </div>
                      </div>
                    )
                  )}
                </div>
              ) : (
                <EmptyBlock>
                  Nenhuma pendência registrada.
                </EmptyBlock>
              )}
            </article>

            <article className="rounded-3xl border border-orange-400/15 bg-orange-500/[0.05] p-5">
              <h2 className="font-bold text-orange-200">
                🧠 Análise da conversa
              </h2>

              <div className="mt-4 space-y-4 text-sm leading-7 text-zinc-300">
                <p>
                  <strong className="text-zinc-100">
                    Visão geral:
                  </strong>{" "}
                  {report.conversationAnalysis
                    ?.overview ||
                    "Não definido durante a reunião."}
                </p>

                <p>
                  <strong className="text-zinc-100">
                    Alinhamento:
                  </strong>{" "}
                  {report.conversationAnalysis
                    ?.alignment ||
                    "Não definido durante a reunião."}
                </p>

                <p>
                  <strong className="text-zinc-100">
                    Divergências:
                  </strong>{" "}
                  {report.conversationAnalysis
                    ?.divergences ||
                    "Não definido durante a reunião."}
                </p>

                <p>
                  <strong className="text-zinc-100">
                    Clareza:
                  </strong>{" "}
                  {report.conversationAnalysis
                    ?.communicationClarity ||
                    "Não definido durante a reunião."}
                </p>

                {report
                  .conversationAnalysis
                  ?.risksAndAttentionPoints &&
                report
                  .conversationAnalysis
                  .risksAndAttentionPoints
                  .length >
                  0 && (
                  <div>
                    <strong className="text-zinc-100">
                      Pontos de atenção:
                    </strong>

                    <ul className="mt-2 space-y-2">
                      {report.conversationAnalysis.risksAndAttentionPoints.map(
                        (
                          item,
                          index
                        ) => (
                          <li
                            key={`risk-${index}`}
                            className="flex gap-2"
                          >
                            <span className="text-orange-400">
                              •
                            </span>

                            <span>
                              {item}
                            </span>
                          </li>
                        )
                      )}
                    </ul>
                  </div>
                )}
              </div>
            </article>

            <div className="grid gap-4 lg:grid-cols-2">
              <article className="rounded-3xl border border-cyan-400/15 bg-cyan-500/[0.04] p-5">
                <h2 className="font-bold text-cyan-200">
                  💡 Esclarecimentos
                </h2>

                {report.clarifications &&
                report.clarifications
                  .length >
                  0 ? (
                  <div className="mt-3 space-y-3">
                    {report.clarifications.map(
                      (
                        item,
                        index
                      ) => (
                        <div
                          key={`clarification-${index}`}
                          className="rounded-2xl border border-white/10 bg-black/20 p-4"
                        >
                          <strong className="text-sm text-zinc-100">
                            {item.topic}
                          </strong>

                          <p className="mt-2 text-sm leading-6 text-zinc-400">
                            {
                              item.explanation
                            }
                          </p>
                        </div>
                      )
                    )}
                  </div>
                ) : (
                  <EmptyBlock>
                    Nenhum esclarecimento registrado.
                  </EmptyBlock>
                )}
              </article>

              <article className="rounded-3xl border border-yellow-400/15 bg-yellow-500/[0.04] p-5">
                <h2 className="font-bold text-yellow-200">
                  ⚠️ Pontos não definidos
                </h2>

                {report.unresolvedPoints &&
                report.unresolvedPoints
                  .length >
                  0 ? (
                  <ul className="mt-3 space-y-2 text-sm leading-6 text-zinc-300">
                    {report.unresolvedPoints.map(
                      (
                        item,
                        index
                      ) => (
                        <li
                          key={`unresolved-${index}`}
                          className="flex gap-2"
                        >
                          <span className="text-yellow-400">
                            •
                          </span>

                          <span>
                            {item}
                          </span>
                        </li>
                      )
                    )}
                  </ul>
                ) : (
                  <EmptyBlock>
                    Nenhum ponto pendente registrado.
                  </EmptyBlock>
                )}
              </article>
            </div>

            {report.generatedAt && (
              <p className="px-1 text-xs text-zinc-600">
                Relatório gerado em{" "}
                {formatTimestamp(
                  report.generatedAt
                )}
              </p>
            )}
          </section>
        )}

        <section className="mt-5 pb-12">
          <div className="mb-4">
            <h2 className="text-xl font-bold">
              🎙️ Transcrição salva
            </h2>

            <p className="mt-1 text-sm text-zinc-500">
              Histórico das falas registradas durante a reunião.
            </p>
          </div>

          {transcript.length ===
          0 ? (
            <div className="rounded-3xl border border-zinc-800 bg-zinc-900/50 px-6 py-10 text-center text-sm text-zinc-500">
              Nenhuma transcrição foi salva nesta reunião.
            </div>
          ) : (
            <div className="space-y-3">
              {transcript.map(
                (
                  entry,
                  index
                ) => (
                  <article
                    key={
                      entry.id ||
                      `transcript-${index}`
                    }
                    className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <strong className="truncate text-sm text-cyan-200">
                        {entry.senderName ||
                          "Participante"}
                      </strong>

                      <span className="shrink-0 text-xs text-zinc-600">
                        {entry.time ||
                          ""}
                      </span>
                    </div>

                    <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-zinc-300">
                      {entry.text ||
                        ""}
                    </p>
                  </article>
                )
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

export default function SavedMeetingPage() {
  return (
    <RequireAuth>
      <SavedMeetingContent />
    </RequireAuth>
  );
}