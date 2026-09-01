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
  parent_folder_id: string | null;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

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

type FolderModalState = {
  open: boolean;
  folder: Folder | null;
  parentFolderId: string | null;
};

type SupabaseErrorLike = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
};

function logSupabaseWarning(
  label: string,
  error: unknown
) {
  const supabaseError =
    error as SupabaseErrorLike;

  console.warn(label, {
    message:
      supabaseError?.message ||
      "Erro sem mensagem",
    code:
      supabaseError?.code ||
      "sem código",
    details:
      supabaseError?.details ||
      "sem detalhes",
    hint:
      supabaseError?.hint ||
      "sem dica",
  });
}

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
  ] = useState<Folder[]>([]);

  const [
    meetings,
    setMeetings,
  ] = useState<Meeting[]>([]);

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
      open: false,
      folder: null,
      parentFolderId: null,
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
        setIsLoading(true);
        setActionError("");

        const {
          data: userData,
          error: userError,
        } =
          await supabase.auth.getUser();

        if (
          userError ||
          !userData.user
        ) {
          if (userError) {
            logSupabaseWarning(
              "Erro ao carregar usuário:",
              userError
            );
          }

          router.replace("/");
          setIsLoading(false);

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
              .from("folders")
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
              .from("meetings")
              .select(
                "id, folder_id, host_id, room_id, title, participants, started_at, ended_at, duration_seconds, created_at"
              )
              .order(
                "created_at",
                {
                  ascending:
                    false,
                }
              )
              .limit(50),
          ]);

        if (
          foldersResult.error
        ) {
          logSupabaseWarning(
            "Erro ao carregar pastas:",
            foldersResult.error
          );

          setFolders([]);

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
          logSupabaseWarning(
            "Erro ao carregar reuniões:",
            meetingsResult.error
          );

          setMeetings([]);
        } else {
          setMeetings(
            (meetingsResult.data ||
              []) as Meeting[]
          );
        }

        setIsLoading(false);
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
      open: true,
      folder: null,
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
      open: true,
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
      open: false,
      folder: null,
      parentFolderId: null,
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

    setIsSavingFolder(true);
    setActionError("");

    try {
      if (
        folderModal.folder
      ) {
        const {
          error,
        } =
          await supabase
            .from("folders")
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
            .from("folders")
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
            .select("id")
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
        open: false,
        folder: null,
        parentFolderId: null,
      });

      setFolderName("");
      setFolderDescription("");

      await loadWorkspace();
    } catch (error) {
      logSupabaseWarning(
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

    setActionError("");

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
      logSupabaseWarning(
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
    return (
      <article
        key={
          meeting.id
        }
        className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-3.5 shadow-lg shadow-black/10 backdrop-blur-xl sm:p-4"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-400/15 bg-cyan-500/10 text-base">
            🎥
          </div>

          <div className="min-w-0 flex-1">
            <h4 className="truncate text-sm font-semibold text-white sm:text-base">
              {meeting.title ||
                "Reunião"}
            </h4>

            <p className="mt-1 text-[11px] leading-5 text-zinc-500 sm:text-xs">
              {formatDate(
                meeting.started_at ||
                  meeting.created_at
              )}
            </p>

            <p className="text-[11px] text-zinc-600 sm:text-xs">
              {formatDuration(
                meeting.duration_seconds
              )}
            </p>
          </div>

          <span className="shrink-0 rounded-full border border-emerald-400/15 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-medium text-emerald-200 backdrop-blur-xl">
            Salva
          </span>
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
            : "ml-2 border-l border-white/10 pl-2 sm:ml-5 sm:pl-4"
        }
      >
        <article className="overflow-hidden rounded-[1.4rem] border border-white/[0.08] bg-white/[0.03] shadow-xl shadow-black/10 backdrop-blur-xl transition hover:border-white/[0.13] hover:bg-white/[0.045]">
          <button
            type="button"
            onClick={() =>
              toggleFolder(
                folder.id
              )
            }
            className="block w-full p-3.5 text-left sm:p-4"
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-400/15 bg-amber-500/10 text-lg">
                {isExpanded
                  ? "📂"
                  : "📁"}
              </div>

              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-semibold text-white sm:text-base">
                  {folder.name}
                </h3>

                <p className="mt-1 text-[10px] text-zinc-500 sm:text-xs">
                  {children.length}{" "}
                  {children.length === 1
                    ? "subpasta"
                    : "subpastas"}
                  {" · "}
                  {
                    folderMeetings.length
                  }{" "}
                  {folderMeetings.length ===
                  1
                    ? "reunião"
                    : "reuniões"}
                </p>
              </div>

              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-xs text-zinc-500">
                {isExpanded
                  ? "⌃"
                  : "⌄"}
              </span>
            </div>

            {folder.description && (
              <p className="mt-3 line-clamp-2 text-xs leading-5 text-zinc-400 sm:text-sm sm:leading-6">
                {
                  folder.description
                }
              </p>
            )}
          </button>

          <div className="grid grid-cols-2 gap-2 border-t border-white/[0.07] p-2.5 min-[430px]:grid-cols-4 sm:p-3">
            <Link
              href={`/reuniao/nova?folderId=${encodeURIComponent(
                folder.id
              )}`}
              className="flex min-h-10 items-center justify-center rounded-xl border border-cyan-400/15 bg-cyan-500/[0.08] px-2 text-center text-[10px] font-semibold text-cyan-200 backdrop-blur-xl transition hover:bg-cyan-500/15 sm:text-xs"
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
              className="min-h-10 rounded-xl border border-violet-400/15 bg-violet-500/[0.08] px-2 text-[10px] font-semibold text-violet-200 backdrop-blur-xl transition hover:bg-violet-500/15 sm:text-xs"
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
              className="min-h-10 rounded-xl border border-white/[0.08] bg-white/[0.035] px-2 text-[10px] font-semibold text-zinc-300 backdrop-blur-xl transition hover:bg-white/[0.07] sm:text-xs"
            >
              Editar
            </button>

            <button
              type="button"
              onClick={() =>
                void deleteFolder(
                  folder
                )
              }
              className="min-h-10 rounded-xl border border-red-400/15 bg-red-500/[0.07] px-2 text-[10px] font-semibold text-red-200 backdrop-blur-xl transition hover:bg-red-500/15 sm:text-xs"
            >
              Excluir
            </button>
          </div>

          {isExpanded && (
            <div className="space-y-2.5 border-t border-white/[0.07] p-3">
              {folderMeetings.map(
                renderMeeting
              )}

              {children.length ===
                0 &&
                folderMeetings.length ===
                  0 && (
                  <div className="rounded-xl border border-dashed border-white/[0.08] px-3 py-5 text-center text-xs text-zinc-500">
                    Esta pasta ainda está
                    vazia.
                  </div>
                )}
            </div>
          )}
        </article>

        {isExpanded &&
          children.length >
            0 && (
            <div className="mt-2.5 space-y-2.5">
              {children.map(
                (child) =>
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
      <section className="mt-5 flex min-h-52 items-center justify-center rounded-[1.5rem] border border-white/[0.08] bg-white/[0.025] backdrop-blur-xl sm:mt-8 sm:min-h-72">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-white/15 border-t-blue-400" />

          <p className="mt-4 text-sm text-zinc-400">
            Carregando seu
            workspace...
          </p>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="mt-5 sm:mt-7">
        <div className="relative overflow-hidden rounded-[1.6rem] border border-blue-400/15 bg-white/[0.035] p-4 shadow-2xl shadow-black/10 backdrop-blur-2xl sm:p-6">
          <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-violet-500/10 blur-3xl" />

          <div className="pointer-events-none absolute -bottom-20 -left-16 h-40 w-40 rounded-full bg-cyan-500/10 blur-3xl" />

          <div className="relative">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,0.8)]" />

              <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-cyan-300 sm:text-xs">
                Workspace
              </p>
            </div>

            <h2 className="mt-2 max-w-xl text-xl font-bold leading-tight tracking-tight text-white sm:text-2xl">
              Organize suas
              conversas por contexto
            </h2>

            <p className="mt-2 max-w-2xl text-xs leading-5 text-zinc-400 sm:text-sm sm:leading-6">
              Separe projetos,
              clientes, estudos e
              outras conversas em
              espaços organizados.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2.5 sm:flex sm:flex-wrap sm:gap-3">
              <Link
                href="/reuniao/nova"
                className="group relative flex min-h-14 items-center gap-2.5 overflow-hidden rounded-2xl border border-cyan-300/20 bg-cyan-400/[0.08] px-3 shadow-[0_12px_35px_rgba(34,211,238,0.10)] backdrop-blur-2xl transition hover:-translate-y-0.5 hover:border-cyan-300/30 hover:bg-cyan-400/[0.14] sm:min-w-44 sm:px-4"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-400/10 text-base">
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

              <button
                type="button"
                onClick={() =>
                  openCreateFolder()
                }
                className="group relative flex min-h-14 items-center gap-2.5 overflow-hidden rounded-2xl border border-violet-300/20 bg-violet-400/[0.08] px-3 text-left shadow-[0_12px_35px_rgba(139,92,246,0.10)] backdrop-blur-2xl transition hover:-translate-y-0.5 hover:border-violet-300/30 hover:bg-violet-400/[0.14] sm:min-w-44 sm:px-4"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-violet-300/20 bg-violet-400/10 text-base">
                  📁
                </span>

                <span className="min-w-0">
                  <span className="block text-[10px] text-violet-300/70">
                    Organizar
                  </span>

                  <span className="block truncate text-xs font-bold text-violet-50 sm:text-sm">
                    Nova pasta
                  </span>
                </span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {actionError && (
        <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-3.5 py-3 text-xs text-red-200 backdrop-blur-xl sm:text-sm">
          {actionError}
        </div>
      )}

      <section className="mt-6 sm:mt-8">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-lg">
                📁
              </span>

              <h2 className="truncate text-lg font-bold sm:text-xl">
                Minhas pastas
              </h2>
            </div>

            <p className="mt-0.5 text-[11px] text-zinc-500 sm:text-sm">
              {folders.length}{" "}
              {folders.length === 1
                ? "pasta"
                : "pastas"}{" "}
              no total
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              void loadWorkspace()
            }
            className="shrink-0 rounded-xl border border-blue-400/15 bg-blue-500/[0.06] px-3 py-2 text-[10px] font-semibold text-blue-200 backdrop-blur-xl transition hover:bg-blue-500/10 sm:text-xs"
          >
            ↻ Atualizar
          </button>
        </div>

        {rootFolders.length ===
        0 ? (
          <div className="rounded-[1.5rem] border border-dashed border-white/10 bg-white/[0.02] px-4 py-9 text-center backdrop-blur-xl sm:px-6 sm:py-12">
            <div className="text-4xl sm:text-5xl">
              📁
            </div>

            <h3 className="mt-4 text-base font-semibold sm:text-lg">
              Crie seu primeiro
              contexto
            </h3>

            <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-zinc-500 sm:text-sm sm:leading-6">
              Trabalho, clientes,
              projetos, estudos ou
              qualquer assunto que
              queira manter organizado.
            </p>

            <button
              type="button"
              onClick={() =>
                openCreateFolder()
              }
              className="mt-5 rounded-2xl border border-violet-400/20 bg-violet-500/10 px-4 py-3 text-xs font-semibold text-violet-100 backdrop-blur-xl transition hover:bg-violet-500/15 sm:text-sm"
            >
              + Criar primeira pasta
            </button>
          </div>
        ) : (
          <div className="space-y-2.5 sm:space-y-3">
            {rootFolders.map(
              (folder) =>
                renderFolder(
                  folder,
                  0
                )
            )}
          </div>
        )}
      </section>

      <section className="mt-7 sm:mt-8">
        <div className="mb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">
              📥
            </span>

            <h2 className="text-lg font-bold sm:text-xl">
              Sem pasta
            </h2>
          </div>

          <p className="mt-1 text-xs leading-5 text-zinc-500 sm:text-sm">
            Reuniões sem contexto
            escolhido aparecem aqui.
          </p>
        </div>

        <div className="space-y-2.5 rounded-[1.5rem] border border-white/[0.08] bg-white/[0.02] p-3 backdrop-blur-xl sm:p-5">
          {unfiledMeetings.length >
          0 ? (
            unfiledMeetings.map(
              renderMeeting
            )
          ) : (
            <div className="py-6 text-center text-xs text-zinc-500 sm:py-8 sm:text-sm">
              Nenhuma reunião sem
              pasta.
            </div>
          )}
        </div>
      </section>

      <section className="mt-7 pb-8 sm:mt-8 sm:pb-12">
        <div className="mb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">
              🕘
            </span>

            <h2 className="text-lg font-bold sm:text-xl">
              Reuniões recentes
            </h2>
          </div>

          <p className="mt-1 text-xs leading-5 text-zinc-500 sm:text-sm">
            Consulte rapidamente as
            conversas mais recentes.
          </p>
        </div>

        <div className="grid gap-2.5 sm:gap-3 md:grid-cols-2">
          {meetings.length >
          0 ? (
            meetings
              .slice(0, 6)
              .map(
                renderMeeting
              )
          ) : (
            <div className="md:col-span-2 rounded-[1.5rem] border border-white/[0.08] bg-white/[0.02] px-4 py-8 text-center text-xs text-zinc-500 backdrop-blur-xl sm:px-6 sm:py-10 sm:text-sm">
              Ainda não existem
              reuniões salvas neste
              workspace.
            </div>
          )}
        </div>
      </section>

      {folderModal.open && (
        <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/70 p-2 backdrop-blur-md sm:items-center sm:p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-[1.75rem] border border-white/10 bg-[#0b0d14]/95 p-4 shadow-2xl backdrop-blur-2xl sm:rounded-[1.75rem] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-300 sm:text-xs">
                  {folderModal.folder
                    ? "Editar pasta"
                    : folderModal.parentFolderId
                      ? "Nova subpasta"
                      : "Nova pasta"}
                </p>

                <h3 className="mt-2 truncate text-lg font-bold sm:text-xl">
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
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-zinc-300 transition hover:bg-white/10"
              >
                ✕
              </button>
            </div>

            <div className="mt-5 space-y-4 sm:mt-6">
              <label className="block">
                <span className="text-xs font-medium text-zinc-300 sm:text-sm">
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
                  maxLength={120}
                  autoFocus
                  placeholder="Ex.: Projeto ConnectAI"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-base text-white outline-none transition placeholder:text-zinc-600 focus:border-violet-400/40"
                />
              </label>

              <label className="block">
                <span className="text-xs font-medium text-zinc-300 sm:text-sm">
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
                  maxLength={2000}
                  rows={5}
                  placeholder="Descreva o assunto, projeto, cliente ou objetivo desta pasta."
                  className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-base text-white outline-none transition placeholder:text-zinc-600 focus:border-violet-400/40"
                />
              </label>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2 sm:mt-6 sm:flex sm:justify-end">
              <button
                type="button"
                onClick={
                  closeFolderModal
                }
                disabled={
                  isSavingFolder
                }
                className="min-h-12 rounded-xl border border-white/10 bg-white/[0.03] px-4 text-xs font-semibold text-zinc-300 transition hover:bg-white/[0.06] disabled:opacity-50 sm:text-sm"
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
                className="min-h-12 rounded-xl border border-violet-400/20 bg-violet-500/15 px-4 text-xs font-semibold text-violet-100 shadow-lg shadow-violet-500/5 backdrop-blur-xl transition hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
              >
                {isSavingFolder
                  ? "Salvando..."
                  : folderModal.folder
                    ? "Salvar"
                    : "Criar pasta"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}