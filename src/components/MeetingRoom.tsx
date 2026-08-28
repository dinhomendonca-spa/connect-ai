"use client";

import {
  FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

type MeetingRoomProps = {
  roomId: string;
};

type ChatMessage = {
  id: number;
  text: string;
  time: string;
};

export default function MeetingRoom({
  roomId,
}: MeetingRoomProps) {
  const router = useRouter();

  // Referência do vídeo local.
  const localVideoRef = useRef<HTMLVideoElement>(null);

  // Guarda câmera e microfone.
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Referência usada para rolar automaticamente
  // para a mensagem mais recente.
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Estados dos controles da reunião.
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(true);

  // Mensagens de erro de mídia.
  const [mediaError, setMediaError] = useState("");

  // Estados do chat.
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // Inicia câmera e microfone.
  useEffect(() => {
    async function startMedia() {
      try {
        setMediaError("");

        const stream =
          await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true,
          });

        mediaStreamRef.current = stream;

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        const audioTrack = stream.getAudioTracks()[0];
        const videoTrack = stream.getVideoTracks()[0];

        if (audioTrack) {
          setIsMicOn(audioTrack.enabled);
        }

        if (videoTrack) {
          setIsCameraOn(videoTrack.enabled);
        }
      } catch (error) {
        console.error(
          "Erro ao acessar câmera ou microfone:",
          error
        );

        setMediaError(
          "Não foi possível acessar a câmera ou o microfone. Verifique as permissões do navegador."
        );

        setIsMicOn(false);
        setIsCameraOn(false);
      }
    }

    startMedia();

    return () => {
      mediaStreamRef.current
        ?.getTracks()
        .forEach((track) => track.stop());

      mediaStreamRef.current = null;
    };
  }, []);

  // Sempre que uma mensagem nova entrar,
  // rola o chat para o final.
  useEffect(() => {
    if (!isChatOpen) {
      return;
    }

    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages, isChatOpen]);

  function toggleMicrophone() {
    const stream = mediaStreamRef.current;

    if (!stream) {
      return;
    }

    const audioTracks = stream.getAudioTracks();

    if (audioTracks.length === 0) {
      return;
    }

    const nextState = !isMicOn;

    audioTracks.forEach((track) => {
      track.enabled = nextState;
    });

    setIsMicOn(nextState);
  }

  function toggleCamera() {
    const stream = mediaStreamRef.current;

    if (!stream) {
      return;
    }

    const videoTracks = stream.getVideoTracks();

    if (videoTracks.length === 0) {
      return;
    }

    const nextState = !isCameraOn;

    videoTracks.forEach((track) => {
      track.enabled = nextState;
    });

    setIsCameraOn(nextState);
  }

  function sendMessage(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const text = newMessage.trim();

    if (!text) {
      return;
    }

    const currentTime = new Date().toLocaleTimeString(
      "pt-BR",
      {
        hour: "2-digit",
        minute: "2-digit",
      }
    );

    const message: ChatMessage = {
      id: Date.now(),
      text,
      time: currentTime,
    };

    setMessages((currentMessages) => [
      ...currentMessages,
      message,
    ]);

    setNewMessage("");
  }

  async function copyRoomCode() {
    try {
      await navigator.clipboard.writeText(roomId);

      alert("Código da sala copiado!");
    } catch (error) {
      console.error(
        "Erro ao copiar código da sala:",
        error
      );
    }
  }

  async function copyInviteLink() {
    try {
      await navigator.clipboard.writeText(
        window.location.href
      );

      alert("Link da reunião copiado!");
    } catch (error) {
      console.error(
        "Erro ao copiar link da reunião:",
        error
      );
    }
  }

  function leaveMeeting() {
    mediaStreamRef.current
      ?.getTracks()
      .forEach((track) => track.stop());

    mediaStreamRef.current = null;

    router.push("/dashboard");
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <header className="mb-6 border-b border-zinc-800 pb-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold">
                ConnectAI
              </h1>

              <p className="mt-1 text-sm text-zinc-400">
                Reunião em andamento
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={copyRoomCode}
                className="cursor-pointer rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold transition hover:bg-zinc-800"
              >
                📋 Copiar código
              </button>

              <button
                type="button"
                onClick={copyInviteLink}
                className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold transition hover:bg-blue-500"
              >
                🔗 Copiar convite
              </button>
            </div>
          </div>

          <p className="mt-4 text-sm text-zinc-300">
            Código da sala:{" "}
            <span className="font-semibold text-white">
              {roomId}
            </span>
          </p>
        </header>

        <div
          className={`grid gap-5 ${
            isChatOpen
              ? "xl:grid-cols-[1fr_350px]"
              : "grid-cols-1"
          }`}
        >
          <div>
            <section className="grid gap-6 md:grid-cols-2">
              <div className="relative aspect-video overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`h-full w-full object-cover ${
                    isCameraOn ? "block" : "hidden"
                  }`}
                />

                {!isCameraOn && (
                  <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-zinc-800 text-4xl">
                      👤
                    </div>

                    <p className="font-semibold">
                      Câmera desligada
                    </p>
                  </div>
                )}

                <div className="absolute bottom-4 left-4 rounded-lg bg-black/70 px-3 py-2 text-sm">
                  Você
                </div>
              </div>

              <div className="flex aspect-video flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-700 bg-zinc-950 p-6 text-center">
                <div className="mb-3 text-4xl">
                  👤
                </div>

                <h2 className="text-lg font-bold">
                  Aguardando participante
                </h2>

                <p className="mt-3 text-sm text-zinc-400">
                  Compartilhe o convite para outra pessoa
                  entrar na sala.
                </p>

                <button
                  type="button"
                  onClick={copyInviteLink}
                  className="mt-5 cursor-pointer rounded-lg border border-blue-600 px-4 py-2 text-sm font-semibold text-blue-400 transition hover:bg-blue-950"
                >
                  🔗 Copiar link da reunião
                </button>
              </div>
            </section>

            {mediaError && (
              <div className="mt-4 rounded-xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-300">
                {mediaError}
              </div>
            )}

            <section className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={toggleMicrophone}
                className={`cursor-pointer rounded-lg border px-5 py-3 text-sm font-semibold transition ${
                  isMicOn
                    ? "border-emerald-600 text-emerald-400 hover:bg-emerald-950"
                    : "border-yellow-600 text-yellow-400 hover:bg-yellow-950"
                }`}
              >
                {isMicOn
                  ? "🎤 Microfone ligado"
                  : "🔇 Microfone desligado"}
              </button>

              <button
                type="button"
                onClick={toggleCamera}
                className={`cursor-pointer rounded-lg border px-5 py-3 text-sm font-semibold transition ${
                  isCameraOn
                    ? "border-emerald-600 text-emerald-400 hover:bg-emerald-950"
                    : "border-yellow-600 text-yellow-400 hover:bg-yellow-950"
                }`}
              >
                {isCameraOn
                  ? "📹 Câmera ligada"
                  : "🚫 Câmera desligada"}
              </button>

              <button
                type="button"
                onClick={() =>
                  setIsChatOpen(
                    (currentState) => !currentState
                  )
                }
                className={`cursor-pointer rounded-lg border px-5 py-3 text-sm font-semibold transition ${
                  isChatOpen
                    ? "border-blue-500 bg-blue-600 text-white"
                    : "border-blue-600 text-blue-400 hover:bg-blue-950"
                }`}
              >
                💬{" "}
                {isChatOpen
                  ? "Fechar chat"
                  : `Abrir chat${
                      messages.length > 0
                        ? ` (${messages.length})`
                        : ""
                    }`}
              </button>

              <button
                type="button"
                onClick={leaveMeeting}
                className="cursor-pointer rounded-lg bg-red-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-500"
              >
                📞 Encerrar
              </button>
            </section>
          </div>

          {isChatOpen && (
            <aside className="flex min-h-[550px] flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
              <div className="flex items-center justify-between border-b border-zinc-800 p-4">
                <div>
                  <h2 className="font-bold">
                    💬 Chat da reunião
                  </h2>

                  <p className="mt-1 text-xs text-zinc-400">
                    {messages.length}{" "}
                    {messages.length === 1
                      ? "mensagem"
                      : "mensagens"}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setIsChatOpen(false)}
                  className="cursor-pointer rounded-lg px-3 py-2 text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
                  aria-label="Fechar chat"
                >
                  ✕
                </button>
              </div>

              <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
                {messages.length === 0 ? (
                  <div className="flex flex-1 flex-col items-center justify-center text-center">
                    <div className="mb-3 text-5xl">
                      💬
                    </div>

                    <p className="font-medium text-zinc-300">
                      Nenhuma mensagem ainda
                    </p>

                    <p className="mt-2 text-sm text-zinc-500">
                      Envie a primeira mensagem da
                      reunião.
                    </p>
                  </div>
                ) : (
                  messages.map((message) => (
                    <div
                      key={message.id}
                      className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-blue-600 px-4 py-3"
                    >
                      <div className="mb-1 flex items-center justify-between gap-4">
                        <p className="text-xs font-semibold text-blue-100">
                          Você
                        </p>

                        <span className="text-[10px] text-blue-200">
                          {message.time}
                        </span>
                      </div>

                      <p className="break-words text-sm">
                        {message.text}
                      </p>
                    </div>
                  ))
                )}

                <div ref={messagesEndRef} />
              </div>

              <form
                onSubmit={sendMessage}
                className="border-t border-zinc-800 p-4"
              >
                <label
                  htmlFor="chat-message"
                  className="mb-2 block text-sm font-medium text-zinc-300"
                >
                  Enviar uma mensagem
                </label>

                <div className="flex gap-2">
                  <input
                    id="chat-message"
                    type="text"
                    value={newMessage}
                    onChange={(event) =>
                      setNewMessage(event.target.value)
                    }
                    placeholder="Digite uma mensagem..."
                    autoComplete="off"
                    className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-blue-500"
                  />

                  <button
                    type="submit"
                    disabled={!newMessage.trim()}
                    className="cursor-pointer rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Enviar
                  </button>
                </div>

                <p className="mt-2 text-xs text-zinc-500">
                  Pressione Enter para enviar.
                </p>
              </form>
            </aside>
          )}
        </div>
      </div>
    </main>
  );
}