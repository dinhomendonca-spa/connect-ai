"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase";

const ACTIVE_MEETING_SESSION_KEY =
  "connectai-active-meeting";

type SelectedFolder = {
  id: string;
  name: string;
};

function createDefaultMeetingTitle() {
  return `Reunião ${new Date().toLocaleString(
    "pt-BR",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }
  )}`;
}

function getParticipantName(
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

export default function MeetingControls() {
  const router =
    useRouter();

  const videoRef =
    useRef<HTMLVideoElement>(
      null
    );

  const [
    mediaStream,
    setMediaStream,
  ] =
    useState<MediaStream | null>(
      null
    );

  const [
    isMicrophoneOn,
    setIsMicrophoneOn,
  ] = useState(true);

  const [
    isCameraOn,
    setIsCameraOn,
  ] = useState(true);

  const [
    mediaError,
    setMediaError,
  ] = useState("");

  const [
    selectedFolder,
    setSelectedFolder,
  ] =
    useState<SelectedFolder | null>(
      null
    );

  const [
    folderError,
    setFolderError,
  ] = useState("");

  const [
    isLoadingFolder,
    setIsLoadingFolder,
  ] = useState(true);

  const [
    meetingTitle,
    setMeetingTitle,
  ] =
    useState(
      createDefaultMeetingTitle
    );

  const [
    creationError,
    setCreationError,
  ] = useState("");

  const [
    isCreatingMeeting,
    setIsCreatingMeeting,
  ] = useState(false);

  useEffect(() => {
    let currentStream:
      MediaStream | null = null;

    async function startMedia() {
      try {
        const stream =
          await navigator.mediaDevices.getUserMedia(
            {
              video: true,
              audio: true,
            }
          );

        currentStream =
          stream;

        setMediaStream(
          stream
        );

        if (
          videoRef.current
        ) {
          videoRef.current.srcObject =
            stream;
        }
      } catch (error) {
        console.error(
          "Erro ao acessar câmera ou microfone:",
          error
        );

        setMediaError(
          "Não foi possível acessar sua câmera ou microfone. Verifique as permissões do navegador."
        );
      }
    }

    void startMedia();

    return () => {
      currentStream
        ?.getTracks()
        .forEach(
          (track) => {
            track.stop();
          }
        );
    };
  }, []);

  useEffect(() => {
    let active =
      true;

    async function loadFolder() {
      setIsLoadingFolder(
        true
      );

      setFolderError("");

      const params =
        new URLSearchParams(
          window.location.search
        );

      const folderId =
        params.get(
          "folderId"
        );

      if (!folderId) {
        if (active) {
          setSelectedFolder(
            null
          );

          setIsLoadingFolder(
            false
          );
        }

        return;
      }

      const {
        data:
          userData,
      } =
        await supabase.auth.getUser();

      if (
        !active
      ) {
        return;
      }

      if (
        !userData.user
      ) {
        router.replace(
          "/"
        );

        return;
      }

      const {
        data:
          folder,
        error,
      } =
        await supabase
          .from(
            "folders"
          )
          .select(
            "id, name"
          )
          .eq(
            "id",
            folderId
          )
          .maybeSingle();

      if (
        !active
      ) {
        return;
      }

      if (
        error
      ) {
        console.error(
          "Erro ao carregar pasta:",
          error
        );

        setFolderError(
          "Não foi possível carregar a pasta selecionada."
        );

        setSelectedFolder(
          null
        );

        setIsLoadingFolder(
          false
        );

        return;
      }

      if (
        !folder
      ) {
        setFolderError(
          "Esta pasta não existe ou você não tem acesso a ela."
        );

        setSelectedFolder(
          null
        );

        setIsLoadingFolder(
          false
        );

        return;
      }

      setSelectedFolder({
        id:
          folder.id,
        name:
          folder.name,
      });

      setIsLoadingFolder(
        false
      );
    }

    void loadFolder();

    return () => {
      active =
        false;
    };
  }, [router]);

  function toggleMicrophone() {
    if (!mediaStream) {
      return;
    }

    const newState =
      !isMicrophoneOn;

    mediaStream
      .getAudioTracks()
      .forEach(
        (track) => {
          track.enabled =
            newState;
        }
      );

    setIsMicrophoneOn(
      newState
    );
  }

  function toggleCamera() {
    if (!mediaStream) {
      return;
    }

    const newState =
      !isCameraOn;

    mediaStream
      .getVideoTracks()
      .forEach(
        (track) => {
          track.enabled =
            newState;
        }
      );

    setIsCameraOn(
      newState
    );
  }

  async function startMeeting() {
    if (
      isCreatingMeeting
    ) {
      return;
    }

    setCreationError("");

    if (
      isLoadingFolder
    ) {
      setCreationError(
        "Aguarde enquanto a pasta é carregada."
      );

      return;
    }

    if (
      folderError
    ) {
      setCreationError(
        "Corrija o problema da pasta antes de iniciar a reunião."
      );

      return;
    }

    const normalizedTitle =
      meetingTitle.trim();

    if (
      !normalizedTitle
    ) {
      setCreationError(
        "Digite um título para a reunião."
      );

      return;
    }

    setIsCreatingMeeting(
      true
    );

    try {
      const {
        data:
          userData,
        error:
          userError,
      } =
        await supabase.auth.getUser();

      if (
        userError ||
        !userData.user ||
        userData.user.is_anonymous ===
          true
      ) {
        router.replace(
          "/"
        );

        return;
      }

      const roomId =
        crypto.randomUUID();

      const startedAt =
        new Date().toISOString();

      const hostName =
        getParticipantName(
          userData.user
        );

      const participants = [
        {
          userId:
            userData.user.id,

          name:
            hostName,

          email:
            userData.user.email ||
            "",

          role:
            "host",
        },
      ];

      const {
        data:
          meeting,
        error:
          meetingError,
      } =
        await supabase
          .from(
            "meetings"
          )
          .insert({
            host_id:
              userData.user.id,

            folder_id:
              selectedFolder?.id ||
              null,

            room_id:
              roomId,

            title:
              normalizedTitle,

            participants,

            transcript:
              [],

            report:
              null,

            started_at:
              startedAt,

            ended_at:
              null,

            duration_seconds:
              0,
          })
          .select(
            "id, room_id, folder_id, title"
          )
          .single();

      if (
        meetingError
      ) {
        console.error(
          "Erro ao criar reunião no Supabase:",
          meetingError
        );

        setCreationError(
          "Não foi possível salvar a reunião. Tente novamente."
        );

        return;
      }

      sessionStorage.setItem(
        ACTIVE_MEETING_SESSION_KEY,
        JSON.stringify({
          meetingId:
            meeting.id,

          roomId:
            meeting.room_id,

          folderId:
            meeting.folder_id,

          title:
            meeting.title,

          startedAt,
        })
      );

      router.push(
        `/reuniao/${roomId}`
      );
    } catch (error) {
      console.error(
        "Erro ao iniciar reunião:",
        error
      );

      setCreationError(
        "Não foi possível iniciar a reunião agora."
      );
    } finally {
      setIsCreatingMeeting(
        false
      );
    }
  }

  return (
    <section className="mt-10 grid gap-6 lg:grid-cols-[2fr_1fr]">
      <div className="relative flex min-h-[420px] items-center justify-center overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
        {mediaError ? (
          <div className="max-w-md p-6 text-center">
            <p className="font-semibold text-red-400">
              Não foi possível iniciar os dispositivos
            </p>

            <p className="mt-2 text-sm text-zinc-400">
              {mediaError}
            </p>
          </div>
        ) : (
          <>
            <video
              ref={
                videoRef
              }
              autoPlay
              muted
              playsInline
              className={`h-full min-h-[420px] w-full object-cover ${
                isCameraOn
                  ? "block"
                  : "hidden"
              }`}
            />

            {!isCameraOn && (
              <div className="text-center">
                <p className="text-lg font-semibold">
                  Câmera desligada
                </p>

                <p className="mt-2 text-sm text-zinc-500">
                  Ative a câmera para visualizar sua imagem.
                </p>
              </div>
            )}
          </>
        )}
      </div>

      <aside className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <h2 className="text-lg font-semibold">
          Configurações da reunião
        </h2>

        <div className="mt-5 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Salvar em
          </p>

          {isLoadingFolder ? (
            <p className="mt-2 text-sm text-zinc-400">
              Carregando pasta...
            </p>
          ) : folderError ? (
            <p className="mt-2 text-sm leading-5 text-red-300">
              {folderError}
            </p>
          ) : selectedFolder ? (
            <div className="mt-2 flex items-center gap-2">
              <span>
                📁
              </span>

              <span className="truncate text-sm font-medium text-blue-300">
                {
                  selectedFolder.name
                }
              </span>
            </div>
          ) : (
            <div className="mt-2 flex items-center gap-2">
              <span>
                📂
              </span>

              <span className="text-sm text-zinc-300">
                Sem pasta
              </span>
            </div>
          )}
        </div>

        <div className="mt-5">
          <label
            htmlFor="meeting-title"
            className="mb-2 block text-sm font-medium text-zinc-300"
          >
            Título da reunião
          </label>

          <input
            id="meeting-title"
            type="text"
            value={
              meetingTitle
            }
            onChange={(
              event
            ) =>
              setMeetingTitle(
                event.target.value
              )
            }
            maxLength={
              180
            }
            placeholder="Ex.: Reunião de planejamento"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-blue-500"
          />
        </div>

        <div className="mt-6 space-y-4">
          <button
            type="button"
            onClick={
              toggleMicrophone
            }
            className={`w-full cursor-pointer rounded-lg border px-4 py-3 text-sm font-medium transition ${
              isMicrophoneOn
                ? "border-emerald-700 bg-emerald-950/40 text-emerald-300"
                : "border-red-800 bg-red-950/40 text-red-300"
            }`}
          >
            {isMicrophoneOn
              ? "🎤 Microfone ligado"
              : "🔇 Microfone desligado"}
          </button>

          <button
            type="button"
            onClick={
              toggleCamera
            }
            className={`w-full cursor-pointer rounded-lg border px-4 py-3 text-sm font-medium transition ${
              isCameraOn
                ? "border-emerald-700 bg-emerald-950/40 text-emerald-300"
                : "border-red-800 bg-red-950/40 text-red-300"
            }`}
          >
            {isCameraOn
              ? "📹 Câmera ligada"
              : "🚫 Câmera desligada"}
          </button>

          {creationError && (
            <div className="rounded-lg border border-red-800/70 bg-red-950/30 px-4 py-3 text-sm leading-5 text-red-300">
              {
                creationError
              }
            </div>
          )}

          <button
            type="button"
            onClick={
              startMeeting
            }
            disabled={
              isCreatingMeeting ||
              isLoadingFolder ||
              Boolean(
                folderError
              )
            }
            className="w-full cursor-pointer rounded-lg bg-blue-600 px-4 py-3 font-semibold transition hover:bg-blue-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isCreatingMeeting
              ? "Salvando reunião..."
              : "Iniciar reunião"}
          </button>
        </div>
      </aside>
    </section>
  );
}