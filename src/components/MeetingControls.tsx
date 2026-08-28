"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function MeetingControls() {
  // Permite navegar para a sala criada.
  const router = useRouter();

  // Referência direta ao elemento de vídeo da página.
  const videoRef = useRef<HTMLVideoElement>(null);

  // Guarda o fluxo real da câmera e do microfone.
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);

  // Estados dos dispositivos.
  const [isMicrophoneOn, setIsMicrophoneOn] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(true);

  // Mensagem para possíveis erros de permissão ou hardware.
  const [mediaError, setMediaError] = useState("");

  useEffect(() => {
    let currentStream: MediaStream | null = null;

    async function startMedia() {
      try {
        // Solicita acesso à câmera e ao microfone.
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });

        currentStream = stream;
        setMediaStream(stream);

        // Exibe a câmera no elemento <video>.
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (error) {
        console.error("Erro ao acessar câmera ou microfone:", error);

        setMediaError(
          "Não foi possível acessar sua câmera ou microfone. Verifique as permissões do navegador.",
        );
      }
    }

    startMedia();

    // Libera os dispositivos quando saímos desta página.
    return () => {
      currentStream?.getTracks().forEach((track) => {
        track.stop();
      });
    };
  }, []);

  function toggleMicrophone() {
    if (!mediaStream) {
      return;
    }

    const newState = !isMicrophoneOn;

    // Liga ou desliga a trilha real de áudio.
    mediaStream.getAudioTracks().forEach((track) => {
      track.enabled = newState;
    });

    setIsMicrophoneOn(newState);
  }

  function toggleCamera() {
    if (!mediaStream) {
      return;
    }

    const newState = !isCameraOn;

    // Liga ou desliga a trilha real de vídeo.
    mediaStream.getVideoTracks().forEach((track) => {
      track.enabled = newState;
    });

    setIsCameraOn(newState);
  }

  function startMeeting() {
    // Gera um identificador único para a nova sala.
    const roomId = crypto.randomUUID();

    // Navega para a rota dinâmica da reunião.
    router.push(`/reuniao/${roomId}`);
  }

  return (
    <section className="mt-10 grid gap-6 lg:grid-cols-[2fr_1fr]">
      {/* Prévia real da câmera */}
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
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className={`h-full min-h-[420px] w-full object-cover ${
                isCameraOn ? "block" : "hidden"
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

      {/* Controles dos dispositivos */}
      <aside className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <h2 className="text-lg font-semibold">
          Configurações da reunião
        </h2>

        <div className="mt-6 space-y-4">
          <button
            type="button"
            onClick={toggleMicrophone}
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
            onClick={toggleCamera}
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

          <button
            type="button"
            onClick={startMeeting}
            className="w-full cursor-pointer rounded-lg bg-blue-600 px-4 py-3 font-semibold transition hover:bg-blue-500 active:scale-[0.98]"
          >
            Iniciar reunião
          </button>
        </div>
      </aside>
    </section>
  );
}