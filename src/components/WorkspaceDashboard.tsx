"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase";

const CURRENT_USER_SESSION_KEY =
  "connectai-current-user";

type Folder = {
  id: string;
  owner_id: string;
  parent_folder_id:
    | string
    | null;
  name: string;
  description:
    | string
    | null;
  created_at: string;
  updated_at: string;
};

type Meeting = {
  id: string;
  folder_id:
    | string
    | null;
  host_id: string;
  room_id: string;
  title: string;
  participants: unknown;
  transcript: unknown;
  report: unknown;
  started_at:
    | string
    | null;
  ended_at:
    | string
    | null;
  duration_seconds: number;
  created_at: string;
};

type FolderModalState = {
  open: boolean;
  folder:
    | Folder
    | null;
  parentFolderId:
    | string
    | null;
};

function formatDate(
  value:
    | string
    | null
) {
  if (!value) {
    return "Data não informada";
  }

  try {
    return new Intl.DateTimeFormat(
      "pt-BR",
      {
        dateStyle:
          "medium",

        timeStyle:
          "short",
      }
    ).format(
      new Date(value)
    );
  } catch {
    return value;
  }
}

function formatDuration(
  totalSeconds: number
) {
  if (
    !Number.isFinite(
      totalSeconds
    ) ||
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

  if (hours > 0) {
    return `${hours}h ${minutes}min`;
  }

  return `${Math.max(
    1,
    minutes
  )} min`;
}

function getUserName(
  user: {
    email?: string;
    user_metadata?: {
      name?: unknown;
    };
  }
) {
  const metadataName =
    user.user_metadata?.name;

  if (
    typeof metadataName ===
      "string" &&
    metadataName.trim()
  ) {
    return metadataName.trim();
  }

  return (
    user.email?.split("@")[0] ||
    "Usuário"
  );
}

export default function WorkspaceDashboard() {
  const router =
    useRouter();

  const [
    userId,
    setUserId,
  ] = useState("");

  const [
    folders,
    setFolders,
  ] = useState<
    Folder[]
  >([]);

  const [
    meetings,
    setMeetings,
  ] = useState<
    Meeting[]
  >([]);

  const [
    expandedFolders,
    setExpandedFolders,
  ] = useState<
    Set<string>
  >(
    () =>
      new Set<string>()
  );

  const [
    isLoading,
    setIsLoading,
  ] = useState(true);

  const [
    actionError,
    setActionError,
  ] = useState("");

  const [
    isSavingFolder,
    setIsSavingFolder,
  ] = useState(false);

  const [
    folderModal,
    setFolderModal,
  ] =
    useState<FolderModalState>({
      open:
        false,

      folder:
        null,

      parentFolderId:
        null,
    });

  const [
    folderName,
    setFolderName,
  ] = useState("");

  const [
    folderDescription,
    setFolderDescription,
  ] = useState("");

  const loadWorkspace =
    useCallback(
      async () => {
        setIsLoading(
          true
        );

        setActionError(
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
          userError ||
          !userData.user
        ) {
          router.replace(
            "/"
          );

          setIsLoading(
            false
          );

          return;
        }

        const currentUser =
          userData.user;

        setUserId(
          currentUser.id
        );

        sessionStorage.setItem(
          CURRENT_USER_SESSION_KEY,
          JSON.stringify({
            name:
              getUserName(
                currentUser
              ),

            email:
              currentUser.email ||
              "",
          })
        );

        const [
          foldersResult,
          meetingsResult,
        ] =
          await Promise.all([
            supabase
              .from(
                "folders"
              )
              .select(
                "id, owner_id, parent_folder_id, name, description, created_at, updated_at"
              )
              .order(
                "name",
                {
                  ascending:
                    true,
                }
              ),

            supabase
              .from(
                "meetings"
              )
              .select(
                "id, folder_id, host_id, room_id, title, participants, transcript, report, started_at, ended_at, duration_seconds, created_at"
              )
              .order(
                "created_at",
                {
                  ascending:
                    false,
                }
              )
              .limit(
                50
              ),
          ]);

        if (
          foldersResult.error
        ) {
          console.error(
            "Erro ao carregar pastas:",
            foldersResult.error
          );

          setActionError(
            "Não foi possível carregar suas pastas."
          );
        } else {
          setFolders(
            (foldersResult.data ||
              []) as Folder[]
          );
        }

        if (
          meetingsResult.error
        ) {
          console.error(
            "Erro ao carregar reuniões:",
            meetingsResult.error
          );
        } else {
          setMeetings(
            (meetingsResult.data ||
              []) as Meeting[]
          );
        }

        setIsLoading(
          false
        );
      },
      [router]
    );

  useEffect(() => {
    void loadWorkspace();
  }, [
    loadWorkspace,
  ]);

  const foldersByParent =
    useMemo(() => {
      const map =
        new Map<
          string,
          Folder[]
        >();

      for (
        const folder
        of folders
      ) {
        const key =
          folder.parent_folder_id ||
          "__root__";

        const current =
          map.get(key) ||
          [];

        current.push(
          folder
        );

        map.set(
          key,
          current
        );
      }

      for (
        const list
        of map.values()
      ) {
        list.sort(
          (a, b) =>
            a.name.localeCompare(
              b.name,
              "pt-BR"
            )
        );
      }

      return map;
    }, [folders]);

  const meetingsByFolder =
    useMemo(() => {
      const map =
        new Map<
          string,
          Meeting[]
        >();

      for (
        const meeting
        of meetings
      ) {
        const key =
          meeting.folder_id ||
          "__unfiled__";

        const current =
          map.get(key) ||
          [];

        current.push(
          meeting
        );

        map.set(
          key,
          current
        );
      }

      return map;
    }, [meetings]);

  function openCreateFolder(
    parentFolderId:
      | string
      | null =
        null
  ) {
    setFolderName("");
    setFolderDescription("");

    setFolderModal({
      open:
        true,

      folder:
        null,

      parentFolderId,
    });
  }

  function openEditFolder(
    folder: Folder
  ) {
    setFolderName(
      folder.name
    );

    setFolderDescription(
      folder.description ||
      ""
    );

    setFolderModal({
      open:
        true,

      folder,

      parentFolderId:
        folder.parent_folder_id,
    });
  }

  function closeFolderModal() {
    if (
      isSavingFolder
    ) {
      return;
    }

    setFolderModal({
      open:
        false,

      folder:
        null,

      parentFolderId:
        null,
    });

    setFolderName("");
    setFolderDescription("");
  }

  async function saveFolder() {
    const name =
      folderName.trim();

    const description =
      folderDescription.trim();

    if (
      !name ||
      !userId ||
      isSavingFolder
    ) {
      return;
    }

    setIsSavingFolder(
      true
    );

    setActionError(
      ""
    );

    try {
      if (
        folderModal.folder
      ) {
        const {
          error,
        } =
          await supabase
            .from(
              "folders"
            )
            .update({
              name,
              description:
                description ||
                null,
            })
            .eq(
              "id",
              folderModal.folder.id
            );

        if (error) {
          throw error;
        }
      } else {
        const {
          data,
          error,
        } =
          await supabase
            .from(
              "folders"
            )
            .insert({
              owner_id:
                userId,

              parent_folder_id:
                folderModal.parentFolderId,

              name,

              description:
                description ||
                null,
            })
            .select(
              "id"
            )
            .single();

        if (error) {
          throw error;
        }

        if (
          folderModal.parentFolderId
        ) {
          setExpandedFolders(
            (current) => {
              const next =
                new Set(
                  current
                );

              next.add(
                folderModal.parentFolderId as string
              );

              return next;
            }
          );
        }

        if (data?.id) {
          setExpandedFolders(
            (current) => {
              const next =
                new Set(
                  current
                );

              next.add(
                data.id
              );

              return next;
            }
          );
        }
      }

      setFolderModal({
        open:
          false,

        folder:
          null,

        parentFolderId:
          null,
      });

      setFolderName("");
      setFolderDescription("");

      await loadWorkspace();
    } catch (error) {
      console.error(
        "Erro ao salvar pasta:",
        error
      );

      setActionError(
        "Não foi possível salvar a pasta."
      );
    } finally {
      setIsSavingFolder(
        false
      );
    }
  }

  async function deleteFolder(
    folder: Folder
  ) {
    const confirmed =
      window.confirm(
        `Excluir a pasta "${folder.name}"?\n\nAs subpastas também serão excluídas. Reuniões salvas serão movidas para "Sem pasta".`
      );

    if (!confirmed) {
      return;
    }

    setActionError(
      ""
    );

    const {
      error,
    } =
      await supabase
        .from("folders")
        .delete()
        .eq(
          "id",
          folder.id
        );

    if (error) {
      console.error(
        "Erro ao excluir pasta:",
        error
      );

      setActionError(
        "Não foi possível excluir a pasta."
      );

      return;
    }

    setExpandedFolders(
      (current) => {
        const next =
          new Set(
            current
          );

        next.delete(
          folder.id
        );

        return next;
      }
    );

    await loadWorkspace();
  }

  function toggleFolder(
    folderId: string
  ) {
    setExpandedFolders(
      (current) => {
        const next =
          new Set(
            current
          );

        if (
          next.has(
            folderId
          )
        ) {
          next.delete(
            folderId
          );
        } else {
          next.add(
            folderId
          );
        }

        return next;
      }
    );
  }

  function renderMeeting(
    meeting: Meeting
  ) {
    const hasReport =
      Boolean(
        meeting.report &&
          typeof meeting.report ===
            "object"
      );

    const transcriptCount =
      Array.isArray(
        meeting.transcript
      )
        ? meeting.transcript.length
        : 0;

    return (
      <article
        key={
          meeting.id
        }
        className="rounded-2xl border border-white/10 bg-black/20 p-4 transition hover:border-blue-400/25 hover:bg-white/[0.04]"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h4 className="truncate font-semibold text-white">
              🎥{" "}
              {meeting.title ||
                "Reunião"}
            </h4>

            <p className="mt-1 text-xs text-zinc-500">
              {formatDate(
                meeting.started_at ||
                  meeting.created_at
              )}
              {" · "}
              {formatDuration(
                meeting.duration_seconds
              )}
            </p>

            <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
              {transcriptCount >
                0 && (
                <span className="rounded-full border border-cyan-400/15 bg-cyan-500/10 px-2.5 py-1 text-cyan-200">
                  📝{" "}
                  {
                    transcriptCount
                  }{" "}
                  falas
                </span>
              )}

              {hasReport && (
                <span className="rounded-full border border-amber-400/15 bg-amber-500/10 px-2.5 py-1 text-amber-200">
                  ✨ Relatório disponível
                </span>
              )}

              {!hasReport &&
                transcriptCount >
                  0 && (
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-zinc-400">
                    Relatório não gerado
                  </span>
                )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-full border border-emerald-400/15 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200">
              Salva
            </span>

            <Link
              href={`/reunioes/${encodeURIComponent(
                meeting.id
              )}`}
              className="rounded-xl border border-blue-400/20 bg-blue-500/10 px-3 py-2 text-xs font-semibold text-blue-200 transition hover:bg-blue-500/20"
            >
              {hasReport
                ? "📊 Ver relatório"
                : "📄 Abrir"}
            </Link>
          </div>
        </div>
      </article>
    );
  }

  function renderFolder(
    folder: Folder,
    depth: number
  ) {
    const children =
      foldersByParent.get(
        folder.id
      ) || [];

    const folderMeetings =
      meetingsByFolder.get(
        folder.id
      ) || [];

    const isExpanded =
      expandedFolders.has(
        folder.id
      );

    return (
      <div
        key={
          folder.id
        }
        className={
          depth === 0
            ? ""
            : "ml-3 border-l border-white/10 pl-3 sm:ml-6 sm:pl-5"
        }
      >
        <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition hover:border-white/20 hover:bg-white/[0.06]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <button
              type="button"
              onClick={() =>
                toggleFolder(
                  folder.id
                )
              }
              className="min-w-0 flex-1 text-left"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">
                  {isExpanded
                    ? "📂"
                    : "📁"}
                </span>

                <div className="min-w-0">
                  <h3 className="truncate font-semibold text-white">
                    {
                      folder.name
                    }
                  </h3>

                  <p className="mt-1 text-xs text-zinc-500">
                    {
                      children.length
                    }{" "}
                    subpastas
                    {" · "}
                    {
                      folderMeetings.length
                    }{" "}
                    reuniões
                  </p>
                </div>

                <span className="ml-auto text-zinc-500">
                  {isExpanded
                    ? "⌃"
                    : "⌄"}
                </span>
              </div>

              {folder.description && (
                <p className="mt-3 line-clamp-2 text-sm leading-6 text-zinc-400">
                  {
                    folder.description
                  }
                </p>
              )}
            </button>

            <div className="flex flex-wrap gap-2">
              <Link
                href={`/reuniao/nova?folderId=${encodeURIComponent(
                  folder.id
                )}`}
                className="rounded-xl border border-blue-400/20 bg-blue-500/10 px-3 py-2 text-xs font-semibold text-blue-200 transition hover:bg-blue-500/20"
              >
                + Reunião
              </Link>

              <button
                type="button"
                onClick={() =>
                  openCreateFolder(
                    folder.id
                  )
                }
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-white/10"
              >
                + Subpasta
              </button>

              <button
                type="button"
                onClick={() =>
                  openEditFolder(
                    folder
                  )
                }
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-white/10"
              >
                ✏️ Editar
              </button>

              <button
                type="button"
                onClick={() =>
                  void deleteFolder(
                    folder
                  )
                }
                className="rounded-xl border border-red-400/15 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200 transition hover:bg-red-500/20"
              >
                🗑
              </button>
            </div>
          </div>

          {isExpanded && (
            <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
              {folderMeetings.map(
                renderMeeting
              )}

              {children.length ===
                0 &&
                folderMeetings.length ===
                  0 && (
                  <div className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-zinc-500">
                    Esta pasta ainda está vazia.
                  </div>
                )}
            </div>
          )}
        </article>

        {isExpanded &&
          children.length >
            0 && (
            <div className="mt-3 space-y-3">
              {children.map(
                (
                  child
                ) =>
                  renderFolder(
                    child,
                    depth + 1
                  )
              )}
            </div>
          )}
      </div>
    );
  }

  const rootFolders =
    foldersByParent.get(
      "__root__"
    ) || [];

  const unfiledMeetings =
    meetingsByFolder.get(
      "__unfiled__"
    ) || [];

  if (isLoading) {
    return (
      <section className="mt-8 flex min-h-72 items-center justify-center rounded-3xl border border-zinc-800 bg-zinc-900/60">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-white/15 border-t-blue-400" />

          <p className="mt-4 text-sm text-zinc-400">
            Carregando seu workspace...
          </p>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="mt-8">
        <div className="flex flex-col gap-4 rounded-3xl border border-blue-400/15 bg-gradient-to-br from-blue-500/10 via-zinc-900 to-violet-500/10 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300">
              Workspace
            </p>

            <h2 className="mt-2 text-2xl font-bold">
              Organize suas conversas por contexto
            </h2>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
              Crie pastas, subpastas e mantenha cada reunião junto do contexto certo.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/reuniao/nova"
              className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 active:scale-[0.98]"
            >
              🎥 Nova reunião
            </Link>

            <button
              type="button"
              onClick={() =>
                openCreateFolder()
              }
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10 active:scale-[0.98]"
            >
              📁 Nova pasta
            </button>
          </div>
        </div>
      </section>

      {actionError && (
        <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {actionError}
        </div>
      )}

      <section className="mt-8">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">
              📁 Minhas pastas
            </h2>

            <p className="mt-1 text-sm text-zinc-500">
              {
                folders.length
              }{" "}
              pastas no total
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              void loadWorkspace()
            }
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-300 transition hover:bg-white/10"
          >
            ↻ Atualizar
          </button>
        </div>

        {rootFolders.length ===
        0 ? (
          <div className="rounded-3xl border border-dashed border-zinc-700 bg-zinc-900/50 px-6 py-12 text-center">
            <div className="text-5xl">
              📁
            </div>

            <h3 className="mt-4 text-lg font-semibold">
              Crie seu primeiro contexto
            </h3>

            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-500">
              Por exemplo: Trabalho, Cliente XPTO, ConnectAI, Estudos ou qualquer outro assunto.
            </p>

            <button
              type="button"
              onClick={() =>
                openCreateFolder()
              }
              className="mt-5 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-500"
            >
              + Criar primeira pasta
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {rootFolders.map(
              (
                folder
              ) =>
                renderFolder(
                  folder,
                  0
                )
            )}
          </div>
        )}
      </section>

      <section className="mt-8">
        <div className="mb-4">
          <h2 className="text-xl font-bold">
            📥 Sem pasta
          </h2>

          <p className="mt-1 text-sm text-zinc-500">
            Reuniões criadas sem um contexto escolhido aparecem aqui.
          </p>
        </div>

        <div className="space-y-3 rounded-3xl border border-zinc-800 bg-zinc-900/50 p-4 sm:p-5">
          {unfiledMeetings.length >
          0 ? (
            unfiledMeetings.map(
              renderMeeting
            )
          ) : (
            <div className="py-8 text-center text-sm text-zinc-500">
              Nenhuma reunião sem pasta.
            </div>
          )}
        </div>
      </section>

      <section className="mt-8 pb-12">
        <div className="mb-4">
          <h2 className="text-xl font-bold">
            🕘 Reuniões recentes
          </h2>

          <p className="mt-1 text-sm text-zinc-500">
            Abra uma reunião para consultar o relatório e a transcrição que ficaram salvos.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {meetings.length >
          0 ? (
            meetings
              .slice(0, 6)
              .map(
                renderMeeting
              )
          ) : (
            <div className="md:col-span-2 rounded-3xl border border-zinc-800 bg-zinc-900/50 px-6 py-10 text-center text-sm text-zinc-500">
              Ainda não existem reuniões salvas neste workspace.
            </div>
          )}
        </div>
      </section>

      {folderModal.open && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#0b0d14] p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">
                  {folderModal.folder
                    ? "Editar pasta"
                    : folderModal.parentFolderId
                      ? "Nova subpasta"
                      : "Nova pasta"}
                </p>

                <h3 className="mt-2 text-xl font-bold">
                  {folderModal.folder
                    ? folderModal.folder.name
                    : "Novo contexto"}
                </h3>
              </div>

              <button
                type="button"
                onClick={
                  closeFolderModal
                }
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10"
              >
                ✕
              </button>
            </div>

            <div className="mt-6 space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-zinc-300">
                  Nome da pasta
                </span>

                <input
                  type="text"
                  value={
                    folderName
                  }
                  onChange={(
                    event
                  ) =>
                    setFolderName(
                      event.target.value
                    )
                  }
                  maxLength={
                    120
                  }
                  autoFocus
                  placeholder="Ex.: Projeto ConnectAI"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-blue-400/40"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-zinc-300">
                  Contexto / descrição
                </span>

                <textarea
                  value={
                    folderDescription
                  }
                  onChange={(
                    event
                  ) =>
                    setFolderDescription(
                      event.target.value
                    )
                  }
                  maxLength={
                    2000
                  }
                  rows={5}
                  placeholder="Descreva o assunto, projeto, cliente ou objetivo desta pasta."
                  className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-blue-400/40"
                />
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={
                  closeFolderModal
                }
                disabled={
                  isSavingFolder
                }
                className="rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-zinc-300 transition hover:bg-white/5 disabled:opacity-50"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={() =>
                  void saveFolder()
                }
                disabled={
                  !folderName.trim() ||
                  isSavingFolder
                }
                className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSavingFolder
                  ? "Salvando..."
                  : folderModal.folder
                    ? "Salvar alterações"
                    : "Criar pasta"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}