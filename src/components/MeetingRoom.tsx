"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { useRouter } from "next/navigation";
import { io, type Socket } from "socket.io-client";

// ==================================================
// TIPOS
// ==================================================

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
  isTranscribing: boolean;
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

type TranscriptEntry = {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  time: string;
  isOwn: boolean;
};

type ServerTranscriptEntry = {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  time: string;
  createdAt?: number;
};

// ==================================================
// SPEECH RECOGNITION
// ==================================================

type SpeechRecognitionAlternativeLike = {
  transcript: string;
  confidence: number;
};

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  length: number;

  [index: number]: SpeechRecognitionAlternativeLike;
};

type SpeechRecognitionResultListLike = {
  length: number;

  [index: number]: SpeechRecognitionResultLike;
};

type SpeechRecognitionEventLike = Event & {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
};

type SpeechRecognitionErrorEventLike = Event & {
  error: string;
  message?: string;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;

  start: () => void;
  stop: () => void;
  abort: () => void;

  onstart: (() => void) | null;
  onend: (() => void) | null;

  onresult:
    | ((event: SpeechRecognitionEventLike) => void)
    | null;

  onerror:
    | ((event: SpeechRecognitionErrorEventLike) => void)
    | null;
};

type SpeechRecognitionConstructor =
  new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

// ==================================================
// CONSTANTES
// ==================================================

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
    "border-blue-400/20 bg-blue-500/10 text-blue-100",

  success:
    "border-emerald-400/20 bg-emerald-500/10 text-emerald-100",

  warning:
    "border-yellow-400/20 bg-yellow-500/10 text-yellow-100",

  danger:
    "border-red-400/20 bg-red-500/10 text-red-100",
};

// ==================================================
// CRONÔMETRO
// ==================================================

function formatMeetingDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);

  const minutes = Math.floor(
    (totalSeconds % 3600) / 60
  );

  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

// ==================================================
// COMPONENTE
// ==================================================

