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
  createdAt?: number;
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

function formatMeetingDuration(
  totalSeconds: number
) {
  const hours =
    Math.floor(totalSeconds / 3600);

  const minutes =
    Math.floor(
      (totalSeconds % 3600) / 60
    );

  const seconds =
    totalSeconds % 60;

  return [
    hours,
    minutes,
    seconds,
  ]
    .map((value) =>
      String(value).padStart(2, "0")
    )
    .join(":");
}

function getPreferredAudioMimeType() {
  if (
    typeof MediaRecorder ===
    "undefined"
  ) {
    return "";
  }

  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
  ];

  for (const mimeType of candidates) {
    if (
      MediaRecorder.isTypeSupported(
        mimeType
      )
    ) {
      return mimeType;
    }
  }

  return "";
}

export default function MeetingRoom({
  roomId,
}: MeetingRoomProps) {
  const router = useRouter();

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
    useRef<RTCIceCandidateInit[]>([]);

  const localMediaStatusRef =
    useRef<MediaStatus>({
      ...DEFAULT_MEDIA_STATUS,
    });

  const remoteMediaStatusRef =
    useRef<MediaStatus>({
      ...DEFAULT_MEDIA_STATUS,
    });

  const participantNameRef =
    useRef("");

  const notificationTimeoutsRef =
    useRef<
      ReturnType<typeof setTimeout>[]
    >([]);

  const chatScrollRef =
    useRef<HTMLDivElement>(null);

  const transcriptScrollRef =
    useRef<HTMLDivElement>(null);

  const videoStageRef =
    useRef<HTMLElement>(null);

  // ==================================================
  // NOVA CAPTURA DE ÁUDIO
  // ==================================================

  const mediaRecorderRef =
    useRef<MediaRecorder | null>(null);

  const transcriptionActiveRef =
    useRef(false);

  const transcriptionChunkTimerRef =
    useRef<number | null>(null);

  const transcriptionRestartTimerRef =
    useRef<number | null>(null);

  const chunkStartedAtRef =
    useRef(0);

  const discardCurrentChunkRef =
    useRef(false);

  // ==================================================
  // ESTADOS
  // ==================================================

  const [
    participantName,
    setParticipantName,
  ] = useState("");

  const [
    remoteParticipantName,
    setRemoteParticipantName,
  ] = useState("Participante");

  const [
    meetingSeconds,
    setMeetingSeconds,
  ] = useState(0);

  const [
    isFullscreenLayout,
    setIsFullscreenLayout,
  ] = useState(false);

  const [
    isMicOn,
    setIsMicOn,
  ] = useState(true);

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

  const [
    participantCount,
    setParticipantCount,
  ] = useState(1);

  const [
    remoteParticipantId,
    setRemoteParticipantId,
  ] = useState<string | null>(
    null
  );

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

  const [
    notifications,
    setNotifications,
  ] = useState<RoomNotification[]>(
    []
  );

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

  const [
    isTranscribing,
    setIsTranscribing,
  ] = useState(false);

  const [
    isTranscriptionProcessing,
    setIsTranscriptionProcessing,
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
  ] = useState<TranscriptEntry[]>(
    []
  );

  const [
    transcriptionSupported,
    setTranscriptionSupported,
  ] = useState<boolean | null>(
    null
  );

  // ==================================================
  // NOTIFICAÇÕES
  // ==================================================

  const addNotification =
    useCallback(
      (
        text: string,
        tone:
          NotificationTone =
          "info"
      ) => {
        const id =
          `${Date.now()}-${Math.random()}`;

        setNotifications(
          (current) => [
            ...current,
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
              (current) =>
                current.filter(
                  (notification) =>
                    notification.id !==
                    id
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
      if (
        document.fullscreenElement
      ) {
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
  // SUPORTE À NOVA TRANSCRIÇÃO
  // ==================================================

  useEffect(() => {
    setTranscriptionSupported(
      typeof MediaRecorder !==
        "undefined"
    );
  }, []);

  // ==================================================
  // CRONÔMETRO
  // ==================================================

  useEffect(() => {
    const meetingStartedAt =
      Date.now();

    function updateTimer() {
      const elapsed =
        Date.now() -
        meetingStartedAt;

      setMeetingSeconds(
        Math.floor(
          elapsed / 1000
        )
      );
    }

    updateTimer();

    const interval =
      window.setInterval(
        updateTimer,
        1000
      );

    return () => {
      window.clearInterval(
        interval
      );
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
        const currentUser:
          CurrentUser =
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

  // ==================================================
  // STATUS DE MÍDIA
  // ==================================================

  function broadcastMediaStatus(
    changes:
      Partial<MediaStatus>
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

    peerConnectionRef.current =
      null;

    pendingIceCandidatesRef.current =
      [];

    setRemoteParticipantId(
      null
    );

    setRemoteParticipantName(
      "Participante"
    );

    setIsRemoteTranscribing(
      false
    );

    const defaultStatus = {
      ...DEFAULT_MEDIA_STATUS,
    };

    remoteMediaStatusRef.current =
      defaultStatus;

    setRemoteMediaStatus(
      defaultStatus
    );

    setIsRemoteConnected(
      false
    );

    if (
      remoteVideoRef.current
    ) {
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
      screenStream ??
      cameraStream;

    if (
      activeVideoTrack &&
      activeVideoStream
    ) {
      peerConnection.addTrack(
        activeVideoTrack,
        activeVideoStream
      );
    }

    peerConnection.ontrack =
      (event) => {
        const remoteStream =
          event.streams[0];

        if (
          remoteVideoRef.current &&
          remoteStream
        ) {
          remoteVideoRef.current.srcObject =
            remoteStream;
        }

        setIsRemoteConnected(
          true
        );
      };

    peerConnection.onicecandidate =
      (event) => {
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

        if (
          state === "connected"
        ) {
          setIsRemoteConnected(
            true
          );
        }

        if (
          state === "failed" ||
          state === "closed" ||
          state ===
            "disconnected"
        ) {
          setIsRemoteConnected(
            false
          );
        }
      };

    return peerConnection;
  }

  async function flushPendingIceCandidates(
    peerConnection:
      RTCPeerConnection
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
    newTrack:
      MediaStreamTrack
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

  // ==================================================
  // COMPARTILHAMENTO DE TELA
  // ==================================================

  async function startScreenSharing() {
    try {
      const screenStream =
        await navigator
          .mediaDevices
          .getDisplayMedia({
            video: true,
            audio: false,
          });

      const screenTrack =
        screenStream
          .getVideoTracks()[0];

      if (!screenTrack) {
        return;
      }

      screenStreamRef.current =
        screenStream;

      await replaceOutgoingVideoTrack(
        screenTrack
      );

      if (
        localVideoRef.current
      ) {
        localVideoRef.current.srcObject =
          screenStream;
      }

      setIsScreenSharing(
        true
      );

      broadcastMediaStatus({
        isScreenSharing:
          true,
      });

      screenTrack.onended =
        () => {
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
      cameraStream
        ?.getVideoTracks()[0];

    if (cameraTrack) {
      await replaceOutgoingVideoTrack(
        cameraTrack
      );
    }

    screenStreamRef.current
      ?.getTracks()
      .forEach((track) => {
        track.onended =
          null;

        track.stop();
      });

    screenStreamRef.current =
      null;

    if (
      localVideoRef.current
    ) {
      localVideoRef.current.srcObject =
        cameraStream ??
        null;
    }

    setIsScreenSharing(
      false
    );

    broadcastMediaStatus({
      isScreenSharing:
        false,
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
  // NOVA TRANSCRIÇÃO COM MEDIARECORDER
  // ==================================================

  async function sendAudioChunk(
    blob: Blob
  ) {
    const socket =
      socketRef.current;

    if (
      !socket ||
      !socket.connected ||
      blob.size < 1000
    ) {
      return;
    }

    try {
      const audioData =
        await blob.arrayBuffer();

      const now =
        new Date();

      socket.emit(
        "transcription-audio-chunk",
        {
          roomId,

          audioData,

          mimeType:
            blob.type ||
            "audio/webm",

          time:
            now.toLocaleTimeString(
              "pt-BR",
              {
                hour:
                  "2-digit",
                minute:
                  "2-digit",
              }
            ),

          capturedAt:
            Date.now(),
        }
      );
    } catch (error) {
      console.error(
        "Erro ao enviar áudio:",
        error
      );

      addNotification(
        "Não foi possível enviar um trecho de áudio.",
        "warning"
      );
    }
  }

  function startNextAudioChunk() {
    if (
      !transcriptionActiveRef.current
    ) {
      return;
    }

    const stream =
      mediaStreamRef.current;

    const audioTrack =
      stream?.getAudioTracks()[0];

    if (!audioTrack) {
      addNotification(
        "Nenhum microfone foi encontrado.",
        "warning"
      );

      stopTranscription();

      return;
    }

    if (!audioTrack.enabled) {
      transcriptionRestartTimerRef.current =
        window.setTimeout(
          startNextAudioChunk,
          500
        );

      return;
    }

    const audioStream =
      new MediaStream([
        audioTrack,
      ]);

    const mimeType =
      getPreferredAudioMimeType();

    try {
      const recorder =
        mimeType
          ? new MediaRecorder(
              audioStream,
              {
                mimeType,
                audioBitsPerSecond:
                  64000,
              }
            )
          : new MediaRecorder(
              audioStream
            );

      mediaRecorderRef.current =
        recorder;

      discardCurrentChunkRef.current =
        false;

      chunkStartedAtRef.current =
        Date.now();

      const chunks: Blob[] = [];

      recorder.ondataavailable =
        (event) => {
          if (
            event.data &&
            event.data.size > 0
          ) {
            chunks.push(
              event.data
            );
          }
        };

      recorder.onerror =
        (event) => {
          console.error(
            "Erro no MediaRecorder:",
            event
          );

          addNotification(
            "O navegador teve um problema ao capturar o áudio.",
            "warning"
          );
        };

      recorder.onstop =
        () => {
          if (
            transcriptionChunkTimerRef.current !==
            null
          ) {
            window.clearTimeout(
              transcriptionChunkTimerRef.current
            );

            transcriptionChunkTimerRef.current =
              null;
          }

          const elapsed =
            Date.now() -
            chunkStartedAtRef.current;

          const shouldSend =
            !discardCurrentChunkRef.current &&
            chunks.length > 0 &&
            elapsed >= 1200;

          if (shouldSend) {
            const blob =
              new Blob(
                chunks,
                {
                  type:
                    recorder.mimeType ||
                    mimeType ||
                    "audio/webm",
                }
              );

            void sendAudioChunk(
              blob
            );
          }

          if (
            transcriptionActiveRef.current
          ) {
            transcriptionRestartTimerRef.current =
              window.setTimeout(
                startNextAudioChunk,
                50
              );
          }
        };

      recorder.start();

      transcriptionChunkTimerRef.current =
        window.setTimeout(
          () => {
            if (
              recorder.state ===
              "recording"
            ) {
              recorder.stop();
            }
          },
          10000
        );
    } catch (error) {
      console.error(
        "Erro ao iniciar gravação:",
        error
      );

      addNotification(
        "Não foi possível iniciar a captura para transcrição.",
        "warning"
      );

      stopTranscription();
    }
  }

  function startTranscription() {
    if (
      transcriptionActiveRef.current
    ) {
      return;
    }

    if (
      typeof MediaRecorder ===
      "undefined"
    ) {
      setTranscriptionSupported(
        false
      );

      addNotification(
        "Seu navegador não suporta esta transcrição.",
        "warning"
      );

      return;
    }

    const audioTrack =
      mediaStreamRef.current
        ?.getAudioTracks()[0];

    if (!audioTrack) {
      addNotification(
        "Não foi possível acessar o microfone.",
        "warning"
      );

      return;
    }

    transcriptionActiveRef.current =
      true;

    setIsTranscribing(
      true
    );

    setIsTranscriptOpen(
      true
    );

    setIsChatOpen(
      false
    );

    socketRef.current?.emit(
      "transcription-status-change",
      {
        roomId,
        isTranscribing:
          true,
      }
    );

    startNextAudioChunk();

    addNotification(
      "Transcrição inteligente ativada.",
      "success"
    );
  }

  function stopTranscription(
    discardCurrentChunk = false
  ) {
    transcriptionActiveRef.current =
      false;

    setIsTranscribing(
      false
    );

    setIsTranscriptionProcessing(
      false
    );

    if (
      transcriptionChunkTimerRef.current !==
      null
    ) {
      window.clearTimeout(
        transcriptionChunkTimerRef.current
      );

      transcriptionChunkTimerRef.current =
        null;
    }

    if (
      transcriptionRestartTimerRef.current !==
      null
    ) {
      window.clearTimeout(
        transcriptionRestartTimerRef.current
      );

      transcriptionRestartTimerRef.current =
        null;
    }

    discardCurrentChunkRef.current =
      discardCurrentChunk;

    const recorder =
      mediaRecorderRef.current;

    mediaRecorderRef.current =
      null;

    if (
      recorder &&
      recorder.state ===
        "recording"
    ) {
      try {
        recorder.stop();
      } catch {
        // já parou
      }
    }

    socketRef.current?.emit(
      "transcription-status-change",
      {
        roomId,
        isTranscribing:
          false,
      }
    );
  }

  // ==================================================
  // INICIALIZAÇÃO
  // ==================================================

  useEffect(() => {
    let componentActive =
      true;

    const myParticipantName =
      getParticipantName();

    participantNameRef.current =
      myParticipantName;

    setParticipantName(
      myParticipantName
    );

    async function startMeeting() {
      try {
        setMediaError("");

        const stream =
          await navigator
            .mediaDevices
            .getUserMedia({
              video: true,

              audio: {
                echoCancellation:
                  true,

                noiseSuppression:
                  true,

                autoGainControl:
                  true,

                channelCount:
                  1,
              },
            });

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

        if (
          localVideoRef.current
        ) {
          localVideoRef.current.srcObject =
            stream;
        }

        const audioTrack =
          stream
            .getAudioTracks()[0];

        const videoTrack =
          stream
            .getVideoTracks()[0];

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

        if (audioTrack) {
          console.log(
            "🎙️ Configurações do microfone:",
            audioTrack.getSettings()
          );
        }
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

      const socket = io();

      socketRef.current =
        socket;

      socket.on(
        "connect",
        () => {
          socket.emit(
            "join-room",
            {
              roomId,

              participantName:
                myParticipantName,

              mediaStatus:
                localMediaStatusRef.current,
            }
          );
        }
      );

      socket.on(
        "participant-identity",
        ({
          participantName:
            confirmedName,
        }: {
          participantId:
            string;

          participantName:
            string;
        }) => {
          participantNameRef.current =
            confirmedName;

          setParticipantName(
            confirmedName
          );
        }
      );

      socket.on(
        "room-participants-state",
        ({
          count,
          participants,
        }: {
          count: number;

          participants:
            RoomParticipant[];
        }) => {
          setParticipantCount(
            count
          );

          const ownParticipant =
            participants.find(
              (participant) =>
                participant.participantId ===
                socket.id
            );

          if (ownParticipant) {
            participantNameRef.current =
              ownParticipant.participantName;

            setParticipantName(
              ownParticipant.participantName
            );
          }

          const remoteParticipant =
            participants.find(
              (participant) =>
                participant.participantId !==
                socket.id
            );

          if (remoteParticipant) {
            setRemoteParticipantId(
              remoteParticipant.participantId
            );

            setRemoteParticipantName(
              remoteParticipant.participantName
            );

            remoteMediaStatusRef.current =
              remoteParticipant.mediaStatus;

            setRemoteMediaStatus(
              remoteParticipant.mediaStatus
            );

            setIsRemoteTranscribing(
              remoteParticipant.isTranscribing
            );
          }
        }
      );

      socket.on(
        "transcript-history",
        ({
          entries,
        }: {
          entries:
            ServerTranscriptEntry[];
        }) => {
          setTranscriptEntries(
            entries.map(
              (entry) => ({
                ...entry,

                isOwn:
                  entry.senderId ===
                    socket.id ||
                  entry.senderName ===
                    participantNameRef.current,
              })
            )
          );
        }
      );

      socket.on(
        "transcript-entry",
        (
          entry:
            ServerTranscriptEntry
        ) => {
          setTranscriptEntries(
            (current) => {
              if (
                current.some(
                  (item) =>
                    item.id ===
                    entry.id
                )
              ) {
                return current;
              }

              return [
                ...current,

                {
                  ...entry,

                  isOwn:
                    entry.senderId ===
                      socket.id ||
                    entry.senderName ===
                      participantNameRef.current,
                },
              ].sort(
                (a, b) =>
                  (a.createdAt ??
                    0) -
                  (b.createdAt ??
                    0)
              );
            }
          );
        }
      );

      socket.on(
        "transcription-processing",
        ({
          active,
        }: {
          active:
            boolean;
        }) => {
          setIsTranscriptionProcessing(
            active
          );
        }
      );

      socket.on(
        "transcription-error",
        ({
          message,
        }: {
          message:
            string;
        }) => {
          console.error(
            "Transcrição:",
            message
          );

          addNotification(
            message.includes(
              "GROQ_API_KEY"
            )
              ? "A chave da Groq ainda não foi configurada no servidor."
              : "A IA não conseguiu transcrever um trecho. Vamos continuar tentando.",
            "warning"
          );

          if (
            message.includes(
              "GROQ_API_KEY"
            )
          ) {
            stopTranscription(
              true
            );
          }
        }
      );

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
          participantId:
            string;

          participantName:
            string;

          isTranscribing:
            boolean;
        }) => {
          setIsRemoteTranscribing(
            remoteIsTranscribing
          );

          addNotification(
            remoteIsTranscribing
              ? `${changedName} ativou a transcrição.`
              : `${changedName} parou a transcrição.`,
            "info"
          );
        }
      );

      socket.on(
        "participant-media-status",
        ({
          participantName:
            changedName,

          mediaStatus,
        }: {
          participantId:
            string;

          participantName:
            string;

          mediaStatus:
            MediaStatus;
        }) => {
          const previousStatus =
            remoteMediaStatusRef.current;

          if (
            previousStatus.isMicOn &&
            !mediaStatus.isMicOn
          ) {
            addNotification(
              `${changedName} desligou o microfone.`,
              "warning"
            );
          }

          if (
            !previousStatus.isMicOn &&
            mediaStatus.isMicOn
          ) {
            addNotification(
              `${changedName} ligou o microfone.`,
              "success"
            );
          }

          if (
            previousStatus.isCameraOn &&
            !mediaStatus.isCameraOn
          ) {
            addNotification(
              `${changedName} desligou a câmera.`,
              "warning"
            );
          }

          if (
            !previousStatus.isCameraOn &&
            mediaStatus.isCameraOn
          ) {
            addNotification(
              `${changedName} ligou a câmera.`,
              "success"
            );
          }

          if (
            !previousStatus.isScreenSharing &&
            mediaStatus.isScreenSharing
          ) {
            addNotification(
              `${changedName} começou a compartilhar a tela.`,
              "info"
            );
          }

          if (
            previousStatus.isScreenSharing &&
            !mediaStatus.isScreenSharing
          ) {
            addNotification(
              `${changedName} parou de compartilhar a tela.`,
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

      socket.on(
        "webrtc-offer",
        async ({
          senderId,
          senderName,
          offer,
        }: {
          senderId:
            string;

          senderName:
            string;

          offer:
            RTCSessionDescriptionInit;
        }) => {
          setRemoteParticipantId(
            senderId
          );

          setRemoteParticipantName(
            senderName
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

      socket.on(
        "webrtc-answer",
        async ({
          senderName,
          answer,
        }: {
          senderId:
            string;

          senderName:
            string;

          answer:
            RTCSessionDescriptionInit;
        }) => {
          setRemoteParticipantName(
            senderName
          );

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
          senderId:
            string;

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

      socket.on(
        "room-participants",
        ({
          count,
        }: {
          count:
            number;
        }) => {
          setParticipantCount(
            count
          );
        }
      );

      socket.on(
        "participant-left",
        ({
          participantName:
            leftName,
        }: {
          participantId:
            string;

          participantName:
            string;
        }) => {
          addNotification(
            `${leftName} saiu da reunião.`,
            "danger"
          );

          clearRemoteParticipant();
        }
      );

      socket.on(
        "room-full",
        () => {
          setRoomFull(
            true
          );

          addNotification(
            "Esta sala já possui 2 participantes.",
            "warning"
          );
        }
      );

      socket.on(
        "chat-message",
        ({
          id,
          text,
          time,
          senderName,
        }: {
          id:
            string;

          senderId:
            string;

          text:
            string;

          time:
            string;

          senderName:
            string;
        }) => {
          setMessages(
            (current) => [
              ...current,

              {
                id,
                text,
                time,

                senderName:
                  senderName ||
                  "Participante",

                isOwn:
                  false,
              },
            ]
          );
        }
      );
    }

    startMeeting();

    return () => {
      componentActive =
        false;

      transcriptionActiveRef.current =
        false;

      discardCurrentChunkRef.current =
        true;

      if (
        transcriptionChunkTimerRef.current !==
        null
      ) {
        window.clearTimeout(
          transcriptionChunkTimerRef.current
        );
      }

      if (
        transcriptionRestartTimerRef.current !==
        null
      ) {
        window.clearTimeout(
          transcriptionRestartTimerRef.current
        );
      }

      const recorder =
        mediaRecorderRef.current;

      if (
        recorder &&
        recorder.state ===
          "recording"
      ) {
        try {
          recorder.stop();
        } catch {
          // já encerrado
        }
      }

      notificationTimeoutsRef.current.forEach(
        (timeout) => {
          clearTimeout(timeout);
        }
      );

      mediaStreamRef.current
        ?.getTracks()
        .forEach((track) => {
          track.stop();
        });

      screenStreamRef.current
        ?.getTracks()
        .forEach((track) => {
          track.onended =
            null;

          track.stop();
        });

      peerConnectionRef.current?.close();

      socketRef.current?.disconnect();

      mediaStreamRef.current =
        null;

      screenStreamRef.current =
        null;

      peerConnectionRef.current =
        null;

      socketRef.current =
        null;
    };
  }, [
    roomId,
    addNotification,
  ]);

  // ==================================================
  // SCROLL INTERNO
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
          top:
            container.scrollHeight,

          behavior:
            "smooth",
        });
      });

    return () =>
      cancelAnimationFrame(
        frame
      );
  }, [
    messages,
    isChatOpen,
  ]);

  useEffect(() => {
    if (
      !isTranscriptOpen
    ) {
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
          top:
            container.scrollHeight,

          behavior:
            "smooth",
        });
      });

    return () =>
      cancelAnimationFrame(
        frame
      );
  }, [
    transcriptEntries,
    isTranscriptOpen,
  ]);

  // ==================================================
  // CONTROLES
  // ==================================================

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

    setIsMicOn(
      nextState
    );

    broadcastMediaStatus({
      isMicOn:
        nextState,
    });
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

    setIsCameraOn(
      nextState
    );

    broadcastMediaStatus({
      isCameraOn:
        nextState,
    });
  }

  function sendMessage(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const text =
      newMessage.trim();

    const socket =
      socketRef.current;

    if (
      !text ||
      !socket
    ) {
      return;
    }

    const time =
      new Date()
        .toLocaleTimeString(
          "pt-BR",
          {
            hour:
              "2-digit",

            minute:
              "2-digit",
          }
        );

    const messageId =
      `${Date.now()}-${Math.random()}`;

    setMessages(
      (current) => [
        ...current,

        {
          id:
            messageId,

          text,

          time,

          senderName:
            participantNameRef.current ||
            "Você",

          isOwn:
            true,
        },
      ]
    );

    socket.emit(
      "send-chat-message",
      {
        roomId,

        message: {
          id:
            messageId,

          text,

          time,
        },
      }
    );

    setNewMessage("");
  }

  async function copyRoomCode() {
    try {
      await navigator.clipboard.writeText(
        roomId
      );

      addNotification(
        "Código da sala copiado.",
        "success"
      );
    } catch {
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
    } catch {
      addNotification(
        "Não foi possível copiar o convite.",
        "warning"
      );
    }
  }

  function leaveMeeting() {
    stopTranscription(
      true
    );

    mediaStreamRef.current
      ?.getTracks()
      .forEach((track) => {
        track.stop();
      });

    screenStreamRef.current
      ?.getTracks()
      .forEach((track) => {
        track.onended =
          null;

        track.stop();
      });

    peerConnectionRef.current?.close();
    socketRef.current?.disconnect();

    router.push(
      "/dashboard"
    );
  }

  // ==================================================
  // VISUAL
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
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-80 w-80 rounded-full bg-blue-500/15 blur-3xl" />

        <div className="absolute -right-32 top-1/3 h-96 w-96 rounded-full bg-purple-500/10 blur-3xl" />

        <div className="absolute bottom-[-150px] left-1/3 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
      </div>

      <div className="fixed left-3 right-3 top-3 z-[100] flex flex-col gap-2 sm:left-auto sm:right-4 sm:w-[380px]">
        {notifications.map(
          (notification) => (
            <div
              key={
                notification.id
              }
              className={`rounded-2xl border px-4 py-3 text-sm shadow-2xl backdrop-blur-2xl ${NOTIFICATION_CLASSES[notification.tone]}`}
            >
              {
                notification.text
              }
            </div>
          )
        )}
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-3 pb-28 pt-3 sm:px-5 sm:pb-8 sm:pt-5">
        <header
          className={`mb-4 rounded-[1.7rem] p-4 sm:p-5 ${glassPanel}`}
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 text-xl">
                  ✦
                </div>

                <div>
                  <h1 className="text-xl font-bold sm:text-2xl">
                    ConnectAI
                  </h1>

                  <p className="text-xs text-zinc-400 sm:text-sm">
                    Reunião inteligente
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                  👤{" "}
                  <strong className="text-blue-300">
                    {participantName ||
                      "..."}
                  </strong>
                </span>

                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                  👥{" "}
                  {
                    participantCount
                  }
                  /2
                </span>

                <span className="rounded-full border border-emerald-400/10 bg-emerald-400/5 px-3 py-1.5 font-mono text-emerald-300">
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
                onClick={
                  copyRoomCode
                }
                className="min-h-11 rounded-xl border border-white/10 bg-white/5 px-4 text-sm"
              >
                📋 Código
              </button>

              <button
                type="button"
                onClick={
                  copyInviteLink
                }
                className="min-h-11 rounded-xl border border-blue-400/20 bg-blue-500/15 px-4 text-sm"
              >
                🔗 Convidar
              </button>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-xl border border-white/5 bg-black/20 px-3 py-2">
            <p className="truncate text-xs text-zinc-500">
              Sala: {roomId}
            </p>
          </div>
        </header>

        {(isTranscribing ||
          isRemoteTranscribing) && (
          <div className="mb-4 flex items-center gap-3 rounded-2xl border border-red-400/15 bg-red-500/10 px-4 py-3 text-sm text-red-100 backdrop-blur-xl">
            <span className="relative flex h-3 w-3">
              <span className="absolute h-full w-full animate-ping rounded-full bg-red-400 opacity-50" />
              <span className="relative h-3 w-3 rounded-full bg-red-500" />
            </span>

            Transcrição inteligente ativa.
          </div>
        )}

        {roomFull && (
          <div className="mb-4 rounded-2xl border border-yellow-400/15 bg-yellow-500/10 p-4 text-yellow-100">
            Esta sala já possui 2 participantes.
          </div>
        )}

        <div
          className={`grid gap-4 ${
            sidePanelOpen
              ? "xl:grid-cols-[1fr_390px]"
              : ""
          }`}
        >
          <div className="min-w-0">
            <section
              ref={
                videoStageRef
              }
              className={
                isFullscreenLayout
                  ? "relative grid h-screen w-screen grid-cols-1 grid-rows-2 gap-0 overflow-hidden bg-black"
                  : "relative grid grid-cols-1 gap-3 md:grid-cols-2"
              }
            >
              {isFullscreenLayout && (
                <button
                  type="button"
                  onClick={() =>
                    void toggleFullscreen()
                  }
                  className="absolute right-3 top-3 z-50 rounded-xl border border-white/10 bg-black/50 px-4 py-3 backdrop-blur-xl"
                >
                  ✕ Sair
                </button>
              )}

              <div
                className={`${videoTileClasses} ${
                  isFullscreenLayout
                    ? "border-b border-white/10"
                    : ""
                }`}
              >
                <video
                  ref={
                    localVideoRef
                  }
                  autoPlay
                  playsInline
                  muted
                  className={`h-full w-full object-cover ${
                    isCameraOn ||
                    isScreenSharing
                      ? ""
                      : "hidden"
                  }`}
                />

                {!isCameraOn &&
                  !isScreenSharing && (
                    <div className="flex h-full flex-col items-center justify-center">
                      <div className="text-5xl">
                        👤
                      </div>
                      <p className="mt-3">
                        Câmera desligada
                      </p>
                    </div>
                  )}

                <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/80 to-transparent" />

                <div className="absolute bottom-3 left-3 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs backdrop-blur-xl">
                  Você —{" "}
                  {
                    participantName
                  }
                </div>

                <div className="absolute right-3 top-3 flex flex-col gap-2">
                  {!isMicOn && (
                    <span className="rounded-xl bg-yellow-500/30 px-3 py-2 text-xs backdrop-blur-xl">
                      🔇 Mudo
                    </span>
                  )}

                  {isTranscribing && (
                    <span className="rounded-xl bg-red-500/30 px-3 py-2 text-xs backdrop-blur-xl">
                      🔴 IA
                    </span>
                  )}
                </div>
              </div>

              <div
                className={
                  videoTileClasses
                }
              >
                {remoteParticipantId ? (
                  <>
                    <video
                      ref={
                        remoteVideoRef
                      }
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
                        Conectando...
                      </div>
                    )}

                    {isRemoteConnected &&
                      !remoteVideoAvailable && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <div className="text-5xl">
                            👤
                          </div>

                          <p className="mt-3">
                            {
                              remoteParticipantName
                            }
                          </p>
                        </div>
                      )}

                    <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/80 to-transparent" />

                    <div className="absolute bottom-3 left-3 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs backdrop-blur-xl">
                      {
                        remoteParticipantName
                      }
                    </div>

                    <div className="absolute right-3 top-3 flex flex-col gap-2">
                      {!remoteMediaStatus.isMicOn && (
                        <span className="rounded-xl bg-yellow-500/30 px-3 py-2 text-xs">
                          🔇 Mudo
                        </span>
                      )}

                      {isRemoteTranscribing && (
                        <span className="rounded-xl bg-red-500/30 px-3 py-2 text-xs">
                          🔴 IA
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex h-full min-h-[210px] flex-col items-center justify-center text-center">
                    <div className="text-5xl">
                      👤
                    </div>

                    <p className="mt-3 font-semibold">
                      Aguardando participante
                    </p>

                    <button
                      type="button"
                      onClick={
                        copyInviteLink
                      }
                      className="mt-4 rounded-xl border border-blue-400/20 bg-blue-500/10 px-4 py-2"
                    >
                      🔗 Copiar convite
                    </button>
                  </div>
                )}
              </div>
            </section>

            {mediaError && (
              <div className="mt-4 rounded-2xl border border-red-400/15 bg-red-500/10 p-4 text-red-100">
                {mediaError}
              </div>
            )}

            <section
              className={`sticky bottom-3 z-30 mt-4 grid grid-cols-4 gap-2 rounded-[1.7rem] p-2.5 sm:static sm:flex sm:flex-wrap sm:justify-center ${glassPanel}`}
            >
              <button
                type="button"
                onClick={
                  toggleMicrophone
                }
                className={`${controlButton} ${
                  isMicOn
                    ? "border-emerald-400/15 bg-emerald-400/10"
                    : "border-red-400/20 bg-red-500/20"
                }`}
              >
                🎤
                <span className="hidden sm:inline">
                  Microfone
                </span>
              </button>

              <button
                type="button"
                onClick={
                  toggleCamera
                }
                className={`${controlButton} border-emerald-400/15 bg-emerald-400/10`}
              >
                📹
                <span className="hidden sm:inline">
                  Câmera
                </span>
              </button>

              <button
                type="button"
                onClick={() =>
                  void toggleScreenSharing()
                }
                className={`${controlButton} border-purple-400/15 bg-purple-500/10`}
              >
                🖥
                <span className="hidden sm:inline">
                  Compartilhar
                </span>
              </button>

              <button
                type="button"
                onClick={() =>
                  void toggleFullscreen()
                }
                className={`${controlButton} border-indigo-400/15 bg-indigo-500/10`}
              >
                ⛶
                <span className="hidden sm:inline">
                  Tela cheia
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsChatOpen(
                    (current) =>
                      !current
                  );

                  setIsTranscriptOpen(
                    false
                  );
                }}
                className={`${controlButton} border-blue-400/15 bg-blue-500/10`}
              >
                💬
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
                  if (
                    isTranscribing
                  ) {
                    stopTranscription();
                  } else {
                    startTranscription();
                  }
                }}
                className={`${controlButton} ${
                  isTranscribing
                    ? "border-red-400/20 bg-red-500/25"
                    : "border-cyan-400/15 bg-cyan-500/10"
                }`}
              >
                {isTranscribing
                  ? "⏹"
                  : "📝"}

                <span className="hidden sm:inline">
                  {isTranscribing
                    ? "Parar transcrição"
                    : "Transcrição IA"}
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

                    setIsChatOpen(
                      false
                    );
                  }}
                  className={`${controlButton} border-cyan-400/15 bg-cyan-500/10`}
                >
                  📄
                  <span className="hidden sm:inline">
                    Histórico
                  </span>
                  <span className="rounded-full bg-white/10 px-2 text-xs">
                    {
                      transcriptEntries.length
                    }
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={
                  leaveMeeting
                }
                className={`${controlButton} border-red-400/20 bg-red-500/20`}
              >
                📞
                <span className="hidden sm:inline">
                  Encerrar
                </span>
              </button>
            </section>
          </div>

          {isChatOpen && (
            <aside
              className={`fixed inset-x-3 bottom-24 z-40 flex max-h-[62dvh] min-h-[380px] flex-col overflow-hidden rounded-[1.8rem] xl:static xl:max-h-[720px] ${glassPanel}`}
            >
              <div className="flex items-center justify-between border-b border-white/10 p-4">
                <h2 className="font-semibold">
                  💬 Chat
                </h2>

                <button
                  type="button"
                  onClick={() =>
                    setIsChatOpen(
                      false
                    )
                  }
                  className="h-10 w-10 rounded-xl bg-white/5"
                >
                  ✕
                </button>
              </div>

              <div
                ref={
                  chatScrollRef
                }
                className="flex flex-1 flex-col gap-3 overflow-y-auto p-4"
              >
                {messages.map(
                  (message) => (
                    <div
                      key={
                        message.id
                      }
                      className={`max-w-[88%] rounded-2xl border px-4 py-3 ${
                        message.isOwn
                          ? "ml-auto border-blue-300/15 bg-blue-500/20"
                          : "mr-auto border-white/10 bg-white/5"
                      }`}
                    >
                      <div className="mb-1 flex justify-between gap-3 text-xs">
                        <strong>
                          {message.isOwn
                            ? `Você — ${participantName}`
                            : message.senderName}
                        </strong>

                        <span className="text-zinc-500">
                          {
                            message.time
                          }
                        </span>
                      </div>

                      <p>
                        {
                          message.text
                        }
                      </p>
                    </div>
                  )
                )}
              </div>

              <form
                onSubmit={
                  sendMessage
                }
                className="border-t border-white/10 p-3"
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
                    placeholder="Mensagem..."
                    className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none"
                  />

                  <button
                    type="submit"
                    className="h-12 w-12 rounded-2xl bg-blue-500/20"
                  >
                    ➤
                  </button>
                </div>
              </form>
            </aside>
          )}

          {isTranscriptOpen && (
            <aside
              className={`fixed inset-x-3 bottom-24 z-40 flex max-h-[65dvh] min-h-[410px] flex-col overflow-hidden rounded-[1.8rem] xl:static xl:max-h-[720px] ${glassPanel}`}
            >
              <div className="flex items-center justify-between border-b border-white/10 p-4">
                <div>
                  <h2 className="font-semibold">
                    📝 Transcrição IA
                  </h2>

                  <p className="text-xs text-zinc-500">
                    {
                      transcriptEntries.length
                    }{" "}
                    falas registradas
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setIsTranscriptOpen(
                      false
                    )
                  }
                  className="h-10 w-10 rounded-xl bg-white/5"
                >
                  ✕
                </button>
              </div>

              <div className="border-b border-white/10 bg-black/10 px-4 py-3 text-xs text-zinc-400">
                {isTranscribing
                  ? isTranscriptionProcessing
                    ? "🧠 A IA está processando o último trecho..."
                    : "🎙️ Captando seu microfone..."
                  : "Transcrição parada"}
              </div>

              <div
                ref={
                  transcriptScrollRef
                }
                className="flex flex-1 flex-col gap-3 overflow-y-auto p-3 sm:p-4"
              >
                {transcriptEntries.length ===
                0 ? (
                  <div className="flex flex-1 flex-col items-center justify-center text-center">
                    <div className="text-4xl">
                      🎙️
                    </div>

                    <p className="mt-3 text-sm">
                      Aguardando fala
                    </p>

                    <p className="mt-2 max-w-xs text-xs text-zinc-500">
                      Os trechos aparecem depois que a IA termina de processá-los.
                    </p>
                  </div>
                ) : (
                  transcriptEntries.map(
                    (entry) => (
                      <div
                        key={
                          entry.id
                        }
                        className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
                      >
                        <div className="mb-2 flex justify-between gap-3">
                          <strong
                            className={`text-xs ${
                              entry.isOwn
                                ? "text-blue-300"
                                : "text-emerald-300"
                            }`}
                          >
                            {entry.isOwn
                              ? `Você — ${entry.senderName}`
                              : entry.senderName}
                          </strong>

                          <span className="text-xs text-zinc-600">
                            {
                              entry.time
                            }
                          </span>
                        </div>

                        <p className="text-sm leading-relaxed text-zinc-200">
                          {
                            entry.text
                          }
                        </p>
                      </div>
                    )
                  )
                )}
              </div>

              <div className="border-t border-white/10 p-3">
                <div
                  className={`rounded-xl px-3 py-2 text-center text-xs ${
                    isTranscribing
                      ? "bg-red-500/10 text-red-200"
                      : "bg-white/5 text-zinc-500"
                  }`}
                >
                  {isTranscribing
                    ? "● Transcrição ativa — áudio isolado por participante"
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