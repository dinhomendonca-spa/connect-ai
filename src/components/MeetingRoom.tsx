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

type MediaStatus = {
  isMicOn: boolean;
  isCameraOn: boolean;
  isScreenSharing: boolean;
};

type RoomParticipant = {
  participantId: string;
  participantName: string;
  mediaStatus: MediaStatus;
};

type NotificationTone =
  | "info"
  | "success"
  | "warning"
  | "danger";

type RoomNotification = {
  id: string;
  text: string;
  tone: NotificationTone;
};

const CURRENT_USER_SESSION_KEY =
  "connectai-current-user";

const FALLBACK_PARTICIPANT_KEY =
  "connectai-participant-name";

const DEFAULT_MEDIA_STATUS: MediaStatus = {
  isMicOn: true,
  isCameraOn: true,
  isScreenSharing: false,
};

const NOTIFICATION_CLASSES: Record<
  NotificationTone,
  string
> = {
  info:
    "border-blue-700 bg-blue-950/95",

  success:
    "border-emerald-700 bg-emerald-950/95",

  warning:
    "border-yellow-700 bg-yellow-950/95",

  danger:
    "border-red-700 bg-red-950/95",
};

export default function MeetingRoom({
  roomId,
}: MeetingRoomProps) {
  const router = useRouter();

  // --------------------------------------------------
  // REFERÊNCIAS
  // --------------------------------------------------

  const localVideoRef =
    useRef<HTMLVideoElement>(null);

  const remoteVideoRef =
    useRef<HTMLVideoElement>(null);

  const mediaStreamRef =
    useRef<MediaStream | null>(null);

  const screenStreamRef =
    useRef<MediaStream | null>(null);

  const socketRef =
    useRef<Socket | null>(null);

  const peerConnectionRef =
    useRef<RTCPeerConnection | null>(
      null
    );

  const pendingIceCandidatesRef =
    useRef<RTCIceCandidateInit[]>(
      []
    );

  const messagesEndRef =
    useRef<HTMLDivElement>(null);

  const localMediaStatusRef =
    useRef<MediaStatus>({
      ...DEFAULT_MEDIA_STATUS,
    });

  const remoteMediaStatusRef =
    useRef<MediaStatus>({
      ...DEFAULT_MEDIA_STATUS,
    });

  const notificationTimeoutsRef =
    useRef<
      ReturnType<typeof setTimeout>[]
    >([]);

  // --------------------------------------------------
  // IDENTIDADE
  // --------------------------------------------------

  const [
    participantName,
    setParticipantName,
  ] = useState("");

  const [
    remoteParticipantName,
    setRemoteParticipantName,
  ] = useState("Participante");

  // --------------------------------------------------
  // MÍDIA LOCAL
  // --------------------------------------------------

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

  // --------------------------------------------------
  // PARTICIPANTE REMOTO
  // --------------------------------------------------

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

  const [
    remoteMediaStatus,
    setRemoteMediaStatus,
  ] = useState<MediaStatus>({
    ...DEFAULT_MEDIA_STATUS,
  });

  const [roomFull, setRoomFull] =
    useState(false);

  // --------------------------------------------------
  // NOTIFICAÇÕES
  // --------------------------------------------------

  const [
    notifications,
    setNotifications,
  ] = useState<RoomNotification[]>(
    []
  );

  // --------------------------------------------------
  // CHAT
  // --------------------------------------------------

  const [isChatOpen, setIsChatOpen] =
    useState(false);

  const [newMessage, setNewMessage] =
    useState("");

  const [messages, setMessages] =
    useState<ChatMessage[]>([]);

  // --------------------------------------------------
  // IDENTIDADE DO USUÁRIO
  // --------------------------------------------------

  function getParticipantName() {
    try {
      const storedCurrentUser =
        sessionStorage.getItem(
          CURRENT_USER_SESSION_KEY
        );

      if (storedCurrentUser) {
        const currentUser: CurrentUser =
          JSON.parse(
            storedCurrentUser
          );

        if (
          currentUser.name &&
          currentUser.name.trim()
        ) {
          return currentUser.name.trim();
        }
      }
    } catch (error) {
      console.error(
        "Erro ao recuperar usuário:",
        error
      );
    }

    const fallbackName =
      sessionStorage.getItem(
        FALLBACK_PARTICIPANT_KEY
      );

    if (fallbackName) {
      return fallbackName;
    }

    const randomNumber =
      Math.floor(
        1000 +
          Math.random() * 9000
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
  // STATUS DE MÍDIA
  // --------------------------------------------------

  function broadcastMediaStatus(
    changes: Partial<MediaStatus>
  ) {
    const nextStatus = {
      ...localMediaStatusRef.current,
      ...changes,
    };

    localMediaStatusRef.current =
      nextStatus;

    socketRef.current?.emit(
      "media-status-change",
      {
        roomId,
        status: nextStatus,
      }
    );
  }

  // --------------------------------------------------
  // WEBRTC
  // --------------------------------------------------

  function clearRemoteParticipant() {
    peerConnectionRef.current?.close();

    peerConnectionRef.current = null;

    pendingIceCandidatesRef.current =
      [];

    setRemoteParticipantId(null);

    setRemoteParticipantName(
      "Participante"
    );

    const defaultStatus = {
      ...DEFAULT_MEDIA_STATUS,
    };

    remoteMediaStatusRef.current =
      defaultStatus;

    setRemoteMediaStatus(
      defaultStatus
    );

    setIsRemoteConnected(false);

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject =
        null;
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

    const audioTrack =
      cameraStream?.getAudioTracks()[0];

    if (
      audioTrack &&
      cameraStream
    ) {
      peerConnection.addTrack(
        audioTrack,
        cameraStream
      );
    }

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

    peerConnection.ontrack = (
      event
    ) => {
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

        if (
          state === "connected"
        ) {
          setIsRemoteConnected(true);
        }

        if (
          state === "failed" ||
          state === "closed" ||
          state === "disconnected"
        ) {
          setIsRemoteConnected(
            false
          );
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
          "Erro no ICE candidate:",
          error
        );
      }
    }

    pendingIceCandidatesRef.current =
      [];
  }

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
            sender.track?.kind ===
            "video"
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
        "Erro ao trocar vídeo:",
        error
      );
    }
  }

  // --------------------------------------------------
  // COMPARTILHAMENTO DE TELA
  // --------------------------------------------------

  async function startScreenSharing() {
    try {
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

      await replaceOutgoingVideoTrack(
        screenTrack
      );

      if (localVideoRef.current) {
        localVideoRef.current.srcObject =
          screenStream;
      }

      setIsScreenSharing(true);

      broadcastMediaStatus({
        isScreenSharing: true,
      });

      screenTrack.onended = () => {
        void stopScreenSharing();
      };
    } catch (error) {
      console.log(
        "Compartilhamento cancelado:",
        error
      );
    }
  }

  async function stopScreenSharing() {
    const cameraStream =
      mediaStreamRef.current;

    const cameraTrack =
      cameraStream?.getVideoTracks()[0];

    if (cameraTrack) {
      await replaceOutgoingVideoTrack(
        cameraTrack
      );
    }

    screenStreamRef.current
      ?.getTracks()
      .forEach((track) => {
        track.onended = null;
        track.stop();
      });

    screenStreamRef.current = null;

    if (localVideoRef.current) {
      localVideoRef.current.srcObject =
        cameraStream ?? null;
    }

    setIsScreenSharing(false);

    broadcastMediaStatus({
      isScreenSharing: false,
    });
  }

  async function toggleScreenSharing() {
    if (isScreenSharing) {
      await stopScreenSharing();
      return;
    }

    await startScreenSharing();
  }

  // --------------------------------------------------
  // INICIALIZAÇÃO
  // --------------------------------------------------

  useEffect(() => {
    let componentActive = true;

    const myParticipantName =
      getParticipantName();

    setParticipantName(
      myParticipantName
    );

    function addNotification(
      text: string,
      tone: NotificationTone =
        "info"
    ) {
      const id =
        `${Date.now()}-${Math.random()}`;

      setNotifications(
        (currentNotifications) => [
          ...currentNotifications,
          {
            id,
            text,
            tone,
          },
        ]
      );

      const timeout =
        setTimeout(() => {
          setNotifications(
            (currentNotifications) =>
              currentNotifications.filter(
                (notification) =>
                  notification.id !== id
              )
          );
        }, 4500);

      notificationTimeoutsRef.current.push(
        timeout
      );
    }

    async function startMeeting() {
      // --------------------------------
      // CÂMERA E MICROFONE
      // --------------------------------

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

        const initialMicState =
          audioTrack?.enabled ??
          false;

        const initialCameraState =
          videoTrack?.enabled ??
          false;

        setIsMicOn(
          initialMicState
        );

        setIsCameraOn(
          initialCameraState
        );

        localMediaStatusRef.current =
          {
            isMicOn:
              initialMicState,

            isCameraOn:
              initialCameraState,

            isScreenSharing:
              false,
          };
      } catch (error) {
        console.error(
          "Erro ao acessar mídia:",
          error
        );

        setMediaError(
          "Não foi possível acessar a câmera ou o microfone."
        );

        setIsMicOn(false);
        setIsCameraOn(false);

        localMediaStatusRef.current =
          {
            isMicOn: false,
            isCameraOn: false,
            isScreenSharing:
              false,
          };
      }

      if (!componentActive) {
        return;
      }

      // --------------------------------
      // SOCKET
      // --------------------------------

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

          mediaStatus:
            localMediaStatusRef.current,
        });
      });

      // --------------------------------
      // QUEM JÁ ESTAVA NA SALA
      // --------------------------------

      socket.on(
        "existing-participants",
        async ({
          participants,
        }: {
          participants:
            RoomParticipant[];
        }) => {
          if (
            participants.length ===
            0
          ) {
            return;
          }

          const participant =
            participants[0];

          setRemoteParticipantId(
            participant.participantId
          );

          setRemoteParticipantName(
            participant.participantName
          );

          remoteMediaStatusRef.current =
            participant.mediaStatus;

          setRemoteMediaStatus(
            participant.mediaStatus
          );

          const peerConnection =
            createPeerConnection(
              participant.participantId
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
                targetId:
                  participant.participantId,

                offer,
              }
            );
          } catch (error) {
            console.error(
              "Erro ao criar oferta:",
              error
            );
          }
        }
      );

      // --------------------------------
      // PARTICIPANTE ENTROU
      // --------------------------------

      socket.on(
        "participant-joined",
        ({
          participantId,
          participantName:
            joinedName,
          mediaStatus,
        }: RoomParticipant) => {
          setRemoteParticipantId(
            participantId
          );

          setRemoteParticipantName(
            joinedName
          );

          remoteMediaStatusRef.current =
            mediaStatus;

          setRemoteMediaStatus(
            mediaStatus
          );

          addNotification(
            `👋 ${joinedName} entrou na reunião.`,
            "success"
          );
        }
      );

      // --------------------------------
      // STATUS REMOTO
      // --------------------------------

      socket.on(
        "participant-media-status",
        ({
          participantName:
            changedParticipantName,
          mediaStatus,
        }: {
          participantId: string;
          participantName: string;
          mediaStatus: MediaStatus;
        }) => {
          const previousStatus =
            remoteMediaStatusRef.current;

          const name =
            changedParticipantName ||
            "Participante";

          // MICROFONE
          if (
            previousStatus.isMicOn &&
            !mediaStatus.isMicOn
          ) {
            addNotification(
              `🔇 ${name} desligou o microfone.`,
              "warning"
            );
          }

          if (
            !previousStatus.isMicOn &&
            mediaStatus.isMicOn
          ) {
            addNotification(
              `🎤 ${name} ligou o microfone.`,
              "success"
            );
          }

          // CÂMERA
          if (
            previousStatus.isCameraOn &&
            !mediaStatus.isCameraOn
          ) {
            addNotification(
              `🚫 ${name} desligou a câmera.`,
              "warning"
            );
          }

          if (
            !previousStatus.isCameraOn &&
            mediaStatus.isCameraOn
          ) {
            addNotification(
              `📹 ${name} ligou a câmera.`,
              "success"
            );
          }

          // COMPARTILHAMENTO
          if (
            !previousStatus
              .isScreenSharing &&
            mediaStatus.isScreenSharing
          ) {
            addNotification(
              `🖥️ ${name} começou a compartilhar a tela.`,
              "info"
            );
          }

          if (
            previousStatus
              .isScreenSharing &&
            !mediaStatus.isScreenSharing
          ) {
            addNotification(
              `✅ ${name} parou de compartilhar a tela.`,
              "info"
            );
          }

          remoteMediaStatusRef.current =
            mediaStatus;

          setRemoteMediaStatus(
            mediaStatus
          );
        }
      );

      // --------------------------------
      // OFERTA WEBRTC
      // --------------------------------

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

          setRemoteParticipantName(
            senderName ||
              "Participante"
          );

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
              "Erro ao responder oferta:",
              error
            );
          }
        }
      );

      // --------------------------------
      // RESPOSTA WEBRTC
      // --------------------------------

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
              "Erro ao aplicar resposta:",
              error
            );
          }
        }
      );

      // --------------------------------
      // ICE
      // --------------------------------

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
              .current.push(
                candidate
              );

            return;
          }

          try {
            await peerConnection
              .addIceCandidate(
                candidate
              );
          } catch (error) {
            console.error(
              "Erro no ICE:",
              error
            );
          }
        }
      );

      // --------------------------------
      // CONTADOR
      // --------------------------------

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

      // --------------------------------
      // PARTICIPANTE SAIU
      // --------------------------------

      socket.on(
        "participant-left",
        ({
          participantName:
            leftParticipantName,
        }: {
          participantId: string;
          participantName: string;
        }) => {
          addNotification(
            `👋 ${leftParticipantName} saiu da reunião.`,
            "danger"
          );

          clearRemoteParticipant();
        }
      );

      // --------------------------------
      // SALA CHEIA
      // --------------------------------

      socket.on(
        "room-full",
        () => {
          setRoomFull(true);

          addNotification(
            "⚠️ Esta sala já possui 2 participantes.",
            "warning"
          );
        }
      );

      // --------------------------------
      // CHAT
      // --------------------------------

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

    return () => {
      componentActive = false;

      notificationTimeoutsRef.current.forEach(
        (timeout) => {
          clearTimeout(timeout);
        }
      );

      notificationTimeoutsRef.current =
        [];

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
  // ROLAGEM DO CHAT
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

  // --------------------------------------------------
  // MICROFONE
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

    broadcastMediaStatus({
      isMicOn: nextState,
    });
  }

  // --------------------------------------------------
  // CÂMERA
  // --------------------------------------------------

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

    broadcastMediaStatus({
      isCameraOn: nextState,
    });
  }

  // --------------------------------------------------
  // CHAT
  // --------------------------------------------------

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
  // COPIAR
  // --------------------------------------------------

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

  // --------------------------------------------------
  // SAIR
  // --------------------------------------------------

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

    router.push("/dashboard");
  }

  // --------------------------------------------------
  // INTERFACE
  // --------------------------------------------------

  const remoteVideoAvailable =
    remoteMediaStatus.isCameraOn ||
    remoteMediaStatus.isScreenSharing;

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      {/* NOTIFICAÇÕES */}
      <div className="fixed right-4 top-4 z-50 flex w-[min(380px,calc(100vw-2rem))] flex-col gap-3">
        {notifications.map(
          (notification) => (
            <div
              key={notification.id}
              className={`rounded-xl border px-4 py-3 text-sm text-white shadow-xl backdrop-blur ${NOTIFICATION_CLASSES[notification.tone]}`}
            >
              {notification.text}
            </div>
          )
        )}
      </div>

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
                {participantCount} de 2
                participantes
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
            <strong>{roomId}</strong>
          </p>
        </header>

        {roomFull && (
          <div className="mb-5 rounded-xl border border-yellow-800 bg-yellow-950/40 p-4 text-yellow-300">
            Esta sala já possui 2
            participantes.
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
            <section className="grid gap-6 md:grid-cols-2">
              {/* PARTICIPANTE LOCAL */}
              <div className="relative aspect-video overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
                <video
                  ref={localVideoRef}
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
                    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                      <div className="text-5xl">
                        👤
                      </div>

                      <p className="font-semibold">
                        Câmera desligada
                      </p>
                    </div>
                  )}

                {isScreenSharing && (
                  <div className="absolute right-4 top-4 rounded-lg bg-purple-600 px-3 py-2 text-xs font-semibold">
                    🖥️ Compartilhando tela
                  </div>
                )}

                {!isMicOn && (
                  <div className="absolute left-4 top-4 rounded-lg bg-yellow-600 px-3 py-2 text-xs font-semibold">
                    🔇 Microfone desligado
                  </div>
                )}

                <div className="absolute bottom-4 left-4 rounded-lg bg-black/70 px-3 py-2 text-sm">
                  Você —{" "}
                  {participantName}
                </div>
              </div>

              {/* PARTICIPANTE REMOTO */}
              <div className="relative aspect-video overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
                {remoteParticipantId ? (
                  <>
                    <video
                      ref={remoteVideoRef}
                      autoPlay
                      playsInline
                      className={`h-full w-full object-cover ${
                        remoteVideoAvailable
                          ? ""
                          : "hidden"
                      }`}
                    />

                    {!isRemoteConnected && (
                      <div className="absolute inset-0 flex items-center justify-center bg-zinc-950">
                        🔄 Conectando...
                      </div>
                    )}

                    {isRemoteConnected &&
                      !remoteVideoAvailable && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-900 text-center">
                          <div className="text-5xl">
                            👤
                          </div>

                          <p className="font-semibold">
                            {
                              remoteParticipantName
                            }
                          </p>

                          <p className="text-sm text-zinc-400">
                            🚫 Câmera desligada
                          </p>
                        </div>
                      )}

                    <div className="absolute right-4 top-4 flex flex-col items-end gap-2">
                      {remoteMediaStatus.isScreenSharing && (
                        <div className="rounded-lg bg-purple-600 px-3 py-2 text-xs font-semibold">
                          🖥️ Compartilhando tela
                        </div>
                      )}

                      {!remoteMediaStatus.isMicOn && (
                        <div className="rounded-lg bg-yellow-600 px-3 py-2 text-xs font-semibold">
                          🔇 Microfone desligado
                        </div>
                      )}

                      {!remoteMediaStatus.isCameraOn &&
                        !remoteMediaStatus.isScreenSharing && (
                          <div className="rounded-lg bg-yellow-600 px-3 py-2 text-xs font-semibold">
                            🚫 Câmera desligada
                          </div>
                        )}
                    </div>

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
                      Compartilhe o convite
                      para alguém entrar.
                    </p>

                    <button
                      type="button"
                      onClick={copyInviteLink}
                      className="mt-5 cursor-pointer rounded-lg border border-blue-600 px-4 py-2 text-blue-400 transition hover:bg-blue-950"
                    >
                      🔗 Copiar link
                    </button>
                  </div>
                )}
              </div>
            </section>

            {mediaError && (
              <div className="mt-4 rounded-xl border border-red-900 bg-red-950/40 p-4 text-red-300">
                {mediaError}
              </div>
            )}

            {/* CONTROLES */}
            <section className="mt-6 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={toggleMicrophone}
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
                onClick={toggleCamera}
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
                onClick={leaveMeeting}
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
                  <div className="flex flex-1 items-center justify-center text-zinc-500">
                    Nenhuma mensagem ainda
                  </div>
                ) : (
                  messages.map(
                    (message) => (
                      <div
                        key={message.id}
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
                  ref={messagesEndRef}
                />
              </div>

              <form
                onSubmit={sendMessage}
                className="border-t border-zinc-800 p-4"
              >
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newMessage}
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