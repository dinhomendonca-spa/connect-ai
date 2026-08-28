"use client";

import {
  FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import { useRouter } from "next/navigation";

import {
  io,
  type Socket,
} from "socket.io-client";

type MeetingRoomProps = {
  roomId: string;
};

type ChatMessage = {
  id: string;
  text: string;
  time: string;
  senderName: string;
  isOwn: boolean;
};

type CurrentUser = {
  name: string;
  email: string;
};

const CURRENT_USER_SESSION_KEY =
  "connectai-current-user";

const FALLBACK_PARTICIPANT_KEY =
  "connectai-participant-name";

export default function MeetingRoom({
  roomId,
}: MeetingRoomProps) {
  const router = useRouter();

  // Vídeos exibidos na interface.
  const localVideoRef =
    useRef<HTMLVideoElement>(null);

  const remoteVideoRef =
    useRef<HTMLVideoElement>(null);

  // Stream original da câmera e microfone.
  const mediaStreamRef =
    useRef<MediaStream | null>(null);

  // Stream usado durante compartilhamento de tela.
  const screenStreamRef =
    useRef<MediaStream | null>(null);

  // Comunicação Socket.IO.
  const socketRef =
    useRef<Socket | null>(null);

  // Conexão direta WebRTC.
  const peerConnectionRef =
    useRef<RTCPeerConnection | null>(null);

  // ICE candidates que chegam antes da conexão estar pronta.
  const pendingIceCandidatesRef =
    useRef<RTCIceCandidateInit[]>([]);

  // Usado para rolar o chat para a mensagem mais recente.
  const messagesEndRef =
    useRef<HTMLDivElement>(null);

  // Identidade.
  const [
    participantName,
    setParticipantName,
  ] = useState("");

  const [
    remoteParticipantName,
    setRemoteParticipantName,
  ] = useState("Participante");

  // Controles de mídia.
  const [isMicOn, setIsMicOn] =
    useState(true);

  const [isCameraOn, setIsCameraOn] =
    useState(true);

  const [
    isScreenSharing,
    setIsScreenSharing,
  ] = useState(false);

  const [mediaError, setMediaError] =
    useState("");

  // Participantes.
  const [
    participantCount,
    setParticipantCount,
  ] = useState(1);

  const [
    remoteParticipantId,
    setRemoteParticipantId,
  ] = useState<string | null>(null);

  const [
    isRemoteConnected,
    setIsRemoteConnected,
  ] = useState(false);

  const [roomFull, setRoomFull] =
    useState(false);

  // Chat.
  const [isChatOpen, setIsChatOpen] =
    useState(false);

  const [newMessage, setNewMessage] =
    useState("");

  const [messages, setMessages] =
    useState<ChatMessage[]>([]);

  // --------------------------------------------------
  // IDENTIDADE
  // --------------------------------------------------

  function getParticipantName() {
    try {
      const storedCurrentUser =
        sessionStorage.getItem(
          CURRENT_USER_SESSION_KEY
        );

      if (storedCurrentUser) {
        const currentUser: CurrentUser =
          JSON.parse(storedCurrentUser);

        if (
          currentUser.name &&
          currentUser.name.trim()
        ) {
          return currentUser.name.trim();
        }
      }
    } catch (error) {
      console.error(
        "Erro ao recuperar usuário da sessão:",
        error
      );
    }

    // Plano B:
    // participante que entrou sem passar pelo login.
    const fallbackName =
      sessionStorage.getItem(
        FALLBACK_PARTICIPANT_KEY
      );

    if (fallbackName) {
      return fallbackName;
    }

    const randomNumber = Math.floor(
      1000 + Math.random() * 9000
    );

    const generatedName =
      `Participante-${randomNumber}`;

    sessionStorage.setItem(
      FALLBACK_PARTICIPANT_KEY,
      generatedName
    );

    return generatedName;
  }

  // --------------------------------------------------
  // WEBRTC
  // --------------------------------------------------

  function clearRemoteParticipant() {
    peerConnectionRef.current?.close();

    peerConnectionRef.current = null;

    pendingIceCandidatesRef.current = [];

    setRemoteParticipantId(null);

    setRemoteParticipantName(
      "Participante"
    );

    setIsRemoteConnected(false);

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  }

  function createPeerConnection(
    targetId: string
  ) {
    peerConnectionRef.current?.close();

    const peerConnection =
      new RTCPeerConnection({
        iceServers: [
          {
            urls:
              "stun:stun.l.google.com:19302",
          },
        ],
      });

    peerConnectionRef.current =
      peerConnection;

    const cameraStream =
      mediaStreamRef.current;

    const screenStream =
      screenStreamRef.current;

    // Áudio continua vindo sempre
    // do microfone original.
    const audioTrack =
      cameraStream?.getAudioTracks()[0];

    if (audioTrack && cameraStream) {
      peerConnection.addTrack(
        audioTrack,
        cameraStream
      );
    }

    // Se já estivermos compartilhando tela,
    // envia a tela para o novo participante.
    // Caso contrário, envia a câmera.
    const activeVideoTrack =
      screenStream?.getVideoTracks()[0] ??
      cameraStream?.getVideoTracks()[0];

    const activeVideoStream =
      screenStream ?? cameraStream;

    if (
      activeVideoTrack &&
      activeVideoStream
    ) {
      peerConnection.addTrack(
        activeVideoTrack,
        activeVideoStream
      );
    }

    // Recebe vídeo/áudio remoto.
    peerConnection.ontrack = (event) => {
      const remoteStream =
        event.streams[0];

      if (
        remoteVideoRef.current &&
        remoteStream
      ) {
        remoteVideoRef.current.srcObject =
          remoteStream;
      }

      setIsRemoteConnected(true);
    };

    // Envia ICE candidates.
    peerConnection.onicecandidate = (
      event
    ) => {
      if (
        !event.candidate ||
        !socketRef.current
      ) {
        return;
      }

      socketRef.current.emit(
        "webrtc-ice-candidate",
        {
          targetId,
          candidate:
            event.candidate.toJSON(),
        }
      );
    };

    peerConnection.onconnectionstatechange =
      () => {
        const state =
          peerConnection.connectionState;

        console.log(
          "Estado WebRTC:",
          state
        );

        if (state === "connected") {
          setIsRemoteConnected(true);
        }

        if (
          state === "failed" ||
          state === "closed" ||
          state === "disconnected"
        ) {
          setIsRemoteConnected(false);
        }
      };

    return peerConnection;
  }

  async function flushPendingIceCandidates(
    peerConnection: RTCPeerConnection
  ) {
    for (
      const candidate
      of pendingIceCandidatesRef.current
    ) {
      try {
        await peerConnection.addIceCandidate(
          candidate
        );
      } catch (error) {
        console.error(
          "Erro ao adicionar ICE candidate:",
          error
        );
      }
    }

    pendingIceCandidatesRef.current = [];
  }

  // Troca somente o vídeo enviado pelo WebRTC.
  async function replaceOutgoingVideoTrack(
    newTrack: MediaStreamTrack
  ) {
    const peerConnection =
      peerConnectionRef.current;

    if (!peerConnection) {
      return;
    }

    const videoSender =
      peerConnection
        .getSenders()
        .find(
          (sender) =>
            sender.track?.kind === "video"
        );

    if (!videoSender) {
      return;
    }

    try {
      await videoSender.replaceTrack(
        newTrack
      );
    } catch (error) {
      console.error(
        "Erro ao trocar faixa de vídeo:",
        error
      );
    }
  }

  // --------------------------------------------------
  // COMPARTILHAMENTO DE TELA
  // --------------------------------------------------

  async function startScreenSharing() {
    try {
      if (
        !navigator.mediaDevices
          .getDisplayMedia
      ) {
        setMediaError(
          "Seu navegador não oferece suporte ao compartilhamento de tela."
        );

        return;
      }

      const screenStream =
        await navigator.mediaDevices
          .getDisplayMedia({
            video: true,
            audio: false,
          });

      const screenTrack =
        screenStream.getVideoTracks()[0];

      if (!screenTrack) {
        return;
      }

      screenStreamRef.current =
        screenStream;

      // Troca a câmera pela tela enviada
      // para o outro participante.
      await replaceOutgoingVideoTrack(
        screenTrack
      );

      // Mostra nossa própria tela
      // na prévia local.
      if (localVideoRef.current) {
        localVideoRef.current.srcObject =
          screenStream;
      }

      setIsScreenSharing(true);

      // Se o usuário clicar em
      // "Parar compartilhamento"
      // pelo próprio Chrome.
      screenTrack.onended = () => {
        void stopScreenSharing();
      };
    } catch (error) {
      // O navegador também lança erro
      // quando o usuário simplesmente cancela
      // a janela de seleção de tela.
      console.log(
        "Compartilhamento de tela cancelado ou indisponível:",
        error
      );
    }
  }

  async function stopScreenSharing() {
    const cameraStream =
      mediaStreamRef.current;

    const cameraTrack =
      cameraStream?.getVideoTracks()[0];

    // Volta a enviar a câmera.
    if (cameraTrack) {
      await replaceOutgoingVideoTrack(
        cameraTrack
      );
    }

    // Encerra o stream de tela.
    screenStreamRef.current
      ?.getTracks()
      .forEach((track) => {
        track.onended = null;
        track.stop();
      });

    screenStreamRef.current = null;

    // Volta a mostrar a câmera local.
    if (localVideoRef.current) {
      localVideoRef.current.srcObject =
        cameraStream ?? null;
    }

    setIsScreenSharing(false);
  }

  async function toggleScreenSharing() {
    if (isScreenSharing) {
      await stopScreenSharing();
      return;
    }

    await startScreenSharing();
  }

  // --------------------------------------------------
  // INICIALIZAÇÃO DA REUNIÃO
  // --------------------------------------------------

  useEffect(() => {
    let componentActive = true;

    const myParticipantName =
      getParticipantName();

    setParticipantName(
      myParticipantName
    );

    async function startMeeting() {
      // ---------------------------
      // Câmera e microfone
      // ---------------------------

      try {
        setMediaError("");

        const stream =
          await navigator.mediaDevices
            .getUserMedia({
              video: true,
              audio: true,
            });

        if (!componentActive) {
          stream
            .getTracks()
            .forEach((track) => {
              track.stop();
            });

          return;
        }

        mediaStreamRef.current =
          stream;

        if (localVideoRef.current) {
          localVideoRef.current.srcObject =
            stream;
        }

        const audioTrack =
          stream.getAudioTracks()[0];

        const videoTrack =
          stream.getVideoTracks()[0];

        if (audioTrack) {
          setIsMicOn(
            audioTrack.enabled
          );
        }

        if (videoTrack) {
          setIsCameraOn(
            videoTrack.enabled
          );
        }
      } catch (error) {
        console.error(
          "Erro ao acessar mídia:",
          error
        );

        setMediaError(
          "Não foi possível acessar a câmera ou o microfone. Verifique as permissões do navegador."
        );

        setIsMicOn(false);
        setIsCameraOn(false);
      }

      if (!componentActive) {
        return;
      }

      // ---------------------------
      // Socket.IO
      // ---------------------------

      const socket = io();

      socketRef.current = socket;

      socket.on("connect", () => {
        console.log(
          "Socket conectado:",
          socket.id
        );

        socket.emit("join-room", {
          roomId,
          participantName:
            myParticipantName,
        });
      });

      // Quem já estava na sala.
      socket.on(
        "existing-participants",
        async ({
          participantIds,
        }: {
          participantIds: string[];
        }) => {
          if (
            participantIds.length === 0
          ) {
            return;
          }

          const targetId =
            participantIds[0];

          setRemoteParticipantId(
            targetId
          );

          const peerConnection =
            createPeerConnection(
              targetId
            );

          try {
            const offer =
              await peerConnection
                .createOffer();

            await peerConnection
              .setLocalDescription(
                offer
              );

            socket.emit(
              "webrtc-offer",
              {
                targetId,
                offer,
              }
            );
          } catch (error) {
            console.error(
              "Erro ao criar oferta WebRTC:",
              error
            );
          }
        }
      );

      // Novo participante entrou.
      socket.on(
        "participant-joined",
        ({
          participantId,
          participantName:
            joinedParticipantName,
        }: {
          participantId: string;
          participantName: string;
        }) => {
          setRemoteParticipantId(
            participantId
          );

          if (
            joinedParticipantName
          ) {
            setRemoteParticipantName(
              joinedParticipantName
            );
          }
        }
      );

      // Recebe oferta WebRTC.
      socket.on(
        "webrtc-offer",
        async ({
          senderId,
          senderName,
          offer,
        }: {
          senderId: string;
          senderName: string;
          offer:
            RTCSessionDescriptionInit;
        }) => {
          setRemoteParticipantId(
            senderId
          );

          if (senderName) {
            setRemoteParticipantName(
              senderName
            );
          }

          const peerConnection =
            createPeerConnection(
              senderId
            );

          try {
            await peerConnection
              .setRemoteDescription(
                offer
              );

            await flushPendingIceCandidates(
              peerConnection
            );

            const answer =
              await peerConnection
                .createAnswer();

            await peerConnection
              .setLocalDescription(
                answer
              );

            socket.emit(
              "webrtc-answer",
              {
                targetId:
                  senderId,
                answer,
              }
            );
          } catch (error) {
            console.error(
              "Erro ao responder oferta WebRTC:",
              error
            );
          }
        }
      );

      // Recebe resposta WebRTC.
      socket.on(
        "webrtc-answer",
        async ({
          senderName,
          answer,
        }: {
          senderId: string;
          senderName: string;
          answer:
            RTCSessionDescriptionInit;
        }) => {
          if (senderName) {
            setRemoteParticipantName(
              senderName
            );
          }

          const peerConnection =
            peerConnectionRef.current;

          if (!peerConnection) {
            return;
          }

          try {
            await peerConnection
              .setRemoteDescription(
                answer
              );

            await flushPendingIceCandidates(
              peerConnection
            );
          } catch (error) {
            console.error(
              "Erro ao aplicar resposta WebRTC:",
              error
            );
          }
        }
      );

      // ICE candidate recebido.
      socket.on(
        "webrtc-ice-candidate",
        async ({
          candidate,
        }: {
          senderId: string;
          candidate:
            RTCIceCandidateInit;
        }) => {
          const peerConnection =
            peerConnectionRef.current;

          if (
            !peerConnection ||
            !peerConnection
              .remoteDescription
          ) {
            pendingIceCandidatesRef
              .current
              .push(candidate);

            return;
          }

          try {
            await peerConnection
              .addIceCandidate(
                candidate
              );
          } catch (error) {
            console.error(
              "Erro no ICE candidate:",
              error
            );
          }
        }
      );

      // Quantidade de participantes.
      socket.on(
        "room-participants",
        ({
          count,
        }: {
          count: number;
        }) => {
          setParticipantCount(
            count
          );
        }
      );

      // Participante saiu.
      socket.on(
        "participant-left",
        () => {
          clearRemoteParticipant();
        }
      );

      // Sala cheia.
      socket.on(
        "room-full",
        () => {
          setRoomFull(true);
        }
      );

      // Mensagem recebida.
      socket.on(
        "chat-message",
        ({
          id,
          text,
          time,
          senderName,
        }: {
          id: string;
          senderId: string;
          text: string;
          time: string;
          senderName: string;
        }) => {
          setMessages(
            (currentMessages) => [
              ...currentMessages,
              {
                id,
                text,
                time,
                senderName:
                  senderName ||
                  "Participante",
                isOwn: false,
              },
            ]
          );
        }
      );
    }

    startMeeting();

    // Limpeza ao sair da página.
    return () => {
      componentActive = false;

      mediaStreamRef.current
        ?.getTracks()
        .forEach((track) => {
          track.stop();
        });

      screenStreamRef.current
        ?.getTracks()
        .forEach((track) => {
          track.onended = null;
          track.stop();
        });

      peerConnectionRef.current
        ?.close();

      socketRef.current
        ?.disconnect();

      mediaStreamRef.current = null;
      screenStreamRef.current = null;
      peerConnectionRef.current = null;
      socketRef.current = null;
    };
  }, [roomId]);

  // --------------------------------------------------
  // CHAT
  // --------------------------------------------------

  useEffect(() => {
    if (!isChatOpen) {
      return;
    }

    messagesEndRef.current
      ?.scrollIntoView({
        behavior: "smooth",
      });
  }, [messages, isChatOpen]);

  function sendMessage(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const text =
      newMessage.trim();

    const socket =
      socketRef.current;

    if (!text || !socket) {
      return;
    }

    const time =
      new Date().toLocaleTimeString(
        "pt-BR",
        {
          hour: "2-digit",
          minute: "2-digit",
        }
      );

    const messageId =
      `${Date.now()}-${Math.random()}`;

    const ownMessage: ChatMessage = {
      id: messageId,
      text,
      time,
      senderName:
        participantName || "Você",
      isOwn: true,
    };

    setMessages(
      (currentMessages) => [
        ...currentMessages,
        ownMessage,
      ]
    );

    socket.emit(
      "send-chat-message",
      {
        roomId,
        message: {
          id: messageId,
          text,
          time,
        },
      }
    );

    setNewMessage("");
  }

  // --------------------------------------------------
  // CONTROLES
  // --------------------------------------------------

  function toggleMicrophone() {
    const tracks =
      mediaStreamRef.current
        ?.getAudioTracks();

    if (
      !tracks ||
      tracks.length === 0
    ) {
      return;
    }

    const nextState =
      !isMicOn;

    tracks.forEach((track) => {
      track.enabled =
        nextState;
    });

    setIsMicOn(nextState);
  }

  function toggleCamera() {
    const tracks =
      mediaStreamRef.current
        ?.getVideoTracks();

    if (
      !tracks ||
      tracks.length === 0
    ) {
      return;
    }

    const nextState =
      !isCameraOn;

    tracks.forEach((track) => {
      track.enabled =
        nextState;
    });

    setIsCameraOn(nextState);
  }

  async function copyRoomCode() {
    try {
      await navigator.clipboard
        .writeText(roomId);

      alert(
        "Código da sala copiado!"
      );
    } catch (error) {
      console.error(
        "Erro ao copiar código:",
        error
      );
    }
  }

  async function copyInviteLink() {
    try {
      await navigator.clipboard
        .writeText(
          window.location.href
        );

      alert(
        "Link da reunião copiado!"
      );
    } catch (error) {
      console.error(
        "Erro ao copiar convite:",
        error
      );
    }
  }

  function leaveMeeting() {
    mediaStreamRef.current
      ?.getTracks()
      .forEach((track) => {
        track.stop();
      });

    screenStreamRef.current
      ?.getTracks()
      .forEach((track) => {
        track.onended = null;
        track.stop();
      });

    peerConnectionRef.current
      ?.close();

    socketRef.current
      ?.disconnect();

    router.push(
      "/dashboard"
    );
  }

  // --------------------------------------------------
  // INTERFACE
  // --------------------------------------------------

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

              <p className="mt-2 text-xs text-zinc-500">
                Você é{" "}
                <span className="font-semibold text-blue-400">
                  {participantName ||
                    "..."}
                </span>
              </p>

              <p className="mt-1 text-xs text-zinc-500">
                {participantCount} de
                2 participantes
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={
                  copyRoomCode
                }
                className="cursor-pointer rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold transition hover:bg-zinc-800"
              >
                📋 Copiar código
              </button>

              <button
                type="button"
                onClick={
                  copyInviteLink
                }
                className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold transition hover:bg-blue-500"
              >
                🔗 Copiar convite
              </button>
            </div>
          </div>

          <p className="mt-4 text-sm text-zinc-300">
            Código da sala:{" "}
            <strong>{roomId}</strong>
          </p>
        </header>

        {roomFull && (
          <div className="mb-5 rounded-xl border border-yellow-800 bg-yellow-950/40 p-4 text-yellow-300">
            Esta sala já possui
            2 participantes.
          </div>
        )}

        <div
          className={`grid gap-5 ${
            isChatOpen
              ? "xl:grid-cols-[1fr_350px]"
              : ""
          }`}
        >
          <div>
            {/* VÍDEOS */}
            <section className="grid gap-6 md:grid-cols-2">
              {/* Local */}
              <div className="relative aspect-video overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
                <video
                  ref={
                    localVideoRef
                  }
                  autoPlay
                  playsInline
                  muted
                  className={`h-full w-full object-cover ${
                    isScreenSharing ||
                    isCameraOn
                      ? ""
                      : "hidden"
                  }`}
                />

                {!isCameraOn &&
                  !isScreenSharing && (
                    <div className="flex h-full flex-col items-center justify-center gap-3">
                      <div className="text-5xl">
                        👤
                      </div>

                      <p>
                        Câmera desligada
                      </p>
                    </div>
                  )}

                {isScreenSharing && (
                  <div className="absolute right-4 top-4 rounded-lg bg-purple-600 px-3 py-2 text-xs font-semibold">
                    🖥️ Compartilhando tela
                  </div>
                )}

                <div className="absolute bottom-4 left-4 rounded-lg bg-black/70 px-3 py-2 text-sm">
                  Você —{" "}
                  {participantName}
                </div>
              </div>

              {/* Remoto */}
              <div className="relative aspect-video overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
                {remoteParticipantId ? (
                  <>
                    <video
                      ref={
                        remoteVideoRef
                      }
                      autoPlay
                      playsInline
                      className="h-full w-full object-cover"
                    />

                    {!isRemoteConnected && (
                      <div className="absolute inset-0 flex items-center justify-center bg-zinc-950">
                        🔄 Conectando...
                      </div>
                    )}

                    <div className="absolute bottom-4 left-4 rounded-lg bg-black/70 px-3 py-2 text-sm">
                      {
                        remoteParticipantName
                      }
                    </div>
                  </>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center text-center">
                    <div className="text-4xl">
                      👤
                    </div>

                    <h2 className="mt-3 font-bold">
                      Aguardando participante
                    </h2>

                    <p className="mt-2 text-sm text-zinc-500">
                      Compartilhe o convite para alguém entrar na reunião.
                    </p>

                    <button
                      type="button"
                      onClick={
                        copyInviteLink
                      }
                      className="mt-5 cursor-pointer rounded-lg border border-blue-600 px-4 py-2 text-blue-400 transition hover:bg-blue-950"
                    >
                      🔗 Copiar link
                    </button>
                  </div>
                )}
              </div>
            </section>

            {/* ERRO */}
            {mediaError && (
              <div className="mt-4 rounded-xl border border-red-900 bg-red-950/40 p-4 text-red-300">
                {mediaError}
              </div>
            )}

            {/* CONTROLES */}
            <section className="mt-6 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={
                  toggleMicrophone
                }
                className={`cursor-pointer rounded-lg border px-5 py-3 transition ${
                  isMicOn
                    ? "border-emerald-600 text-emerald-400"
                    : "border-yellow-600 text-yellow-400"
                }`}
              >
                {isMicOn
                  ? "🎤 Microfone ligado"
                  : "🔇 Microfone desligado"}
              </button>

              <button
                type="button"
                onClick={
                  toggleCamera
                }
                className={`cursor-pointer rounded-lg border px-5 py-3 transition ${
                  isCameraOn
                    ? "border-emerald-600 text-emerald-400"
                    : "border-yellow-600 text-yellow-400"
                }`}
              >
                {isCameraOn
                  ? "📹 Câmera ligada"
                  : "🚫 Câmera desligada"}
              </button>

              {/* NOVO */}
              <button
                type="button"
                onClick={() => {
                  void toggleScreenSharing();
                }}
                className={`cursor-pointer rounded-lg border px-5 py-3 font-medium transition ${
                  isScreenSharing
                    ? "border-purple-500 bg-purple-600 text-white"
                    : "border-purple-600 text-purple-400 hover:bg-purple-950"
                }`}
              >
                {isScreenSharing
                  ? "⏹️ Parar compartilhamento"
                  : "🖥️ Compartilhar tela"}
              </button>

              <button
                type="button"
                onClick={() =>
                  setIsChatOpen(
                    !isChatOpen
                  )
                }
                className="cursor-pointer rounded-lg border border-blue-600 px-5 py-3 text-blue-400 transition hover:bg-blue-950"
              >
                💬{" "}
                {isChatOpen
                  ? "Fechar chat"
                  : "Abrir chat"}
              </button>

              <button
                type="button"
                onClick={
                  leaveMeeting
                }
                className="cursor-pointer rounded-lg bg-red-600 px-5 py-3 font-semibold transition hover:bg-red-500"
              >
                📞 Encerrar
              </button>
            </section>
          </div>

          {/* CHAT */}
          {isChatOpen && (
            <aside className="flex min-h-[550px] flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
              <div className="border-b border-zinc-800 p-4">
                <h2 className="font-bold">
                  💬 Chat
                </h2>

                <p className="mt-1 text-xs text-zinc-500">
                  {messages.length}{" "}
                  {messages.length === 1
                    ? "mensagem"
                    : "mensagens"}
                </p>
              </div>

              <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
                {messages.length ===
                0 ? (
                  <div className="flex flex-1 items-center justify-center text-center text-zinc-500">
                    Nenhuma mensagem ainda
                  </div>
                ) : (
                  messages.map(
                    (message) => (
                      <div
                        key={
                          message.id
                        }
                        className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                          message.isOwn
                            ? "ml-auto bg-blue-600"
                            : "mr-auto bg-zinc-700"
                        }`}
                      >
                        <div className="mb-1 flex justify-between gap-4 text-xs">
                          <strong>
                            {message.isOwn
                              ? "Você"
                              : message.senderName}
                          </strong>

                          <span className="opacity-70">
                            {
                              message.time
                            }
                          </span>
                        </div>

                        <p className="break-words">
                          {
                            message.text
                          }
                        </p>
                      </div>
                    )
                  )
                )}

                <div
                  ref={
                    messagesEndRef
                  }
                />
              </div>

              <form
                onSubmit={
                  sendMessage
                }
                className="border-t border-zinc-800 p-4"
              >
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={
                      newMessage
                    }
                    onChange={(
                      event
                    ) =>
                      setNewMessage(
                        event.target
                          .value
                      )
                    }
                    placeholder="Digite uma mensagem..."
                    autoComplete="off"
                    className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 outline-none transition focus:border-blue-500"
                  />

                  <button
                    type="submit"
                    disabled={
                      !newMessage.trim()
                    }
                    className="cursor-pointer rounded-lg bg-blue-600 px-4 py-3 font-semibold transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Enviar
                  </button>
                </div>
              </form>
            </aside>
          )}
        </div>
      </div>
    </main>
  );
}