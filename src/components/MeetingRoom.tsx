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

type AssemblyMessage = {
  type: string;
  id?: string;
  turn_order?: number;
  transcript?: string;
  end_of_turn?: boolean;
};

type AssemblyTokenResponse = {
  token?: string;
  error?: string;
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
): string {
  const hours =
    Math.floor(totalSeconds / 3600);

  const minutes =
    Math.floor(
      (totalSeconds % 3600) / 60
    );

  const seconds =
    totalSeconds % 60;

  const formattedHours =
    hours
      .toString()
      .padStart(2, "0");

  const formattedMinutes =
    minutes
      .toString()
      .padStart(2, "0");

  const formattedSeconds =
    seconds
      .toString()
      .padStart(2, "0");

  return `${formattedHours}:${formattedMinutes}:${formattedSeconds}`;
}

export default function MeetingRoom({
  roomId,
}: MeetingRoomProps) {
  const router =
    useRouter();

  const localVideoRef =
    useRef<HTMLVideoElement>(
      null
    );

  const remoteVideoRef =
    useRef<HTMLVideoElement>(
      null
    );

  const mediaStreamRef =
    useRef<MediaStream | null>(
      null
    );

  const screenStreamRef =
    useRef<MediaStream | null>(
      null
    );

  const socketRef =
    useRef<Socket | null>(
      null
    );

  const peerConnectionRef =
    useRef<RTCPeerConnection | null>(
      null
    );

  const pendingIceCandidatesRef =
    useRef<
      RTCIceCandidateInit[]
    >([]);

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

  const assemblyWebSocketRef =
    useRef<WebSocket | null>(
      null
    );

  const assemblyAudioContextRef =
    useRef<AudioContext | null>(
      null
    );

  const assemblySourceNodeRef =
    useRef<MediaStreamAudioSourceNode | null>(
      null
    );

  const assemblyWorkletNodeRef =
    useRef<AudioWorkletNode | null>(
      null
    );

  const assemblySilentGainRef =
    useRef<GainNode | null>(
      null
    );

  const assemblySessionIdRef =
    useRef("");

  const assemblyShouldRunRef =
    useRef(false);

  const assemblyStoppingRef =
    useRef(false);

  const assemblyCloseTimerRef =
    useRef<number | null>(
      null
    );

  const notificationTimeoutsRef =
    useRef<
      ReturnType<
        typeof setTimeout
      >[]
    >([]);

  const chatScrollRef =
    useRef<HTMLDivElement>(
      null
    );

  const transcriptScrollRef =
    useRef<HTMLDivElement>(
      null
    );

  const videoStageRef =
    useRef<HTMLElement>(
      null
    );

  const [
    participantName,
    setParticipantName,
  ] = useState("");

  const [
    remoteParticipantName,
    setRemoteParticipantName,
  ] = useState(
    "Participante"
  );

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
  ] = useState<
    string | null
  >(null);

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
  ] = useState<
    RoomNotification[]
  >([]);

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
  ] = useState<
    ChatMessage[]
  >([]);

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
  ] = useState<
    TranscriptEntry[]
  >([]);

  const [
    interimTranscript,
    setInterimTranscript,
  ] = useState("");

  const [
    isAssemblyConnecting,
    setIsAssemblyConnecting,
  ] = useState(false);

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
          setTimeout(
            () => {
              setNotifications(
                (current) =>
                  current.filter(
                    (
                      notification
                    ) =>
                      notification.id !==
                      id
                  )
              );
            },
            4500
          );

        notificationTimeoutsRef.current.push(
          timeout
        );
      },
      []
    );

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
      requestAnimationFrame(
        () => {
          container.scrollTo({
            top:
              container.scrollHeight,

            behavior:
              "smooth",
          });
        }
      );

    return () => {
      cancelAnimationFrame(
        frame
      );
    };
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
      requestAnimationFrame(
        () => {
          container.scrollTo({
            top:
              container.scrollHeight,

            behavior:
              "smooth",
          });
        }
      );

    return () => {
      cancelAnimationFrame(
        frame
      );
    };
  }, [
    transcriptEntries,
    interimTranscript,
    isTranscriptOpen,
  ]);

  async function toggleFullscreen() {
    try {
      if (
        document.fullscreenElement
      ) {
        await document.exitFullscreen();
        return;
      }

      if (
        !videoStageRef.current
      ) {
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

  function getParticipantName(): string {
    try {
      const storedCurrentUser =
        sessionStorage.getItem(
          CURRENT_USER_SESSION_KEY
        );

      if (
        storedCurrentUser
      ) {
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

    if (
      fallbackName
    ) {
      return fallbackName;
    }

    const randomNumber =
      Math.floor(
        1000 +
          Math.random() *
            9000
      );

    const generatedName =
      `Participante-${randomNumber}`;

    sessionStorage.setItem(
      FALLBACK_PARTICIPANT_KEY,
      generatedName
    );

    return generatedName;
  }

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
        status:
          nextStatus,
      }
    );
  }

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
          state ===
          "connected"
        ) {
          setIsRemoteConnected(
            true
          );
        }

        if (
          state ===
            "failed" ||
          state ===
            "closed" ||
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
      .forEach(
        (track) => {
          track.onended =
            null;

          track.stop();
        }
      );

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
    if (
      isScreenSharing
    ) {
      await stopScreenSharing();
      return;
    }

    await startScreenSharing();
  }

  function cleanupAssemblyAudio() {
    assemblyWorkletNodeRef.current?.disconnect();
    assemblySourceNodeRef.current?.disconnect();
    assemblySilentGainRef.current?.disconnect();

    assemblyWorkletNodeRef.current =
      null;

    assemblySourceNodeRef.current =
      null;

    assemblySilentGainRef.current =
      null;

    const audioContext =
      assemblyAudioContextRef.current;

    assemblyAudioContextRef.current =
      null;

    if (
      audioContext &&
      audioContext.state !==
        "closed"
    ) {
      void audioContext.close();
    }
  }

  function forceCloseAssemblySocket() {
    if (
      assemblyCloseTimerRef.current !==
      null
    ) {
      window.clearTimeout(
        assemblyCloseTimerRef.current
      );

      assemblyCloseTimerRef.current =
        null;
    }

    const ws =
      assemblyWebSocketRef.current;

    assemblyWebSocketRef.current =
      null;

    if (
      ws &&
      ws.readyState !==
        WebSocket.CLOSED
    ) {
      try {
        ws.close();
      } catch {
        // Socket já encerrado.
      }
    }

    cleanupAssemblyAudio();
  }

  async function startTranscription() {
    if (
      assemblyShouldRunRef.current ||
      isAssemblyConnecting
    ) {
      return;
    }

    const mediaStream =
      mediaStreamRef.current;

    const audioTrack =
      mediaStream?.getAudioTracks()[0];

    if (
      !mediaStream ||
      !audioTrack
    ) {
      addNotification(
        "Não foi possível acessar o microfone.",
        "warning"
      );

      return;
    }

    if (
      typeof AudioWorkletNode ===
      "undefined"
    ) {
      addNotification(
        "Seu navegador não suporta a transcrição em tempo real.",
        "warning"
      );

      return;
    }

    assemblyShouldRunRef.current =
      true;

    assemblyStoppingRef.current =
      false;

    setIsAssemblyConnecting(
      true
    );

    setIsTranscriptOpen(
      true
    );

    setIsChatOpen(
      false
    );

    setInterimTranscript(
      ""
    );

    try {
      const tokenResponse =
        await fetch(
          "/api/assemblyai-token",
          {
            method:
              "GET",

            cache:
              "no-store",
          }
        );

      const tokenData =
        (await tokenResponse.json()) as AssemblyTokenResponse;

      if (
        !tokenResponse.ok
      ) {
        throw new Error(
          tokenData.error ||
            "Não foi possível obter o token da AssemblyAI."
        );
      }

      const token =
        tokenData.token;

      if (
        typeof token !==
          "string" ||
        !token
      ) {
        throw new Error(
          "O servidor não retornou um token válido."
        );
      }

      if (
        !assemblyShouldRunRef.current
      ) {
        return;
      }

      const params =
        new URLSearchParams({
          sample_rate:
            "16000",

          speech_model:
            "u3-rt-pro",

          mode:
            "balanced",

          format_turns:
            "true",

          token,
        });

      const ws =
        new WebSocket(
          `wss://streaming.assemblyai.com/v3/ws?${params.toString()}`
        );

      ws.binaryType =
        "arraybuffer";

      assemblyWebSocketRef.current =
        ws;

      ws.onopen =
        async () => {
          if (
            !assemblyShouldRunRef.current
          ) {
            ws.close();
            return;
          }

          try {
            const audioContext =
              new AudioContext({
                sampleRate:
                  16000,
              });

            assemblyAudioContextRef.current =
              audioContext;

            await audioContext.audioWorklet.addModule(
              "/assembly-pcm-processor.js"
            );

            if (
              audioContext.state ===
              "suspended"
            ) {
              await audioContext.resume();
            }

            const source =
              audioContext.createMediaStreamSource(
                mediaStream
              );

            const worklet =
              new AudioWorkletNode(
                audioContext,
                "assembly-pcm-processor"
              );

            const silentGain =
              audioContext.createGain();

            silentGain.gain.value =
              0;

            source.connect(
              worklet
            );

            worklet.connect(
              silentGain
            );

            silentGain.connect(
              audioContext.destination
            );

            assemblySourceNodeRef.current =
              source;

            assemblyWorkletNodeRef.current =
              worklet;

            assemblySilentGainRef.current =
              silentGain;

            worklet.port.onmessage =
              (
                event:
                  MessageEvent<ArrayBuffer>
              ) => {
                const currentWs =
                  assemblyWebSocketRef.current;

                if (
                  !assemblyShouldRunRef.current ||
                  !currentWs ||
                  currentWs.readyState !==
                    WebSocket.OPEN
                ) {
                  return;
                }

                if (
                  !localMediaStatusRef.current
                    .isMicOn
                ) {
                  return;
                }

                const audioBuffer =
                  event.data;

                if (
                  audioBuffer instanceof
                  ArrayBuffer
                ) {
                  currentWs.send(
                    audioBuffer
                  );
                }
              };

            setIsTranscribing(
              true
            );

            setIsAssemblyConnecting(
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

            addNotification(
              "Transcrição em tempo real ativada.",
              "success"
            );
          } catch (error) {
            console.error(
              "Erro ao iniciar áudio da AssemblyAI:",
              error
            );

            assemblyShouldRunRef.current =
              false;

            setIsAssemblyConnecting(
              false
            );

            setIsTranscribing(
              false
            );

            forceCloseAssemblySocket();

            addNotification(
              "Não foi possível iniciar o processamento do microfone.",
              "warning"
            );
          }
        };

      ws.onmessage =
        (event) => {
          try {
            const message =
              JSON.parse(
                String(
                  event.data
                )
              ) as AssemblyMessage;

            if (
              message.type ===
              "Begin"
            ) {
              assemblySessionIdRef.current =
                typeof message.id ===
                "string"
                  ? message.id
                  : "";

              console.log(
                "🎙️ AssemblyAI conectada:",
                assemblySessionIdRef.current
              );

              return;
            }

            if (
              message.type ===
              "Turn"
            ) {
              const text =
                String(
                  message.transcript ||
                    ""
                ).trim();

              if (!text) {
                return;
              }

              if (
                message.end_of_turn !==
                true
              ) {
                setInterimTranscript(
                  text
                );

                return;
              }

              setInterimTranscript(
                ""
              );

              const socket =
                socketRef.current;

              if (!socket) {
                return;
              }

              const createdAt =
                Date.now();

              const turnOrder =
                typeof message.turn_order ===
                "number"
                  ? message.turn_order
                  : createdAt;

              const sessionId =
                assemblySessionIdRef.current ||
                socket.id ||
                "assembly";

              const entryId =
                `${sessionId}-${turnOrder}`;

              const time =
                new Date(
                  createdAt
                ).toLocaleTimeString(
                  "pt-BR",
                  {
                    hour:
                      "2-digit",

                    minute:
                      "2-digit",
                  }
                );

              socket.emit(
                "transcript-entry",
                {
                  roomId,

                  entry: {
                    id:
                      entryId,

                    text,

                    time,

                    createdAt,
                  },
                }
              );

              return;
            }

            if (
              message.type ===
              "Termination"
            ) {
              console.log(
                "🛑 Sessão AssemblyAI finalizada."
              );

              forceCloseAssemblySocket();
            }
          } catch (error) {
            console.error(
              "Erro ao interpretar mensagem da AssemblyAI:",
              error
            );
          }
        };

      ws.onerror =
        (event) => {
          console.error(
            "Erro WebSocket AssemblyAI:",
            event
          );

          if (
            assemblyShouldRunRef.current
          ) {
            addNotification(
              "A conexão com a transcrição encontrou um problema.",
              "warning"
            );
          }
        };

      ws.onclose =
        () => {
          cleanupAssemblyAudio();

          assemblyWebSocketRef.current =
            null;

          setIsAssemblyConnecting(
            false
          );

          if (
            !assemblyStoppingRef.current &&
            assemblyShouldRunRef.current
          ) {
            assemblyShouldRunRef.current =
              false;

            setIsTranscribing(
              false
            );

            setInterimTranscript(
              ""
            );

            socketRef.current?.emit(
              "transcription-status-change",
              {
                roomId,

                isTranscribing:
                  false,
              }
            );

            addNotification(
              "A transcrição foi desconectada.",
              "warning"
            );
          }
        };
    } catch (error) {
      console.error(
        "Erro ao conectar AssemblyAI:",
        error
      );

      assemblyShouldRunRef.current =
        false;

      setIsAssemblyConnecting(
        false
      );

      setIsTranscribing(
        false
      );

      setInterimTranscript(
        ""
      );

      forceCloseAssemblySocket();

      addNotification(
        error instanceof Error
          ? error.message
          : "Não foi possível conectar à AssemblyAI.",
        "warning"
      );
    }
  }

  function stopTranscription(
    immediate = false
  ) {
    assemblyShouldRunRef.current =
      false;

    assemblyStoppingRef.current =
      true;

    setIsAssemblyConnecting(
      false
    );

    setIsTranscribing(
      false
    );

    setInterimTranscript(
      ""
    );

    socketRef.current?.emit(
      "transcription-status-change",
      {
        roomId,

        isTranscribing:
          false,
      }
    );

    cleanupAssemblyAudio();

    const ws =
      assemblyWebSocketRef.current;

    if (!ws) {
      return;
    }

    if (
      immediate ||
      ws.readyState !==
        WebSocket.OPEN
    ) {
      forceCloseAssemblySocket();
      return;
    }

    try {
      ws.send(
        JSON.stringify({
          type:
            "Terminate",
        })
      );
    } catch {
      forceCloseAssemblySocket();
      return;
    }

    assemblyCloseTimerRef.current =
      window.setTimeout(
        () => {
          forceCloseAssemblySocket();
        },
        1800
      );
  }

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
              video: {
                width: {
                  ideal: 1280,
                },

                height: {
                  ideal: 720,
                },

                aspectRatio: {
                  ideal:
                    16 / 9,
                },
              },

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

        if (
          !componentActive
        ) {
          stream
            .getTracks()
            .forEach(
              (track) =>
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
      } catch (error) {
        console.error(
          "Erro ao acessar mídia:",
          error
        );

        setMediaError(
          "Não foi possível acessar a câmera ou o microfone."
        );

        setIsMicOn(
          false
        );

        setIsCameraOn(
          false
        );

        localMediaStatusRef.current =
          {
            isMicOn:
              false,

            isCameraOn:
              false,

            isScreenSharing:
              false,
          };
      }

      if (
        !componentActive
      ) {
        return;
      }

      const socket =
        io();

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
          count:
            number;

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

          if (
            ownParticipant
          ) {
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

          if (
            remoteParticipant
          ) {
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
          } else {
            setRemoteParticipantName(
              "Participante"
            );

            setIsRemoteTranscribing(
              false
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

          const safeName =
            changedName ||
            "Participante";

          if (
            previousStatus.isMicOn &&
            !mediaStatus.isMicOn
          ) {
            addNotification(
              `${safeName} desligou o microfone.`,
              "warning"
            );
          }

          if (
            !previousStatus.isMicOn &&
            mediaStatus.isMicOn
          ) {
            addNotification(
              `${safeName} ligou o microfone.`,
              "success"
            );
          }

          if (
            previousStatus.isCameraOn &&
            !mediaStatus.isCameraOn
          ) {
            addNotification(
              `${safeName} desligou a câmera.`,
              "warning"
            );
          }

          if (
            !previousStatus.isCameraOn &&
            mediaStatus.isCameraOn
          ) {
            addNotification(
              `${safeName} ligou a câmera.`,
              "success"
            );
          }

          if (
            !previousStatus.isScreenSharing &&
            mediaStatus.isScreenSharing
          ) {
            addNotification(
              `${safeName} começou a compartilhar a tela.`,
              "info"
            );
          }

          if (
            previousStatus.isScreenSharing &&
            !mediaStatus.isScreenSharing
          ) {
            addNotification(
              `${safeName} parou de compartilhar a tela.`,
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
          if (
            senderName
          ) {
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

    void startMeeting();

    return () => {
      componentActive =
        false;

      assemblyShouldRunRef.current =
        false;

      assemblyStoppingRef.current =
        true;

      cleanupAssemblyAudio();

      forceCloseAssemblySocket();

      notificationTimeoutsRef.current.forEach(
        (timeout) => {
          clearTimeout(
            timeout
          );
        }
      );

      notificationTimeoutsRef.current =
        [];

      mediaStreamRef.current
        ?.getTracks()
        .forEach(
          (track) => {
            track.stop();
          }
        );

      screenStreamRef.current
        ?.getTracks()
        .forEach(
          (track) => {
            track.onended =
              null;

            track.stop();
          }
        );

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

  function toggleMicrophone() {
    const tracks =
      mediaStreamRef.current
        ?.getAudioTracks();

    if (
      !tracks ||
      tracks.length ===
        0
    ) {
      return;
    }

    const nextState =
      !isMicOn;

    tracks.forEach(
      (track) => {
        track.enabled =
          nextState;
      }
    );

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
      tracks.length ===
        0
    ) {
      return;
    }

    const nextState =
      !isCameraOn;

    tracks.forEach(
      (track) => {
        track.enabled =
          nextState;
      }
    );

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
      new Date().toLocaleTimeString(
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

    setNewMessage(
      ""
    );
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
      .forEach(
        (track) => {
          track.stop();
        }
      );

    screenStreamRef.current
      ?.getTracks()
      .forEach(
        (track) => {
          track.onended =
            null;

          track.stop();
        }
      );

    peerConnectionRef.current?.close();

    socketRef.current?.disconnect();

    router.push(
      "/dashboard"
    );
  }

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
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 text-xl">
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
                className="min-h-11 rounded-xl border border-white/10 bg-white/5 px-4 text-sm transition hover:bg-white/10 active:scale-95"
              >
                📋 Código
              </button>

              <button
                type="button"
                onClick={
                  copyInviteLink
                }
                className="min-h-11 rounded-xl border border-blue-400/20 bg-blue-500/15 px-4 text-sm transition hover:bg-blue-500/25 active:scale-95"
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
          isRemoteTranscribing ||
          isAssemblyConnecting) && (
          <div className="mb-4 flex items-center gap-3 rounded-2xl border border-cyan-400/15 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100 backdrop-blur-xl">
            <span className="relative flex h-3 w-3 shrink-0">
              <span className="absolute h-full w-full animate-ping rounded-full bg-cyan-400 opacity-50" />

              <span className="relative h-3 w-3 rounded-full bg-cyan-400" />
            </span>

            {isAssemblyConnecting
              ? "Conectando à transcrição em tempo real..."
              : "Transcrição em tempo real ativa."}
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
                  ? "relative h-screen w-screen overflow-hidden bg-black"
                  : `relative w-full overflow-hidden rounded-[1.8rem] bg-black ${glassPanel}`
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
                className={
                  isFullscreenLayout
                    ? "relative flex h-full w-full items-center justify-center bg-black"
                    : "relative flex aspect-video min-h-[280px] w-full items-center justify-center bg-black sm:min-h-[420px] lg:min-h-[540px]"
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
                      className={`h-full w-full bg-black object-contain ${
                        remoteVideoAvailable
                          ? ""
                          : "hidden"
                      }`}
                    />

                    {!isRemoteConnected && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950">
                        <div className="mb-3 h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-cyan-300" />

                        <span className="text-sm text-zinc-300">
                          Conectando com{" "}
                          {
                            remoteParticipantName
                          }
                          ...
                        </span>
                      </div>
                    )}

                    {isRemoteConnected &&
                      !remoteVideoAvailable && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950">
                          <div className="flex h-24 w-24 items-center justify-center rounded-full border border-white/10 bg-white/5 text-5xl">
                            👤
                          </div>

                          <p className="mt-4 text-lg font-semibold">
                            {
                              remoteParticipantName
                            }
                          </p>

                          <p className="mt-1 text-sm text-zinc-500">
                            Câmera desligada
                          </p>
                        </div>
                      )}

                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />

                    <div className="absolute bottom-3 left-3 z-20 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs backdrop-blur-xl sm:bottom-4 sm:left-4 sm:text-sm">
                      {
                        remoteParticipantName
                      }
                    </div>

                    <div className="absolute left-3 top-3 z-20 flex flex-col items-start gap-2 sm:left-4 sm:top-4">
                      {!remoteMediaStatus.isMicOn && (
                        <span className="rounded-xl border border-yellow-300/10 bg-yellow-500/30 px-3 py-2 text-xs backdrop-blur-xl">
                          🔇 Mudo
                        </span>
                      )}

                      {remoteMediaStatus.isScreenSharing && (
                        <span className="rounded-xl border border-purple-300/10 bg-purple-500/30 px-3 py-2 text-xs backdrop-blur-xl">
                          🖥 Compartilhando tela
                        </span>
                      )}

                      {isRemoteTranscribing && (
                        <span className="rounded-xl border border-cyan-300/10 bg-cyan-500/30 px-3 py-2 text-xs backdrop-blur-xl">
                          🎙️ Live
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center px-5 text-center">
                    <div className="flex h-24 w-24 items-center justify-center rounded-full border border-white/10 bg-white/5 text-5xl">
                      👤
                    </div>

                    <p className="mt-4 text-lg font-semibold">
                      Aguardando participante
                    </p>

                    <p className="mt-2 max-w-sm text-sm text-zinc-500">
                      Assim que seu convidado entrar, ele aparecerá em destaque nesta tela.
                    </p>

                    <button
                      type="button"
                      onClick={
                        copyInviteLink
                      }
                      className="mt-5 rounded-xl border border-blue-400/20 bg-blue-500/10 px-4 py-2 transition hover:bg-blue-500/20 active:scale-95"
                    >
                      🔗 Copiar convite
                    </button>
                  </div>
                )}

                <div
                  className={`absolute z-30 overflow-hidden rounded-2xl border border-white/20 bg-black shadow-2xl shadow-black/60 backdrop-blur-xl ${
                    isFullscreenLayout
                      ? "bottom-5 right-5 w-[24vw] min-w-[170px] max-w-[360px]"
                      : "bottom-3 right-3 w-[30%] min-w-[120px] max-w-[280px] sm:bottom-5 sm:right-5 sm:w-[26%]"
                  }`}
                >
                  <div className="relative aspect-video w-full overflow-hidden bg-black">
                    <video
                      ref={
                        localVideoRef
                      }
                      autoPlay
                      playsInline
                      muted
                      className={`h-full w-full bg-black object-contain ${
                        isCameraOn ||
                        isScreenSharing
                          ? ""
                          : "hidden"
                      }`}
                    />

                    {!isCameraOn &&
                      !isScreenSharing && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950">
                          <div className="text-3xl sm:text-4xl">
                            👤
                          </div>

                          <p className="mt-2 hidden text-xs text-zinc-400 sm:block">
                            Câmera desligada
                          </p>
                        </div>
                      )}

                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/80 to-transparent" />

                    <div className="absolute bottom-2 left-2 right-2 flex items-end justify-between gap-2">
                      <span className="max-w-[75%] truncate rounded-lg bg-black/45 px-2 py-1 text-[10px] backdrop-blur-md sm:text-xs">
                        Você
                      </span>

                      {!isMicOn && (
                        <span className="rounded-lg bg-yellow-500/40 px-2 py-1 text-[10px] backdrop-blur-md sm:text-xs">
                          🔇
                        </span>
                      )}
                    </div>

                    <div className="absolute right-2 top-2 flex flex-col items-end gap-1">
                      {isScreenSharing && (
                        <span className="rounded-lg bg-purple-500/40 px-2 py-1 text-[10px] backdrop-blur-md">
                          🖥
                        </span>
                      )}

                      {isTranscribing && (
                        <span className="rounded-lg bg-cyan-500/40 px-2 py-1 text-[10px] backdrop-blur-md">
                          🎙️
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {mediaError && (
              <div className="mt-4 rounded-2xl border border-red-400/15 bg-red-500/10 p-4 text-red-100">
                {
                  mediaError
                }
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
                {isMicOn
                  ? "🎤"
                  : "🔇"}

                <span className="hidden sm:inline">
                  Microfone
                </span>
              </button>

              <button
                type="button"
                onClick={
                  toggleCamera
                }
                className={`${controlButton} ${
                  isCameraOn
                    ? "border-emerald-400/15 bg-emerald-400/10"
                    : "border-red-400/20 bg-red-500/20"
                }`}
              >
                {isCameraOn
                  ? "📹"
                  : "🚫"}

                <span className="hidden sm:inline">
                  Câmera
                </span>
              </button>

              <button
                type="button"
                onClick={() =>
                  void toggleScreenSharing()
                }
                className={`${controlButton} ${
                  isScreenSharing
                    ? "border-purple-400/25 bg-purple-500/25"
                    : "border-purple-400/15 bg-purple-500/10"
                }`}
              >
                🖥

                <span className="hidden sm:inline">
                  {isScreenSharing
                    ? "Parar tela"
                    : "Compartilhar"}
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
                className={`${controlButton} ${
                  isChatOpen
                    ? "border-blue-300/25 bg-blue-500/25"
                    : "border-blue-400/15 bg-blue-500/10"
                }`}
              >
                💬

                <span className="hidden sm:inline">
                  Chat
                </span>
              </button>

              <button
                type="button"
                disabled={
                  isAssemblyConnecting
                }
                onClick={() => {
                  if (
                    isTranscribing ||
                    isAssemblyConnecting
                  ) {
                    stopTranscription();
                  } else {
                    void startTranscription();
                  }
                }}
                className={`${controlButton} ${
                  isTranscribing
                    ? "border-red-400/20 bg-red-500/25"
                    : "border-cyan-400/15 bg-cyan-500/10"
                } disabled:opacity-50`}
              >
                {isAssemblyConnecting
                  ? "⌛"
                  : isTranscribing
                    ? "⏹"
                    : "📝"}

                <span className="hidden sm:inline">
                  {isAssemblyConnecting
                    ? "Conectando..."
                    : isTranscribing
                      ? "Parar transcrição"
                      : "Transcrição Live"}
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
                <div>
                  <h2 className="font-semibold">
                    💬 Chat
                  </h2>

                  <p className="text-xs text-zinc-500">
                    {
                      messages.length
                    }{" "}
                    mensagens
                  </p>
                </div>

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
                className="flex flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-4"
              >
                {messages.length ===
                  0 && (
                  <div className="flex flex-1 items-center justify-center text-sm text-zinc-500">
                    Nenhuma mensagem ainda.
                  </div>
                )}

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
                        <strong className="truncate">
                          {message.isOwn
                            ? `Você — ${participantName}`
                            : message.senderName}
                        </strong>

                        <span className="shrink-0 text-zinc-500">
                          {
                            message.time
                          }
                        </span>
                      </div>

                      <p className="break-words text-sm leading-relaxed">
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
                        event.target.value
                      )
                    }
                    placeholder="Mensagem..."
                    autoComplete="off"
                    className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none"
                  />

                  <button
                    type="submit"
                    disabled={
                      !newMessage.trim()
                    }
                    className="h-12 w-12 rounded-2xl bg-blue-500/20 disabled:opacity-40"
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
                    🎙️ Transcrição Live
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

              <div className="border-b border-white/10 bg-black/10 px-4 py-3 text-xs">
                {isAssemblyConnecting && (
                  <span className="text-yellow-300">
                    ⌛ Conectando ao serviço de transcrição...
                  </span>
                )}

                {!isAssemblyConnecting &&
                  isTranscribing && (
                    <span className="text-cyan-300">
                      ● Ouvindo em tempo real
                    </span>
                  )}

                {!isAssemblyConnecting &&
                  !isTranscribing && (
                    <span className="text-zinc-500">
                      ○ Transcrição parada
                    </span>
                  )}
              </div>

              <div
                ref={
                  transcriptScrollRef
                }
                className="flex flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-3 sm:p-4"
              >
                {transcriptEntries.length ===
                  0 &&
                !interimTranscript ? (
                  <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
                    <div className="text-4xl">
                      🎙️
                    </div>

                    <p className="mt-3 text-sm">
                      Aguardando fala
                    </p>

                    <p className="mt-2 max-w-xs text-xs text-zinc-500">
                      A transcrição aparece enquanto você fala, sem esperar blocos longos de áudio.
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

                          <span className="shrink-0 text-xs text-zinc-600">
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

                {interimTranscript && (
                  <div className="rounded-2xl border border-dashed border-cyan-300/25 bg-cyan-500/10 p-4">
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-cyan-300">
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="absolute h-full w-full animate-ping rounded-full bg-cyan-400 opacity-50" />

                        <span className="relative h-2.5 w-2.5 rounded-full bg-cyan-400" />
                      </span>

                      Ouvindo...
                    </div>

                    <p className="text-sm italic leading-relaxed text-zinc-300">
                      {
                        interimTranscript
                      }
                    </p>
                  </div>
                )}
              </div>

              <div className="border-t border-white/10 p-3">
                <div
                  className={`rounded-xl px-3 py-2 text-center text-xs ${
                    isTranscribing
                      ? "bg-cyan-500/10 text-cyan-200"
                      : "bg-white/5 text-zinc-500"
                  }`}
                >
                  {isTranscribing
                    ? "● Streaming ativo — áudio isolado deste participante"
                    : "○ Streaming parado"}
                </div>
              </div>
            </aside>
          )}
        </div>
      </div>
    </main>
  );
}