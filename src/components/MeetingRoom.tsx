"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type MeetingRoomProps = {
  roomId: string;
};

export default function MeetingRoom({
  roomId,
}: MeetingRoomProps) {
  const router = useRouter();

  // Referência permanente ao vídeo exibido na sala.
  const localVideoRef = useRef<HTMLVideoElement>(null);

  // Fluxo real da câmera e do microfone.
  const [mediaStream, setMediaStream] =
    useState<MediaStream | null>(null);

  // Estados dos dispositivos.
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isMicrophoneOn, setIsMicrophoneOn] = useState(true);

  // Mensagens da interface.
  const [mediaError, setMediaError] = useState("");
  const [isLinkCopied, setIsLinkCopied] = useState(false);

  useEffect(() => {
    let currentStream: MediaStream | null = null;

    async function startLocalMedia() {
      try {
        // Solicita acesso aos dispositivos do usuário.
        const stream =
          await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true,
          });

        currentStream = stream;
        setMediaStream(stream);

        // Conecta o fluxo da câmera ao elemento de vídeo.
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } catch (error) {
        console.error(
          "Erro ao iniciar câmera e microfone:",
          error,
        );

        setMediaError(
          "Não foi possível acessar sua câmera ou microfone.",
        );
      }
    }

    startLocalMedia();

    // Libera câmera e microfone ao sair da sala.
    return () => {
      currentStream?.getTracks().forEach((track) => {
        track.stop();
      });
    };
  }, []);

  function toggleCamera() {
    if (!mediaStream) {
      return;
    }

    const newState = !isCameraOn;

    mediaStream.getVideoTracks().forEach((track) => {
      track.enabled = newState;
    });

    setIsCameraOn(newState);
  }

  function toggleMicrophone() {
    if (!mediaStream) {
      return;
    }

    const newState = !isMicrophoneOn;

    mediaStream.getAudioTracks().forEach((track) => {
      track.enabled = newState;
    });

    setIsMicrophoneOn(newState);
  }

  async function copyMeetingLink() {
    // window.location.href contém o endereço completo da sala atual.
    const meetingLink = window.location.href;

    try {
      await navigator.clipboard.writeText(meetingLink);

      setIsLinkCopied(true);

      // Depois de alguns segundos, o botão volta ao texto original.
      setTimeout(() => {
        setIsLinkCopied(false);
      }, 2000);
    } catch (error) {
      console.error("Erro ao copiar o link:", error);
    }
  }

  function leaveMeeting() {
    // Encerra os dispositivos antes de sair.
    mediaStream?.getTracks().forEach((track) => {
      track.stop();
    });

    router.push("/dashboard");
  }

  return (
    <section>
      <header className="flex flex-col gap-4 border-b border-zinc-800 pb-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-medium text-blue-400">
            ConnectAI
          </p>

          <h1 className="mt-2 text-3xl font-bold">
            Sala de reunião
          </h1>

          <p className="mt-2 text-sm text-zinc-400">
            Código da sala:{" "}
            <span className="font-mono text-zinc-300">
              {roomId}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={copyMeetingLink}
            className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
          >
            {isLinkCopied
              ? "✓ Link copiado"
              : "🔗 Copiar convite"}
          </button>

          <button
            type="button"
            onClick={leaveMeeting}
            className="cursor-pointer rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-900 hover:text-white"
          >
            Sair da reunião
          </button>
        </div>
      </header>

      <section className="mt-10 grid gap-6 lg:grid-cols-2">
        {/* Participante local */}
        <div className="relative flex min-h-[400px] items-center justify-center overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
          {mediaError ? (
            <p className="p-6 text-center text-red-400">
              {mediaError}
            </p>
          ) : (
            <>
              {/*
                O vídeo permanece montado mesmo quando está escondido.
                Assim o MediaStream continua conectado corretamente.
              */}
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className={`h-full min-h-[400px] w-full object-cover ${
                  isCameraOn ? "block" : "hidden"
                }`}
              />

              {!isCameraOn && (
                <div className="text-center">
                  <p className="text-lg font-semibold">
                    Câmera desligada
                  </p>

                  <p className="mt-2 text-sm text-zinc-500">
                    Você continua conectado à reunião.
                  </p>
                </div>
              )}
            </>
          )}

          <div className="absolute bottom-4 left-4 rounded-lg bg-black/60 px-3 py-2 text-sm">
            Você
          </div>
        </div>

        {/* Espaço reservado para o futuro participante remoto */}
        <div className="flex min-h-[400px] items-center justify-center rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/50">
          <div className="text-center">
            <p className="text-lg font-semibold text-zinc-300">
              Aguardando participante
            </p>

            <p className="mt-2 text-sm text-zinc-500">
              Compartilhe o convite para outra pessoa entrar na sala.
            </p>
          </div>
        </div>
      </section>

      {/* Controles utilizados durante a reunião */}
      <section className="mt-6 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={toggleMicrophone}
          className={`cursor-pointer rounded-lg border px-5 py-3 text-sm font-medium transition ${
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
          onClick={toggleCamera}
          className={`cursor-pointer rounded-lg border px-5 py-3 text-sm font-medium transition ${
            isCameraOn
              ? "border-emerald-700 bg-emerald-950/40 text-emerald-300"
              : "border-red-800 bg-red-950/40 text-red-300"
          }`}
        >
          {isCameraOn
            ? "📹 Câmera ligada"
            : "🚫 Câmera desligada"}
        </button>

        <button
          type="button"
          onClick={leaveMeeting}
          className="cursor-pointer rounded-lg bg-red-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-500"
        >
          📞 Encerrar
        </button>
      </section>
    </section>
  );
}