export default function MeetingRoom({
  roomId,
}: MeetingRoomProps) {
  const router = useRouter();

  // ==================================================
  // REFS
  // ==================================================

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
    useRef<RTCPeerConnection | null>(null);

  const pendingIceCandidatesRef =
    useRef<RTCIceCandidateInit[]>([]);

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

  const speechRecognitionRef =
    useRef<SpeechRecognitionLike | null>(
      null
    );

  const shouldKeepTranscribingRef =
    useRef(false);

  const chatScrollRef =
    useRef<HTMLDivElement>(null);

  const transcriptScrollRef =
    useRef<HTMLDivElement>(null);

  const videoStageRef =
    useRef<HTMLElement>(null);

  // ==================================================
  // IDENTIDADE
  // ==================================================

  const [
    participantName,
    setParticipantName,
  ] = useState("");

  const [
    remoteParticipantName,
    setRemoteParticipantName,
  ] = useState("Participante");

  // ==================================================
  // CRONÔMETRO
  // ==================================================

  const [
    meetingSeconds,
    setMeetingSeconds,
  ] = useState(0);

  // ==================================================
  // FULLSCREEN
  // ==================================================

  const [
    isFullscreenLayout,
    setIsFullscreenLayout,
  ] = useState(false);

  // ==================================================
  // MÍDIA
  // ==================================================

  const [isMicOn, setIsMicOn] =
    useState(true);

  const [
    isCameraOn,
    setIsCameraOn,
  ] = useState(true);

  const [
    isScreenSharing,
    setIsScreenSharing,
  ] = useState(false);

  const [
    mediaError,
    setMediaError,
  ] = useState("");

  // ==================================================
  // PARTICIPANTE REMOTO
  // ==================================================

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

  const [
    roomFull,
    setRoomFull,
  ] = useState(false);

  // ==================================================
  // NOTIFICAÇÕES
  // ==================================================

  const [
    notifications,
    setNotifications,
  ] = useState<RoomNotification[]>([]);

  // ==================================================
  // CHAT
  // ==================================================

  const [
    isChatOpen,
    setIsChatOpen,
  ] = useState(false);

  const [
    newMessage,
    setNewMessage,
  ] = useState("");

  const [
    messages,
    setMessages,
  ] = useState<ChatMessage[]>([]);

  // ==================================================
  // TRANSCRIÇÃO
  // ==================================================

  const [
    isTranscribing,
    setIsTranscribing,
  ] = useState(false);

  const [
    isRemoteTranscribing,
    setIsRemoteTranscribing,
  ] = useState(false);

  const [
    isTranscriptOpen,
    setIsTranscriptOpen,
  ] = useState(false);

  const [
    transcriptEntries,
    setTranscriptEntries,
  ] = useState<TranscriptEntry[]>([]);

  const [
    interimTranscript,
    setInterimTranscript,
  ] = useState("");

  const [
    transcriptionSupported,
    setTranscriptionSupported,
  ] = useState<boolean | null>(null);

  // ==================================================
  // NOTIFICAÇÕES
  // ==================================================

  const addNotification =
    useCallback(
      (
        text: string,
        tone: NotificationTone = "info"
      ) => {
        const id =
          `${Date.now()}-${Math.random()}`;

        setNotifications((current) => [
          ...current,
          {
            id,
            text,
            tone,
          },
        ]);

        const timeout = setTimeout(() => {
          setNotifications((current) =>
            current.filter(
              (notification) =>
                notification.id !== id
            )
          );
        }, 4500);

        notificationTimeoutsRef.current.push(
          timeout
        );
      },
      []
    );

  // ==================================================
  // FULLSCREEN
  // ==================================================

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreenLayout(
        document.fullscreenElement ===
          videoStageRef.current
      );
    }

    document.addEventListener(
      "fullscreenchange",
      handleFullscreenChange
    );

    return () => {
      document.removeEventListener(
        "fullscreenchange",
        handleFullscreenChange
      );
    };
  }, []);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }

      if (!videoStageRef.current) {
        return;
      }

      await videoStageRef.current.requestFullscreen();
    } catch (error) {
      console.error(
        "Erro ao ativar tela cheia:",
        error
      );

      addNotification(
        "Não foi possível ativar a tela cheia.",
        "warning"
      );
    }
  }

  // ==================================================
  // SUPORTE À TRANSCRIÇÃO
  // ==================================================

  useEffect(() => {
    const supported = Boolean(
      window.SpeechRecognition ||
        window.webkitSpeechRecognition
    );

    setTranscriptionSupported(supported);
  }, []);

  // ==================================================
  // TIMER
  // ==================================================

  useEffect(() => {
    const meetingStartedAt = Date.now();

    function updateTimer() {
      const elapsed =
        Date.now() - meetingStartedAt;

      setMeetingSeconds(
        Math.floor(elapsed / 1000)
      );
    }

    updateTimer();

    const interval =
      window.setInterval(
        updateTimer,
        1000
      );

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  // ==================================================
  // IDENTIDADE
  // ==================================================

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

  // ==================================================
  // STATUS DE MÍDIA
  // ==================================================

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

  // ==================================================
  // WEBRTC
  // ==================================================

  function clearRemoteParticipant() {
    peerConnectionRef.current?.close();

    peerConnectionRef.current = null;

    pendingIceCandidatesRef.current = [];

    setRemoteParticipantId(null);

    setRemoteParticipantName(
      "Participante"
    );

    setIsRemoteTranscribing(false);

    const defaultStatus = {
      ...DEFAULT_MEDIA_STATUS,
    };

    remoteMediaStatusRef.current =
      defaultStatus;

    setRemoteMediaStatus(defaultStatus);

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

    if (audioTrack && cameraStream) {
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
    for (const candidate of
      pendingIceCandidatesRef.current) {
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

    pendingIceCandidatesRef.current = [];
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
        "Erro ao trocar vídeo:",
        error
      );
    }
  }

  // ==================================================
  // COMPARTILHAR TELA
  // ==================================================

  async function startScreenSharing() {
    try {
      const screenStream =
        await navigator.mediaDevices.getDisplayMedia(
          {
            video: true,
            audio: false,
          }
        );

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

  // ==================================================
  // TRANSCRIÇÃO
  // ==================================================

  function startTranscription() {
    if (isTranscribing) {
      return;
    }

    const Recognition =
      window.SpeechRecognition ??
      window.webkitSpeechRecognition;

    if (!Recognition) {
      setTranscriptionSupported(false);

      addNotification(
        "Seu navegador não oferece suporte à transcrição.",
        "warning"
      );

      return;
    }

    const recognition =
      new Recognition();

    recognition.lang = "pt-BR";
    recognition.continuous = true;
    recognition.interimResults = true;

    shouldKeepTranscribingRef.current =
      true;

    speechRecognitionRef.current =
      recognition;

    setIsChatOpen(false);
    setIsTranscriptOpen(true);

    recognition.onstart = () => {
      setIsTranscribing(true);

      socketRef.current?.emit(
        "transcription-status-change",
        {
          roomId,
          isTranscribing: true,
        }
      );
    };

    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";

      for (
        let index = event.resultIndex;
        index < event.results.length;
        index += 1
      ) {
        const result =
          event.results[index];

        const text =
          result[0]?.transcript?.trim();

        if (!text) {
          continue;
        }

        if (result.isFinal) {
          finalText += `${text} `;
        } else {
          interimText += `${text} `;
        }
      }

      setInterimTranscript(
        interimText.trim()
      );

      const normalizedFinalText =
        finalText.trim();

      if (!normalizedFinalText) {
        return;
      }

      const socket =
        socketRef.current;

      if (!socket) {
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

      const id =
        `${Date.now()}-${Math.random()}`;

      const ownEntry: TranscriptEntry = {
        id,

        senderId:
          socket.id ?? "local",

        senderName:
          participantName || "Você",

        text:
          normalizedFinalText,

        time,

        isOwn: true,
      };

      setTranscriptEntries(
        (current) => [
          ...current,
          ownEntry,
        ]
      );

      socket.emit(
        "transcript-entry",
        {
          roomId,

          entry: {
            id,

            text:
              normalizedFinalText,

            time,
          },
        }
      );

      setInterimTranscript("");
    };

    recognition.onerror = (event) => {
      console.error(
        "Erro na transcrição:",
        event.error
      );

      if (
        event.error === "not-allowed" ||
        event.error ===
          "service-not-allowed" ||
        event.error ===
          "audio-capture"
      ) {
        shouldKeepTranscribingRef.current =
          false;

        setIsTranscribing(false);

        socketRef.current?.emit(
          "transcription-status-change",
          {
            roomId,
            isTranscribing: false,
          }
        );

        addNotification(
          "A transcrição não conseguiu acessar o reconhecimento de voz.",
          "warning"
        );
      }

      if (event.error === "network") {
        addNotification(
          "O reconhecimento de voz perdeu a conexão.",
          "warning"
        );
      }
    };

    recognition.onend = () => {
      if (
        shouldKeepTranscribingRef.current
      ) {
        window.setTimeout(() => {
          try {
            recognition.start();
          } catch {
            // sessão anterior encerrando
          }
        }, 250);

        return;
      }

      setIsTranscribing(false);
    };

    try {
      recognition.start();
    } catch (error) {
      console.error(
        "Erro ao iniciar transcrição:",
        error
      );

      shouldKeepTranscribingRef.current =
        false;

      setIsTranscribing(false);

      addNotification(
        "Não foi possível iniciar a transcrição.",
        "warning"
      );
    }
  }

  function stopTranscription() {
    shouldKeepTranscribingRef.current =
      false;

    const recognition =
      speechRecognitionRef.current;

    speechRecognitionRef.current = null;

    if (recognition) {
      try {
        recognition.stop();
      } catch {
        // já encerrada
      }
    }

    setIsTranscribing(false);
    setInterimTranscript("");

    socketRef.current?.emit(
      "transcription-status-change",
      {
        roomId,
        isTranscribing: false,
      }
    );
  }

  // ==================================================
  // INICIALIZAÇÃO
  // ==================================================

  useEffect(() => {
    let componentActive = true;

    const myParticipantName =
      getParticipantName();

    setParticipantName(
      myParticipantName
    );

    async function startMeeting() {
      try {
        setMediaError("");

        const stream =
          await navigator.mediaDevices.getUserMedia(
            {
              video: true,
              audio: true,
            }
          );

        if (!componentActive) {
          stream
            .getTracks()
            .forEach((track) =>
              track.stop()
            );

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
          audioTrack?.enabled ?? false;

        const initialCameraState =
          videoTrack?.enabled ?? false;

        setIsMicOn(initialMicState);

        setIsCameraOn(
          initialCameraState
        );

        localMediaStatusRef.current = {
          isMicOn: initialMicState,

          isCameraOn:
            initialCameraState,

          isScreenSharing: false,
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

        localMediaStatusRef.current = {
          isMicOn: false,
          isCameraOn: false,
          isScreenSharing: false,
        };
      }

      if (!componentActive) {
        return;
      }

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

      // ==============================================
      // TRANSCRIÇÃO
      // ==============================================

      socket.on(
        "transcript-history",
        ({
          entries,
        }: {
          entries: ServerTranscriptEntry[];
        }) => {
          setTranscriptEntries(
            entries.map((entry) => ({
              ...entry,

              isOwn:
                entry.senderId ===
                socket.id,
            }))
          );
        }
      );

      socket.on(
        "transcript-entry",
        (
          entry: ServerTranscriptEntry
        ) => {
          setTranscriptEntries(
            (current) => {
              if (
                current.some(
                  (item) =>
                    item.id === entry.id
                )
              ) {
                return current;
              }

              return [
                ...current,

                {
                  ...entry,
                  isOwn: false,
                },
              ];
            }
          );
        }
      );

      // ==============================================
      // PARTICIPANTES
      // ==============================================

      socket.on(
        "existing-participants",
        async ({
          participants,
        }: {
          participants: RoomParticipant[];
        }) => {
          if (
            participants.length === 0
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

          setIsRemoteTranscribing(
            participant.isTranscribing
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
              await peerConnection.createOffer();

            await peerConnection.setLocalDescription(
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

      socket.on(
        "participant-joined",
        ({
          participantId,

          participantName:
            joinedName,

          mediaStatus,

          isTranscribing:
            joinedIsTranscribing,
        }: RoomParticipant) => {
          setRemoteParticipantId(
            participantId
          );

          setRemoteParticipantName(
            joinedName
          );

          setIsRemoteTranscribing(
            joinedIsTranscribing
          );

          remoteMediaStatusRef.current =
            mediaStatus;

          setRemoteMediaStatus(
            mediaStatus
          );

          addNotification(
            `${joinedName} entrou na reunião.`,
            "success"
          );
        }
      );

      socket.on(
        "participant-transcription-status",
        ({
          participantName:
            changedName,

          isTranscribing:
            remoteIsTranscribing,
        }: {
          participantId: string;
          participantName: string;
          isTranscribing: boolean;
        }) => {
          setIsRemoteTranscribing(
            remoteIsTranscribing
          );

          addNotification(
            remoteIsTranscribing
              ? `${changedName} ativou a transcrição.`
              : `${changedName} encerrou a transcrição.`,
            "info"
          );
        }
      );

      // ==============================================
      // STATUS DE MÍDIA
      // ==============================================

      socket.on(
        "participant-media-status",
        ({
          participantName:
            changedName,

          mediaStatus,
        }: {
          participantId: string;
          participantName: string;
          mediaStatus: MediaStatus;
        }) => {
          const previousStatus =
            remoteMediaStatusRef.current;

          const name =
            changedName ||
            "Participante";

          if (
            previousStatus.isMicOn &&
            !mediaStatus.isMicOn
          ) {
            addNotification(
              `${name} desligou o microfone.`,
              "warning"
            );
          }

          if (
            !previousStatus.isMicOn &&
            mediaStatus.isMicOn
          ) {
            addNotification(
              `${name} ligou o microfone.`,
              "success"
            );
          }

          if (
            previousStatus.isCameraOn &&
            !mediaStatus.isCameraOn
          ) {
            addNotification(
              `${name} desligou a câmera.`,
              "warning"
            );
          }

          if (
            !previousStatus.isCameraOn &&
            mediaStatus.isCameraOn
          ) {
            addNotification(
              `${name} ligou a câmera.`,
              "success"
            );
          }

          if (
            !previousStatus.isScreenSharing &&
            mediaStatus.isScreenSharing
          ) {
            addNotification(
              `${name} começou a compartilhar a tela.`,
              "info"
            );
          }

          if (
            previousStatus.isScreenSharing &&
            !mediaStatus.isScreenSharing
          ) {
            addNotification(
              `${name} parou de compartilhar a tela.`,
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

      // ==============================================
      // WEBRTC
      // ==============================================

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
            await peerConnection.setRemoteDescription(
              offer
            );

            await flushPendingIceCandidates(
              peerConnection
            );

            const answer =
              await peerConnection.createAnswer();

            await peerConnection.setLocalDescription(
              answer
            );

            socket.emit(
              "webrtc-answer",
              {
                targetId: senderId,
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
            await peerConnection.setRemoteDescription(
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
            !peerConnection.remoteDescription
          ) {
            pendingIceCandidatesRef.current.push(
              candidate
            );

            return;
          }

          try {
            await peerConnection.addIceCandidate(
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

      // ==============================================
      // SALA
      // ==============================================

      socket.on(
        "room-participants",
        ({
          count,
        }: {
          count: number;
        }) => {
          setParticipantCount(count);
        }
      );

      socket.on(
        "participant-left",
        ({
          participantName:
            leftName,
        }: {
          participantId: string;
          participantName: string;
        }) => {
          addNotification(
            `${leftName} saiu da reunião.`,
            "danger"
          );

          clearRemoteParticipant();
        }
      );

      socket.on("room-full", () => {
        setRoomFull(true);

        addNotification(
          "Esta sala já possui 2 participantes.",
          "warning"
        );
      });

      // ==============================================
      // CHAT
      // ==============================================

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
          setMessages((current) => [
            ...current,

            {
              id,
              text,
              time,

              senderName:
                senderName ||
                "Participante",

              isOwn: false,
            },
          ]);
        }
      );
    }

    startMeeting();

    return () => {
      componentActive = false;

      shouldKeepTranscribingRef.current =
        false;

      try {
        speechRecognitionRef.current?.abort();
      } catch {
        // já encerrado
      }

      speechRecognitionRef.current = null;

      notificationTimeoutsRef.current.forEach(
        (timeout) => {
          clearTimeout(timeout);
        }
      );

      notificationTimeoutsRef.current = [];

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

      peerConnectionRef.current?.close();

      socketRef.current?.disconnect();

      mediaStreamRef.current = null;
      screenStreamRef.current = null;
      peerConnectionRef.current = null;
      socketRef.current = null;
    };
  }, [roomId, addNotification]);

  // ==================================================
  // SCROLL INTERNO DO CHAT
  // ==================================================

  useEffect(() => {
    if (!isChatOpen) {
      return;
    }

    const container =
      chatScrollRef.current;

    if (!container) {
      return;
    }

    const frame =
      requestAnimationFrame(() => {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: "smooth",
        });
      });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [messages, isChatOpen]);

  // ==================================================
  // SCROLL INTERNO DA TRANSCRIÇÃO
  // ==================================================

  useEffect(() => {
    if (!isTranscriptOpen) {
      return;
    }

    const container =
      transcriptScrollRef.current;

    if (!container) {
      return;
    }

    const frame =
      requestAnimationFrame(() => {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: "smooth",
        });
      });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [
    transcriptEntries,
    interimTranscript,
    isTranscriptOpen,
  ]);

  // ==================================================
  // CONTROLES DE MÍDIA
  // ==================================================

  function toggleMicrophone() {
    const tracks =
      mediaStreamRef.current?.getAudioTracks();

    if (
      !tracks ||
      tracks.length === 0
    ) {
      return;
    }

    const nextState =
      !isMicOn;

    tracks.forEach((track) => {
      track.enabled = nextState;
    });

    setIsMicOn(nextState);

    broadcastMediaStatus({
      isMicOn: nextState,
    });
  }

  function toggleCamera() {
    const tracks =
      mediaStreamRef.current?.getVideoTracks();

    if (
      !tracks ||
      tracks.length === 0
    ) {
      return;
    }

    const nextState =
      !isCameraOn;

    tracks.forEach((track) => {
      track.enabled = nextState;
    });

    setIsCameraOn(nextState);

    broadcastMediaStatus({
      isCameraOn: nextState,
    });
  }

  // ==================================================
  // CHAT
  // ==================================================

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

    setMessages((current) => [
      ...current,
      ownMessage,
    ]);

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

  // ==================================================
  // COPIAR
  // ==================================================

  async function copyRoomCode() {
    try {
      await navigator.clipboard.writeText(
        roomId
      );

      addNotification(
        "Código da sala copiado.",
        "success"
      );
    } catch (error) {
      console.error(
        "Erro ao copiar código:",
        error
      );

      addNotification(
        "Não foi possível copiar o código.",
        "warning"
      );
    }
  }

  async function copyInviteLink() {
    try {
      await navigator.clipboard.writeText(
        window.location.href
      );

      addNotification(
        "Link da reunião copiado.",
        "success"
      );
    } catch (error) {
      console.error(
        "Erro ao copiar convite:",
        error
      );

      addNotification(
        "Não foi possível copiar o convite.",
        "warning"
      );
    }
  }

  // ==================================================
  // ENCERRAR
  // ==================================================

  function leaveMeeting() {
    stopTranscription();

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

    peerConnectionRef.current?.close();

    socketRef.current?.disconnect();

    router.push("/dashboard");
  }

  // ==================================================
  // INTERFACE
  // ==================================================

  const remoteVideoAvailable =
    remoteMediaStatus.isCameraOn ||
    remoteMediaStatus.isScreenSharing;

  const sidePanelOpen =
    isChatOpen ||
    isTranscriptOpen;

  const glassPanel =
    "border border-white/10 bg-white/5 shadow-2xl shadow-black/20 backdrop-blur-2xl";

  const controlButton =
    "flex min-h-12 items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-sm font-semibold shadow-lg backdrop-blur-xl transition active:scale-95 sm:px-4";

  const videoTileClasses =
    isFullscreenLayout
      ? "relative h-full min-h-0 overflow-hidden bg-zinc-950"
      : `relative aspect-video overflow-hidden rounded-[1.6rem] ${glassPanel}`;

  return (
    <main className="relative min-h-[100dvh] overflow-x-hidden bg-[#05070d] text-white">
      {/* ================================================= */}
      {/* LUZES DE FUNDO / GLASSMORPHISM */}
      {/* ================================================= */}

      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-80 w-80 rounded-full bg-blue-500/15 blur-3xl" />

        <div className="absolute -right-32 top-1/3 h-96 w-96 rounded-full bg-purple-500/10 blur-3xl" />

        <div className="absolute bottom-[-150px] left-1/3 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
      </div>

      {/* ================================================= */}
      {/* NOTIFICAÇÕES */}
      {/* ================================================= */}

      <div className="fixed left-3 right-3 top-3 z-[100] flex flex-col gap-2 sm:left-auto sm:right-4 sm:w-[380px]">
        {notifications.map(
          (notification) => (
            <div
              key={notification.id}
              className={`rounded-2xl border px-4 py-3 text-sm shadow-2xl backdrop-blur-2xl ${NOTIFICATION_CLASSES[notification.tone]}`}
            >
              {notification.text}
            </div>
          )
        )}
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-3 pb-28 pt-3 sm:px-5 sm:pb-8 sm:pt-5">
        {/* ================================================= */}
        {/* CABEÇALHO DE VIDRO */}
        {/* ================================================= */}

        <header
          className={`mb-4 rounded-[1.7rem] p-4 sm:p-5 ${glassPanel}`}
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 text-xl shadow-lg backdrop-blur-xl">
                  ✦
                </div>

                <div className="min-w-0">
                  <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
                    ConnectAI
                  </h1>

                  <p className="text-xs text-zinc-400 sm:text-sm">
                    Reunião inteligente
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-zinc-300 backdrop-blur-xl">
                  👤{" "}
                  <strong className="text-blue-300">
                    {participantName ||
                      "..."}
                  </strong>
                </span>

                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-zinc-300 backdrop-blur-xl">
                  👥 {participantCount}/2
                </span>

                <span className="rounded-full border border-emerald-400/10 bg-emerald-400/5 px-3 py-1.5 font-mono text-emerald-300 backdrop-blur-xl">
                  ⏱{" "}
                  {formatMeetingDuration(
                    meetingSeconds
                  )}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex">
              <button
                type="button"
                onClick={copyRoomCode}
                className="min-h-11 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-semibold text-zinc-200 backdrop-blur-xl transition hover:bg-white/10 active:scale-95 sm:px-4 sm:text-sm"
              >
                📋 Código
              </button>

              <button
                type="button"
                onClick={copyInviteLink}
                className="min-h-11 rounded-xl border border-blue-400/20 bg-blue-500/15 px-3 text-xs font-semibold text-blue-100 shadow-lg backdrop-blur-xl transition hover:bg-blue-500/25 active:scale-95 sm:px-4 sm:text-sm"
              >
                🔗 Convidar
              </button>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-xl border border-white/5 bg-black/20 px-3 py-2">
            <p className="truncate text-[11px] text-zinc-500 sm:text-xs">
              Sala: {roomId}
            </p>
          </div>
        </header>

        {/* ================================================= */}
        {/* AVISOS */}
        {/* ================================================= */}

        {(isTranscribing ||
          isRemoteTranscribing) && (
          <div className="mb-4 flex items-center gap-3 rounded-2xl border border-red-400/15 bg-red-500/10 px-4 py-3 text-xs text-red-100 shadow-xl backdrop-blur-xl sm:text-sm">
            <span className="relative flex h-3 w-3 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-50" />

              <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
            </span>

            <span>
              Transcrição ativa nesta reunião.
            </span>
          </div>
        )}

        {roomFull && (
          <div className="mb-4 rounded-2xl border border-yellow-400/15 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-100 backdrop-blur-xl">
            Esta sala já possui 2 participantes.
          </div>
        )}

        {/* ================================================= */}
        {/* CONTEÚDO */}
        {/* ================================================= */}

        <div
          className={`grid gap-4 ${
            sidePanelOpen
              ? "xl:grid-cols-[1fr_390px]"
              : ""
          }`}
        >
          <div className="min-w-0">
            {/* ================================================= */}
            {/* VÍDEOS */}
            {/* ================================================= */}

            <section
              ref={videoStageRef}
              className={
                isFullscreenLayout
                  ? "relative grid h-screen w-screen grid-cols-1 grid-rows-2 gap-0 overflow-hidden bg-black"
                  : "relative grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2"
              }
            >
              {isFullscreenLayout && (
                <button
                  type="button"
                  onClick={() => {
                    void toggleFullscreen();
                  }}
                  className="absolute right-3 top-3 z-50 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-xs font-semibold text-white shadow-xl backdrop-blur-2xl transition hover:bg-black/60 sm:right-5 sm:top-5 sm:text-sm"
                >
                  ✕ Sair
                </button>
              )}

              {/* ================================================= */}
              {/* VÍDEO LOCAL */}
              {/* ================================================= */}

              <div
                className={`${videoTileClasses} ${
                  isFullscreenLayout
                    ? "border-b border-white/10"
                    : ""
                }`}
              >
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
                    <div className="flex h-full flex-col items-center justify-center bg-white/[0.02] text-center">
                      <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/5 text-3xl backdrop-blur-xl">
                        👤
                      </div>

                      <p className="mt-3 text-sm font-semibold">
                        Câmera desligada
                      </p>
                    </div>
                  )}

                <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/80 to-transparent" />

                <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs font-medium backdrop-blur-xl sm:text-sm">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />

                  <span className="max-w-[160px] truncate">
                    Você — {participantName}
                  </span>
                </div>

                <div className="absolute right-3 top-3 flex flex-col items-end gap-2">
                  {isScreenSharing && (
                    <span className="rounded-xl border border-purple-300/20 bg-purple-500/20 px-3 py-2 text-[10px] font-semibold backdrop-blur-xl sm:text-xs">
                      🖥 Tela
                    </span>
                  )}

                  {!isMicOn && (
                    <span className="rounded-xl border border-yellow-300/20 bg-yellow-500/20 px-3 py-2 text-[10px] font-semibold backdrop-blur-xl sm:text-xs">
                      🔇 Mudo
                    </span>
                  )}

                  {isTranscribing && (
                    <span className="rounded-xl border border-red-300/20 bg-red-500/20 px-3 py-2 text-[10px] font-semibold backdrop-blur-xl sm:text-xs">
                      🔴 IA
                    </span>
                  )}
                </div>
              </div>

              {/* ================================================= */}
              {/* VÍDEO REMOTO */}
              {/* ================================================= */}

              <div className={videoTileClasses}>
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
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/90 text-center backdrop-blur-xl">
                        <div className="mb-3 h-7 w-7 animate-spin rounded-full border-2 border-white/20 border-t-cyan-300" />

                        <p className="text-sm text-zinc-300">
                          Conectando...
                        </p>
                      </div>
                    )}

                    {isRemoteConnected &&
                      !remoteVideoAvailable && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/[0.02] text-center">
                          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/5 text-3xl backdrop-blur-xl">
                            👤
                          </div>

                          <p className="mt-3 text-sm font-semibold">
                            {remoteParticipantName}
                          </p>

                          <p className="mt-1 text-xs text-zinc-500">
                            câmera desligada
                          </p>
                        </div>
                      )}

                    <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/80 to-transparent" />

                    <div className="absolute bottom-3 left-3 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs font-medium backdrop-blur-xl sm:text-sm">
                      <span className="max-w-[180px] truncate">
                        {remoteParticipantName}
                      </span>
                    </div>

                    <div className="absolute right-3 top-3 flex flex-col items-end gap-2">
                      {remoteMediaStatus.isScreenSharing && (
                        <span className="rounded-xl border border-purple-300/20 bg-purple-500/20 px-3 py-2 text-[10px] font-semibold backdrop-blur-xl sm:text-xs">
                          🖥 Tela
                        </span>
                      )}

                      {!remoteMediaStatus.isMicOn && (
                        <span className="rounded-xl border border-yellow-300/20 bg-yellow-500/20 px-3 py-2 text-[10px] font-semibold backdrop-blur-xl sm:text-xs">
                          🔇 Mudo
                        </span>
                      )}

                      {isRemoteTranscribing && (
                        <span className="rounded-xl border border-red-300/20 bg-red-500/20 px-3 py-2 text-[10px] font-semibold backdrop-blur-xl sm:text-xs">
                          🔴 IA
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex h-full min-h-[210px] flex-col items-center justify-center bg-white/[0.02] px-5 text-center sm:min-h-0">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/5 text-3xl shadow-xl backdrop-blur-xl">
                      👤
                    </div>

                    <h2 className="mt-3 text-sm font-semibold sm:text-base">
                      Aguardando participante
                    </h2>

                    <p className="mt-1 max-w-xs text-xs text-zinc-500">
                      Compartilhe o link para iniciar a conversa.
                    </p>

                    <button
                      type="button"
                      onClick={copyInviteLink}
                      className="mt-4 rounded-xl border border-blue-400/20 bg-blue-500/10 px-4 py-2.5 text-xs font-semibold text-blue-200 backdrop-blur-xl transition hover:bg-blue-500/20"
                    >
                      🔗 Copiar convite
                    </button>
                  </div>
                )}
              </div>
            </section>

            {mediaError && (
              <div className="mt-4 rounded-2xl border border-red-400/15 bg-red-500/10 p-4 text-sm text-red-100 backdrop-blur-xl">
                {mediaError}
              </div>
            )}

            {/* ================================================= */}
            {/* CONTROLES GLASS */}
            {/* ================================================= */}

            <section
              className={`sticky bottom-3 z-30 mt-4 grid grid-cols-4 gap-2 rounded-[1.7rem] p-2.5 sm:static sm:flex sm:flex-wrap sm:justify-center sm:p-3 ${glassPanel}`}
            >
              <button
                type="button"
                onClick={toggleMicrophone}
                className={`${controlButton} ${
                  isMicOn
                    ? "border-emerald-400/15 bg-emerald-400/10 text-emerald-200"
                    : "border-red-400/15 bg-red-500/15 text-red-200"
                }`}
              >
                <span className="text-lg">
                  {isMicOn ? "🎤" : "🔇"}
                </span>

                <span className="hidden sm:inline">
                  {isMicOn
                    ? "Microfone"
                    : "Mudo"}
                </span>
              </button>

              <button
                type="button"
                onClick={toggleCamera}
                className={`${controlButton} ${
                  isCameraOn
                    ? "border-emerald-400/15 bg-emerald-400/10 text-emerald-200"
                    : "border-red-400/15 bg-red-500/15 text-red-200"
                }`}
              >
                <span className="text-lg">
                  {isCameraOn ? "📹" : "🚫"}
                </span>

                <span className="hidden sm:inline">
                  Câmera
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  void toggleScreenSharing();
                }}
                className={`${controlButton} ${
                  isScreenSharing
                    ? "border-purple-400/20 bg-purple-500/20 text-purple-100"
                    : "border-purple-400/15 bg-purple-500/10 text-purple-200"
                }`}
              >
                <span className="text-lg">
                  🖥
                </span>

                <span className="hidden sm:inline">
                  {isScreenSharing
                    ? "Parar tela"
                    : "Compartilhar"}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  void toggleFullscreen();
                }}
                className={`${controlButton} border-indigo-400/15 bg-indigo-500/10 text-indigo-200`}
              >
                <span className="text-xl">
                  ⛶
                </span>

                <span className="hidden sm:inline">
                  Tela cheia
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsChatOpen((current) => {
                    const next = !current;

                    if (next) {
                      setIsTranscriptOpen(
                        false
                      );
                    }

                    return next;
                  });
                }}
                className={`${controlButton} ${
                  isChatOpen
                    ? "border-blue-300/25 bg-blue-500/25 text-blue-100"
                    : "border-blue-400/15 bg-blue-500/10 text-blue-200"
                }`}
              >
                <span className="text-lg">
                  💬
                </span>

                <span className="hidden sm:inline">
                  Chat
                </span>
              </button>

              <button
                type="button"
                disabled={
                  transcriptionSupported ===
                  false
                }
                onClick={() => {
                  if (isTranscribing) {
                    stopTranscription();
                  } else {
                    startTranscription();
                  }
                }}
                className={`${controlButton} disabled:cursor-not-allowed disabled:opacity-40 ${
                  isTranscribing
                    ? "border-red-300/25 bg-red-500/25 text-red-100"
                    : "border-cyan-400/15 bg-cyan-500/10 text-cyan-200"
                }`}
              >
                <span className="text-lg">
                  {isTranscribing
                    ? "⏹"
                    : "📝"}
                </span>

                <span className="hidden sm:inline">
                  {isTranscribing
                    ? "Parar transcrição"
                    : "Transcrição"}
                </span>
              </button>

              {transcriptEntries.length >
                0 && (
                <button
                  type="button"
                  onClick={() => {
                    setIsTranscriptOpen(
                      (current) =>
                        !current
                    );

                    setIsChatOpen(false);
                  }}
                  className={`${controlButton} border-cyan-400/15 bg-cyan-500/10 text-cyan-200`}
                >
                  <span className="text-lg">
                    📄
                  </span>

                  <span className="hidden sm:inline">
                    Histórico
                  </span>

                  <span className="rounded-full bg-white/10 px-1.5 text-[10px]">
                    {transcriptEntries.length}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={leaveMeeting}
                className={`${controlButton} border-red-400/20 bg-red-500/20 text-red-100 hover:bg-red-500/30`}
              >
                <span className="text-lg">
                  📞
                </span>

                <span className="hidden sm:inline">
                  Encerrar
                </span>
              </button>
            </section>
          </div>

          {/* ================================================= */}
          {/* CHAT - BOTTOM SHEET NO CELULAR */}
          {/* ================================================= */}

          {isChatOpen && (
            <aside
              className={`fixed inset-x-3 bottom-24 z-40 flex max-h-[62dvh] min-h-[380px] flex-col overflow-hidden rounded-[1.8rem] xl:static xl:inset-auto xl:max-h-[720px] xl:min-h-[550px] ${glassPanel}`}
            >
              <div className="flex items-center justify-between border-b border-white/10 p-4">
                <div>
                  <h2 className="font-semibold">
                    💬 Chat
                  </h2>

                  <p className="mt-0.5 text-xs text-zinc-500">
                    {messages.length} mensagens
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setIsChatOpen(false)
                  }
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-300 backdrop-blur-xl"
                >
                  ✕
                </button>
              </div>

              <div
                ref={chatScrollRef}
                className="flex flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-4"
              >
                {messages.length === 0 ? (
                  <div className="flex flex-1 flex-col items-center justify-center text-center">
                    <div className="text-3xl">
                      💭
                    </div>

                    <p className="mt-2 text-sm text-zinc-400">
                      Nenhuma mensagem ainda
                    </p>
                  </div>
                ) : (
                  messages.map((message) => (
                    <div
                      key={message.id}
                      className={`max-w-[88%] rounded-2xl border px-4 py-3 backdrop-blur-xl ${
                        message.isOwn
                          ? "ml-auto border-blue-300/15 bg-blue-500/20"
                          : "mr-auto border-white/10 bg-white/5"
                      }`}
                    >
                      <div className="mb-1.5 flex justify-between gap-4 text-[11px]">
                        <strong className="truncate">
                          {message.isOwn
                            ? "Você"
                            : message.senderName}
                        </strong>

                        <span className="shrink-0 text-zinc-500">
                          {message.time}
                        </span>
                      </div>

                      <p className="break-words text-sm leading-relaxed text-zinc-100">
                        {message.text}
                      </p>
                    </div>
                  ))
                )}
              </div>

              <form
                onSubmit={sendMessage}
                className="border-t border-white/10 bg-black/10 p-3 backdrop-blur-xl"
              >
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(event) =>
                      setNewMessage(
                        event.target.value
                      )
                    }
                    placeholder="Mensagem..."
                    autoComplete="off"
                    className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none backdrop-blur-xl transition placeholder:text-zinc-600 focus:border-blue-400/40 focus:bg-white/10"
                  />

                  <button
                    type="submit"
                    disabled={!newMessage.trim()}
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-blue-300/20 bg-blue-500/20 text-lg shadow-lg transition active:scale-95 disabled:opacity-30"
                  >
                    ➤
                  </button>
                </div>
              </form>
            </aside>
          )}

          {/* ================================================= */}
          {/* TRANSCRIÇÃO - BOTTOM SHEET NO CELULAR */}
          {/* ================================================= */}

          {isTranscriptOpen && (
            <aside
              className={`fixed inset-x-3 bottom-24 z-40 flex max-h-[65dvh] min-h-[410px] flex-col overflow-hidden rounded-[1.8rem] xl:static xl:inset-auto xl:max-h-[720px] xl:min-h-[550px] ${glassPanel}`}
            >
              <div className="flex items-center justify-between border-b border-white/10 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-300/15 bg-cyan-500/10">
                    📝
                  </div>

                  <div>
                    <h2 className="font-semibold">
                      Transcrição
                    </h2>

                    <p className="text-xs text-zinc-500">
                      {transcriptEntries.length} falas
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setIsTranscriptOpen(
                      false
                    )
                  }
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-300"
                >
                  ✕
                </button>
              </div>

              <div
                ref={transcriptScrollRef}
                className="flex flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-3 sm:p-4"
              >
                {transcriptEntries.length ===
                  0 &&
                !interimTranscript ? (
                  <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full border border-cyan-300/10 bg-cyan-500/5 text-3xl backdrop-blur-xl">
                      🎙️
                    </div>

                    <p className="mt-3 text-sm font-medium text-zinc-300">
                      Aguardando sua fala
                    </p>

                    <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                      A transcrição aparecerá aqui sem mover a tela da reunião.
                    </p>
                  </div>
                ) : (
                  transcriptEntries.map(
                    (entry) => (
                      <div
                        key={entry.id}
                        className="rounded-2xl border border-white/10 bg-white/[0.04] p-3.5 shadow-lg backdrop-blur-xl"
                      >
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <strong
                            className={`truncate text-xs ${
                              entry.isOwn
                                ? "text-blue-300"
                                : "text-emerald-300"
                            }`}
                          >
                            {entry.isOwn
                              ? `Você — ${entry.senderName}`
                              : entry.senderName}
                          </strong>

                          <span className="shrink-0 text-[10px] text-zinc-600">
                            {entry.time}
                          </span>
                        </div>

                        <p className="text-sm leading-relaxed text-zinc-200">
                          {entry.text}
                        </p>
                      </div>
                    )
                  )
                )}

                {interimTranscript && (
                  <div className="rounded-2xl border border-dashed border-cyan-300/20 bg-cyan-500/5 p-3.5 backdrop-blur-xl">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-50" />

                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-cyan-400" />
                      </span>

                      <span className="text-[11px] font-semibold text-cyan-300">
                        Ouvindo...
                      </span>
                    </div>

                    <p className="text-sm italic leading-relaxed text-zinc-400">
                      {interimTranscript}
                    </p>
                  </div>
                )}
              </div>

              <div className="border-t border-white/10 bg-black/10 p-3 backdrop-blur-xl">
                <div
                  className={`rounded-xl px-3 py-2 text-center text-xs font-medium ${
                    isTranscribing
                      ? "border border-red-300/10 bg-red-500/10 text-red-200"
                      : "border border-white/5 bg-white/5 text-zinc-500"
                  }`}
                >
                  {isTranscribing
                    ? "● Transcrição ativa"
                    : "○ Transcrição parada"}
                </div>
              </div>
            </aside>
          )}
        </div>
      </div>
    </main>
  );
}