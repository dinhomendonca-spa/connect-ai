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

import { supabase } from "@/lib/supabase";

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
  isHost?: boolean;
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

type TranscriptionReason =
  | "manual"
  | "captions";

type LiveCaption = {
  entryId: string;
  senderId: string;
  senderName: string;
  originalText: string;
  translatedText: string;
  targetLanguage: "pt-BR";
  wasTranslated: boolean;
  createdAt?: number;
  translationError?: boolean;
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

type MeetingReportActionItem = {
  task: string;
  owner: string;
  deadline: string;
};

type MeetingReportClarification = {
  topic: string;
  explanation: string;
};

type MeetingReport = {
  id: string;
  roomId: string;
  generatedAt: number;
  startedAt: number;
  durationSeconds: number;
  participants: string[];
  transcriptEntryCount: number;
  title: string;
  executiveSummary: string;
  topics: string[];
  keyPoints: string[];
  decisions: string[];
  actionItems: MeetingReportActionItem[];
  conversationAnalysis: {
    overview: string;
    alignment: string;
    divergences: string;
    communicationClarity: string;
    risksAndAttentionPoints: string[];
  };
  clarifications: MeetingReportClarification[];
  unresolvedPoints: string[];
};

type MeetingReportResponse = {
  ok: boolean;
  report?: MeetingReport;
  cached?: boolean;
  error?: string;
};

type PictureInPictureVideoElement = HTMLVideoElement & {
  requestPictureInPicture?: () => Promise<unknown>;
};

type PictureInPictureDocument = Document & {
  pictureInPictureEnabled?: boolean;
  pictureInPictureElement?: Element | null;
  exitPictureInPicture?: () => Promise<void>;
};

const CURRENT_USER_SESSION_KEY =
  "connectai-current-user";

const ACTIVE_MEETING_SESSION_KEY =
  "connectai-active-meeting";

const FALLBACK_PARTICIPANT_KEY =
  "connectai-participant-name";

const PARTICIPANT_SESSION_KEY =
  "connectai-participant-session";

const HOST_RESUME_SESSION_KEY =
  "connectai-host-resume-session";

const MAX_ROOM_PARTICIPANTS = 6;

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
  const hours = Math.floor(
    totalSeconds / 3600
  );

  const minutes = Math.floor(
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

function getCurrentUserIdentityKey(): string | null {
  try {
    const storedCurrentUser =
      sessionStorage.getItem(
        CURRENT_USER_SESSION_KEY
      );

    if (!storedCurrentUser) {
      return null;
    }

    const currentUser:
      CurrentUser =
      JSON.parse(
        storedCurrentUser
      );

    const email =
      String(
        currentUser.email || ""
      )
        .trim()
        .toLowerCase();

    if (email) {
      return `email:${email}`;
    }

    const name =
      String(
        currentUser.name || ""
      )
        .trim()
        .toLowerCase();

    return name
      ? `name:${name}`
      : null;
  } catch {
    return null;
  }
}

function getHostResumeStorageKey(
  roomId: string
): string | null {
  const identity =
    getCurrentUserIdentityKey();

  if (!identity) {
    return null;
  }

  return `${HOST_RESUME_SESSION_KEY}:${roomId}:${encodeURIComponent(
    identity
  )}`;
}

function persistHostResumeSessionId(
  roomId: string,
  participantSessionId: string
) {
  try {
    const storageKey =
      getHostResumeStorageKey(
        roomId
      );

    if (!storageKey) {
      return;
    }

    localStorage.setItem(
      storageKey,
      participantSessionId
    );
  } catch {
    // Persistência opcional. A reunião continua mesmo sem localStorage.
  }
}

function getOrCreateParticipantSessionId(
  roomId: string
): string {
  const storageKey =
    `${PARTICIPANT_SESSION_KEY}:${roomId}`;

  try {
    // Se este usuário já foi reconhecido como anfitrião desta sala,
    // reutilizamos o mesmo identificador mesmo após sair e voltar.
    const hostResumeStorageKey =
      getHostResumeStorageKey(
        roomId
      );

    const savedHostSession =
      hostResumeStorageKey
        ? localStorage.getItem(
            hostResumeStorageKey
          )
        : null;

    if (savedHostSession) {
      sessionStorage.setItem(
        storageKey,
        savedHostSession
      );

      return savedHostSession;
    }

    const stored =
      sessionStorage.getItem(storageKey);

    if (stored) {
      return stored;
    }

    const generated =
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()
            .toString(36)
            .slice(2)}`;

    sessionStorage.setItem(
      storageKey,
      generated
    );

    return generated;
  } catch {
    return `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;
  }
}

function formatReportDate(
  timestamp: number
): string {
  return new Date(timestamp).toLocaleString(
    "pt-BR",
    {
      dateStyle: "short",
      timeStyle: "short",
    }
  );
}

function formatMeetingReportText(
  report: MeetingReport
): string {
  const lines: string[] = [
    report.title ||
      "Relatório da reunião",
    "",
    `Sala: ${report.roomId}`,
    `Início: ${formatReportDate(report.startedAt)}`,
    `Gerado em: ${formatReportDate(report.generatedAt)}`,
    `Duração: ${formatMeetingDuration(report.durationSeconds)}`,
    `Participantes: ${
      report.participants.length > 0
        ? report.participants.join(", ")
        : "Não definido durante a reunião."
    }`,
    "",
    "RESUMO EXECUTIVO",
    report.executiveSummary,
    "",
    "TÓPICOS ABORDADOS",
    ...report.topics.map(
      (item) => `• ${item}`
    ),
    "",
    "PRINCIPAIS PONTOS",
    ...report.keyPoints.map(
      (item) => `• ${item}`
    ),
    "",
    "DECISÕES TOMADAS",
    ...report.decisions.map(
      (item) => `• ${item}`
    ),
    "",
    "PENDÊNCIAS E PRÓXIMOS PASSOS",
    ...report.actionItems.map(
      (item) =>
        `• ${item.task} | Responsável: ${item.owner} | Prazo: ${item.deadline}`
    ),
    "",
    "ANÁLISE DA CONVERSA",
    `Visão geral: ${report.conversationAnalysis.overview}`,
    `Alinhamento: ${report.conversationAnalysis.alignment}`,
    `Divergências: ${report.conversationAnalysis.divergences}`,
    `Clareza da comunicação: ${report.conversationAnalysis.communicationClarity}`,
    ...report.conversationAnalysis.risksAndAttentionPoints.map(
      (item) => `• Ponto de atenção: ${item}`
    ),
    "",
    "ESCLARECIMENTOS",
    ...report.clarifications.map(
      (item) =>
        `• ${item.topic}: ${item.explanation}`
    ),
    "",
    "PONTOS NÃO DEFINIDOS",
    ...report.unresolvedPoints.map(
      (item) => `• ${item}`
    ),
  ];

  return lines.join("\n");
}


type PdfTextStyle =
  | "title"
  | "subtitle"
  | "meta"
  | "section"
  | "body"
  | "bullet"
  | "small";

type PdfLayoutLine = {
  text: string;
  style: PdfTextStyle;
};

const PDF_STYLE_CONFIG: Record<
  PdfTextStyle,
  {
    font: "F1" | "F2";
    fontSize: number;
    lineHeight: number;
    maxCharacters: number;
    gapBefore: number;
  }
> = {
  title: {
    font: "F2",
    fontSize: 18,
    lineHeight: 24,
    maxCharacters: 52,
    gapBefore: 0,
  },
  subtitle: {
    font: "F1",
    fontSize: 9,
    lineHeight: 14,
    maxCharacters: 96,
    gapBefore: 1,
  },
  meta: {
    font: "F1",
    fontSize: 9,
    lineHeight: 13,
    maxCharacters: 96,
    gapBefore: 0,
  },
  section: {
    font: "F2",
    fontSize: 12,
    lineHeight: 18,
    maxCharacters: 76,
    gapBefore: 10,
  },
  body: {
    font: "F1",
    fontSize: 10,
    lineHeight: 15,
    maxCharacters: 92,
    gapBefore: 0,
  },
  bullet: {
    font: "F1",
    fontSize: 10,
    lineHeight: 15,
    maxCharacters: 88,
    gapBefore: 0,
  },
  small: {
    font: "F1",
    fontSize: 9,
    lineHeight: 13,
    maxCharacters: 100,
    gapBefore: 0,
  },
};

function normalizePdfText(
  value: string
): string {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, "...")
    .replace(/\u00a0/g, " ")
    .replace(/[^\x00-\xFF]/g, "?");
}

function escapePdfLiteral(
  value: string
): string {
  return normalizePdfText(value)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrapPdfText(
  value: string,
  maxCharacters: number
): string[] {
  const paragraphs =
    normalizePdfText(value).split(/\r?\n/);

  const result: string[] = [];

  paragraphs.forEach(
    (paragraph) => {
      const trimmed =
        paragraph.trim();

      if (!trimmed) {
        result.push("");
        return;
      }

      const words =
        trimmed.split(/\s+/);

      let currentLine = "";

      words.forEach((word) => {
        if (
          word.length >
          maxCharacters
        ) {
          if (currentLine) {
            result.push(
              currentLine
            );
            currentLine = "";
          }

          for (
            let index = 0;
            index < word.length;
            index += maxCharacters
          ) {
            result.push(
              word.slice(
                index,
                index +
                  maxCharacters
              )
            );
          }

          return;
        }

        const candidate =
          currentLine
            ? `${currentLine} ${word}`
            : word;

        if (
          candidate.length <=
          maxCharacters
        ) {
          currentLine =
            candidate;
          return;
        }

        result.push(
          currentLine
        );

        currentLine = word;
      });

      if (currentLine) {
        result.push(
          currentLine
        );
      }
    }
  );

  return result;
}

function buildMeetingReportPdfLines(
  report: MeetingReport
): PdfLayoutLine[] {
  const lines: PdfLayoutLine[] = [];

  const addLine = (
    style: PdfTextStyle,
    text: string
  ) => {
    lines.push({
      style,
      text,
    });
  };

  const addSection = (
    title: string,
    content: string
  ) => {
    addLine(
      "section",
      title
    );

    addLine(
      "body",
      content ||
        "Não definido durante a reunião."
    );
  };

  const addList = (
    title: string,
    items: string[]
  ) => {
    addLine(
      "section",
      title
    );

    if (items.length === 0) {
      addLine(
        "body",
        "Não definido durante a reunião."
      );
      return;
    }

    items.forEach((item) => {
      addLine(
        "bullet",
        `- ${item}`
      );
    });
  };

  addLine(
    "title",
    report.title ||
      "Relatório da reunião"
  );

  addLine(
    "subtitle",
    "ConnectAI - Relatório inteligente de reunião"
  );

  addLine(
    "meta",
    `Sala: ${report.roomId}`
  );

  addLine(
    "meta",
    `Início: ${formatReportDate(
      report.startedAt
    )}`
  );

  addLine(
    "meta",
    `Gerado em: ${formatReportDate(
      report.generatedAt
    )}`
  );

  addLine(
    "meta",
    `Duração: ${formatMeetingDuration(
      report.durationSeconds
    )}`
  );

  addLine(
    "meta",
    `Participantes: ${
      report.participants.length > 0
        ? report.participants.join(
            ", "
          )
        : "Não definido durante a reunião."
    }`
  );

  addLine(
    "meta",
    `Falas transcritas: ${report.transcriptEntryCount}`
  );

  addSection(
    "Resumo executivo",
    report.executiveSummary
  );

  addList(
    "Tópicos abordados",
    report.topics
  );

  addList(
    "Principais pontos",
    report.keyPoints
  );

  addList(
    "Decisões tomadas",
    report.decisions
  );

  addLine(
    "section",
    "Pendências e próximos passos"
  );

  if (
    report.actionItems.length ===
    0
  ) {
    addLine(
      "body",
      "Não definido durante a reunião."
    );
  } else {
    report.actionItems.forEach(
      (item) => {
        addLine(
          "bullet",
          `- ${item.task}`
        );

        addLine(
          "small",
          `  Responsável: ${item.owner} | Prazo: ${item.deadline}`
        );
      }
    );
  }

  addLine(
    "section",
    "Análise da conversa"
  );

  addLine(
    "body",
    `Visão geral: ${report.conversationAnalysis.overview}`
  );

  addLine(
    "body",
    `Alinhamento: ${report.conversationAnalysis.alignment}`
  );

  addLine(
    "body",
    `Divergências: ${report.conversationAnalysis.divergences}`
  );

  addLine(
    "body",
    `Clareza da comunicação: ${report.conversationAnalysis.communicationClarity}`
  );

  if (
    report.conversationAnalysis.risksAndAttentionPoints.length ===
    0
  ) {
    addLine(
      "body",
      "Pontos de atenção: Não definido durante a reunião."
    );
  } else {
    addLine(
      "body",
      "Pontos de atenção:"
    );

    report.conversationAnalysis.risksAndAttentionPoints.forEach(
      (item) => {
        addLine(
          "bullet",
          `- ${item}`
        );
      }
    );
  }

  addLine(
    "section",
    "Esclarecimentos"
  );

  if (
    report.clarifications.length ===
    0
  ) {
    addLine(
      "body",
      "Não definido durante a reunião."
    );
  } else {
    report.clarifications.forEach(
      (item) => {
        addLine(
          "bullet",
          `- ${item.topic}: ${item.explanation}`
        );
      }
    );
  }

  addList(
    "Pontos não definidos",
    report.unresolvedPoints
  );

  return lines;
}

function createMeetingReportPdfBlob(
  report: MeetingReport
): Blob {
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const leftMargin = 48;
  const topY = 790;
  const bottomY = 58;

  const pages: string[][] = [
    [],
  ];

  let currentPage = 0;
  let currentY = topY;

  const addPage = () => {
    pages.push([]);
    currentPage += 1;
    currentY = topY;
  };

  const sourceLines =
    buildMeetingReportPdfLines(
      report
    );

  sourceLines.forEach(
    (sourceLine) => {
      const config =
        PDF_STYLE_CONFIG[
          sourceLine.style
        ];

      const wrappedLines =
        wrapPdfText(
          sourceLine.text,
          config.maxCharacters
        );

      const gapBefore =
        config.gapBefore;

      if (
        gapBefore > 0 &&
        currentY < topY
      ) {
        currentY -=
          gapBefore;
      }

      wrappedLines.forEach(
        (line) => {
          if (
            currentY -
              config.lineHeight <
            bottomY
          ) {
            addPage();
          }

          if (!line) {
            currentY -=
              config.lineHeight;
            return;
          }

          const escapedText =
            escapePdfLiteral(
              line
            );

          pages[currentPage].push(
            `BT /${config.font} ${config.fontSize} Tf ${leftMargin} ${currentY.toFixed(
              2
            )} Td (${escapedText}) Tj ET\n`
          );

          currentY -=
            config.lineHeight;
        }
      );
    }
  );

  const totalPages =
    pages.length;

  const objects: string[] = [
    "",
  ];

  objects[1] =
    "<< /Type /Catalog /Pages 2 0 R >>";

  const pageObjectNumbers =
    pages.map(
      (_, index) =>
        5 + index * 2
    );

  objects[2] =
    `<< /Type /Pages /Kids [${pageObjectNumbers
      .map(
        (objectNumber) =>
          `${objectNumber} 0 R`
      )
      .join(
        " "
      )}] /Count ${totalPages} >>`;

  objects[3] =
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";

  objects[4] =
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";

  pages.forEach(
    (pageCommands, index) => {
      const pageObjectNumber =
        5 + index * 2;

      const contentObjectNumber =
        pageObjectNumber + 1;

      const footerText =
        escapePdfLiteral(
          `ConnectAI - Página ${
            index + 1
          } de ${totalPages}`
        );

      const pageContent =
        `${pageCommands.join(
          ""
        )}BT /F1 8 Tf ${leftMargin} 28 Td (${footerText}) Tj ET\n`;

      objects[pageObjectNumber] =
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`;

      objects[contentObjectNumber] =
        `<< /Length ${pageContent.length} >>\nstream\n${pageContent}endstream`;
    }
  );

  let pdf =
    `%PDF-1.4\n%${String.fromCharCode(
      0xe2,
      0xe3,
      0xcf,
      0xd3
    )}\n`;

  const offsets =
    new Array(
      objects.length
    ).fill(0);

  for (
    let objectNumber = 1;
    objectNumber <
    objects.length;
    objectNumber += 1
  ) {
    offsets[objectNumber] =
      pdf.length;

    pdf += `${objectNumber} 0 obj\n${objects[objectNumber]}\nendobj\n`;
  }

  const xrefOffset =
    pdf.length;

  pdf += `xref\n0 ${objects.length}\n`;
  pdf +=
    "0000000000 65535 f \n";

  for (
    let objectNumber = 1;
    objectNumber <
    objects.length;
    objectNumber += 1
  ) {
    pdf += `${String(
      offsets[objectNumber]
    ).padStart(
      10,
      "0"
    )} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  const bytes =
    new Uint8Array(
      pdf.length
    );

  for (
    let index = 0;
    index < pdf.length;
    index += 1
  ) {
    bytes[index] =
      pdf.charCodeAt(index) &
      0xff;
  }

  return new Blob(
    [bytes],
    {
      type: "application/pdf",
    }
  );
}

function getMeetingReportPdfFileName(
  report: MeetingReport
): string {
  const safeRoomId =
    report.roomId
      .replace(
        /[^a-zA-Z0-9_-]/g,
        "-"
      )
      .replace(
        /-+/g,
        "-"
      )
      .slice(0, 40) ||
    "reuniao";

  const date =
    new Date(
      report.generatedAt
    )
      .toISOString()
      .slice(0, 10);

  return `connectai-relatorio-${safeRoomId}-${date}.pdf`;
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

  const pictureInPictureVideoRef =
    useRef<HTMLVideoElement>(
      null
    );

  const remoteVideoRefs =
    useRef<
      Map<
        string,
        HTMLVideoElement
      >
    >(new Map());

  const remoteVideoRefCallbacks =
    useRef<
      Map<
        string,
        (element: HTMLVideoElement | null) => void
      >
    >(new Map());

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

  const peerConnectionsRef =
    useRef<
      Map<
        string,
        RTCPeerConnection
      >
    >(new Map());

  const pendingIceCandidatesRef =
    useRef<
      Map<
        string,
        RTCIceCandidateInit[]
      >
    >(new Map());

  const remoteStreamsRef =
    useRef<
      Map<string, MediaStream>
    >(new Map());

  const localMediaStatusRef =
    useRef<MediaStatus>({
      ...DEFAULT_MEDIA_STATUS,
    });

  const remoteMediaStatusRef =
    useRef<
      Map<string, MediaStatus>
    >(new Map());

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

  const transcriptionReasonsRef =
    useRef<
      Set<TranscriptionReason>
    >(new Set());

  const captionsEnabledRef =
    useRef(false);

  const captionDemandActiveRef =
    useRef(false);

  const captionHideTimerRef =
    useRef<number | null>(
      null
    );

  const reportRequestTimerRef =
    useRef<number | null>(
      null
    );

  const savedMeetingIdRef =
    useRef("");

  const meetingSecondsRef =
    useRef(0);

  const isHostRef =
    useRef(false);

  const transcriptEntriesRef =
    useRef<
      TranscriptEntry[]
    >([]);

  const remoteParticipantsRef =
    useRef<
      RoomParticipant[]
    >([]);

  const meetingReportRef =
    useRef<MeetingReport | null>(
      null
    );

  const lastSavedSnapshotRef =
    useRef("");

  const meetingSaveTimerRef =
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
    remoteParticipants,
    setRemoteParticipants,
  ] = useState<
    RoomParticipant[]
  >([]);

  const [
    remoteConnectionStates,
    setRemoteConnectionStates,
  ] = useState<
    Record<string, boolean>
  >({});

  const [
    meetingSeconds,
    setMeetingSeconds,
  ] = useState(0);

  const [
    isFullscreenLayout,
    setIsFullscreenLayout,
  ] = useState(false);

  const [
    isPictureInPicture,
    setIsPictureInPicture,
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
    isManualTranscriptionRequested,
    setIsManualTranscriptionRequested,
  ] = useState(false);

  const [
    isCaptionsEnabled,
    setIsCaptionsEnabled,
  ] = useState(false);

  const [
    isCaptionDemandActive,
    setIsCaptionDemandActive,
  ] = useState(false);

  const [
    activeCaption,
    setActiveCaption,
  ] = useState<LiveCaption | null>(
    null
  );

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

  const [
    isHost,
    setIsHost,
  ] = useState(false);

  const [
    meetingReport,
    setMeetingReport,
  ] = useState<MeetingReport | null>(
    null
  );

  const [
    isGeneratingReport,
    setIsGeneratingReport,
  ] = useState(false);

  const [
    isReportOpen,
    setIsReportOpen,
  ] = useState(false);

  useEffect(() => {
    meetingSecondsRef.current =
      meetingSeconds;
  }, [meetingSeconds]);

  useEffect(() => {
    isHostRef.current =
      isHost;
  }, [isHost]);

  useEffect(() => {
    transcriptEntriesRef.current =
      transcriptEntries;
  }, [transcriptEntries]);

  useEffect(() => {
    remoteParticipantsRef.current =
      remoteParticipants;
  }, [remoteParticipants]);

  useEffect(() => {
    meetingReportRef.current =
      meetingReport;
  }, [meetingReport]);

  useEffect(() => {
    captionsEnabledRef.current =
      isCaptionsEnabled;
  }, [isCaptionsEnabled]);

  const showLiveCaption =
    useCallback(
      (caption: LiveCaption) => {
        if (
          !captionsEnabledRef.current
        ) {
          return;
        }

        setActiveCaption(
          caption
        );

        if (
          captionHideTimerRef.current !==
          null
        ) {
          window.clearTimeout(
            captionHideTimerRef.current
          );
        }

        captionHideTimerRef.current =
          window.setTimeout(
            () => {
              captionHideTimerRef.current =
                null;

              setActiveCaption(
                (current) =>
                  current?.entryId ===
                  caption.entryId
                    ? null
                    : current
              );
            },
            7000
          );
      },
      []
    );

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
    const video =
      pictureInPictureVideoRef.current;

    if (!video) {
      return;
    }

    function handleEnterPictureInPicture() {
      setIsPictureInPicture(
        true
      );
    }

    function handleLeavePictureInPicture() {
      setIsPictureInPicture(
        false
      );
    }

    video.addEventListener(
      "enterpictureinpicture",
      handleEnterPictureInPicture
    );

    video.addEventListener(
      "leavepictureinpicture",
      handleLeavePictureInPicture
    );

    return () => {
      video.removeEventListener(
        "enterpictureinpicture",
        handleEnterPictureInPicture
      );

      video.removeEventListener(
        "leavepictureinpicture",
        handleLeavePictureInPicture
      );
    };
  }, []);

  useEffect(() => {
    function handleEscape(
      event: KeyboardEvent
    ) {
      if (
        event.key !==
        "Escape"
      ) {
        return;
      }

      if (
        isReportOpen
      ) {
        setIsReportOpen(
          false
        );
      }

      if (
        isTranscriptOpen
      ) {
        setIsTranscriptOpen(
          false
        );
      }

      if (
        isChatOpen
      ) {
        setIsChatOpen(
          false
        );
      }
    }

    window.addEventListener(
      "keydown",
      handleEscape
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleEscape
      );
    };
  }, [
    isReportOpen,
    isTranscriptOpen,
    isChatOpen,
  ]);

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
              interimTranscript
                ? "auto"
                : "smooth",
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

  async function togglePictureInPicture() {
    const pipDocument =
      document as PictureInPictureDocument;

    const video =
      pictureInPictureVideoRef.current as
        | PictureInPictureVideoElement
        | null;

    if (!video) {
      addNotification(
        "A miniatura de vídeo ainda não está pronta.",
        "warning"
      );
      return;
    }

    try {
      if (
        pipDocument.pictureInPictureElement
      ) {
        if (
          typeof pipDocument.exitPictureInPicture ===
          "function"
        ) {
          await pipDocument.exitPictureInPicture();
        }

        setIsPictureInPicture(
          false
        );
        return;
      }

      if (
        !pipDocument.pictureInPictureEnabled ||
        typeof video.requestPictureInPicture !==
          "function"
      ) {
        addNotification(
          "Este navegador não oferece miniatura Picture-in-Picture para a câmera.",
          "warning"
        );
        return;
      }

      const cameraStream =
        mediaStreamRef.current;

      const cameraTrack =
        cameraStream
          ?.getVideoTracks()[0];

      if (
        !cameraStream ||
        !cameraTrack ||
        !cameraTrack.enabled
      ) {
        addNotification(
          "Ligue a câmera antes de ativar a miniatura.",
          "warning"
        );
        return;
      }

      if (
        video.srcObject !==
        cameraStream
      ) {
        video.srcObject =
          cameraStream;
      }

      await video.play();
      await video.requestPictureInPicture();

      setIsPictureInPicture(
        true
      );

      addNotification(
        "Miniatura ativada. Você pode trocar de aba ou aplicativo sem sair da reunião.",
        "success"
      );
    } catch (error) {
      console.error(
        "Erro ao ativar Picture-in-Picture:",
        error
      );

      addNotification(
        "Não foi possível ativar a miniatura de vídeo neste navegador.",
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

  function upsertRemoteParticipant(
    participant: RoomParticipant
  ) {
    remoteMediaStatusRef.current.set(
      participant.participantId,
      participant.mediaStatus
    );

    setRemoteParticipants(
      (current) => {
        const existingIndex =
          current.findIndex(
            (item) =>
              item.participantId ===
              participant.participantId
          );

        if (existingIndex === -1) {
          return [
            ...current,
            participant,
          ];
        }

        const next = [...current];

        next[existingIndex] = {
          ...next[existingIndex],
          ...participant,
        };

        return next;
      }
    );
  }

  function clearRemoteParticipant(
    participantId: string
  ) {
    const peerConnection =
      peerConnectionsRef.current.get(
        participantId
      );

    peerConnection?.close();

    peerConnectionsRef.current.delete(
      participantId
    );

    pendingIceCandidatesRef.current.delete(
      participantId
    );

    remoteMediaStatusRef.current.delete(
      participantId
    );

    const remoteStream =
      remoteStreamsRef.current.get(
        participantId
      );

    remoteStream
      ?.getTracks()
      .forEach((track) => {
        track.stop();
      });

    remoteStreamsRef.current.delete(
      participantId
    );

    const videoElement =
      remoteVideoRefs.current.get(
        participantId
      );

    if (videoElement) {
      videoElement.srcObject = null;
    }

    remoteVideoRefs.current.delete(
      participantId
    );

    remoteVideoRefCallbacks.current.delete(
      participantId
    );

    setRemoteParticipants(
      (current) =>
        current.filter(
          (participant) =>
            participant.participantId !==
            participantId
        )
    );

    setRemoteConnectionStates(
      (current) => {
        const next = {
          ...current,
        };

        delete next[participantId];
        return next;
      }
    );
  }

  function closeAllPeerConnections() {
    peerConnectionsRef.current.forEach(
      (peerConnection) => {
        peerConnection.close();
      }
    );

    peerConnectionsRef.current.clear();
    pendingIceCandidatesRef.current.clear();

    remoteStreamsRef.current.forEach(
      (stream) => {
        stream
          .getTracks()
          .forEach((track) => {
            track.stop();
          });
      }
    );

    remoteStreamsRef.current.clear();
    remoteVideoRefs.current.clear();
    remoteVideoRefCallbacks.current.clear();
    remoteMediaStatusRef.current.clear();
  }

  async function configureVideoSender(
    sender: RTCRtpSender,
    maxBitrate: number
  ) {
    try {
      const parameters =
        sender.getParameters();

      if (
        !parameters.encodings ||
        parameters.encodings.length === 0
      ) {
        parameters.encodings = [{}];
      }

      parameters.encodings[0].maxBitrate =
        maxBitrate;

      parameters.encodings[0].maxFramerate =
        24;

      await sender.setParameters(
        parameters
      );
    } catch (error) {
      console.warn(
        "Não foi possível limitar o bitrate do vídeo:",
        error
      );
    }
  }

  function createPeerConnection(
    targetId: string
  ) {
    const existingPeer =
      peerConnectionsRef.current.get(
        targetId
      );

    if (
      existingPeer &&
      existingPeer.connectionState !==
        "closed"
    ) {
      return existingPeer;
    }

    const peerConnection =
      new RTCPeerConnection({
        iceServers: [
          {
            urls:
              "stun:stun.l.google.com:19302",
          },
        ],
      });

    peerConnectionsRef.current.set(
      targetId,
      peerConnection
    );

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
      const videoSender =
        peerConnection.addTrack(
          activeVideoTrack,
          activeVideoStream
        );

      void configureVideoSender(
        videoSender,
        screenStream
          ? 1_500_000
          : 600_000
      );
    }

    peerConnection.ontrack =
      (event) => {
        let remoteStream =
          event.streams[0];

        if (!remoteStream) {
          remoteStream =
            remoteStreamsRef.current.get(
              targetId
            ) ??
            new MediaStream();

          const alreadyHasTrack =
            remoteStream
              .getTracks()
              .some(
                (track) =>
                  track.id ===
                  event.track.id
              );

          if (!alreadyHasTrack) {
            remoteStream.addTrack(
              event.track
            );
          }
        }

        remoteStreamsRef.current.set(
          targetId,
          remoteStream
        );

        const videoElement =
          remoteVideoRefs.current.get(
            targetId
          );

        if (videoElement) {
          videoElement.srcObject =
            remoteStream;
        }

        setRemoteConnectionStates(
          (current) => ({
            ...current,
            [targetId]: true,
          })
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

        setRemoteConnectionStates(
          (current) => ({
            ...current,
            [targetId]:
              state === "connected",
          })
        );

        if (
          state === "failed" ||
          state === "closed"
        ) {
          const currentPeer =
            peerConnectionsRef.current.get(
              targetId
            );

          if (
            currentPeer ===
            peerConnection
          ) {
            peerConnectionsRef.current.delete(
              targetId
            );
          }
        }
      };

    return peerConnection;
  }

  async function flushPendingIceCandidates(
    participantId: string,
    peerConnection:
      RTCPeerConnection
  ) {
    const candidates =
      pendingIceCandidatesRef.current.get(
        participantId
      ) ?? [];

    for (const candidate of candidates) {
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

    pendingIceCandidatesRef.current.delete(
      participantId
    );
  }

  async function replaceOutgoingVideoTrack(
    newTrack:
      MediaStreamTrack,
    maxBitrate = 600_000
  ) {
    const peerConnections =
      Array.from(
        peerConnectionsRef.current.values()
      );

    await Promise.all(
      peerConnections.map(
        async (peerConnection) => {
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

            await configureVideoSender(
              videoSender,
              maxBitrate
            );
          } catch (error) {
            console.error(
              "Erro ao trocar vídeo:",
              error
            );
          }
        }
      )
    );
  }

  const attachLocalVideo =
    useCallback(
      (
        element: HTMLVideoElement | null
      ) => {
        localVideoRef.current =
          element;

        if (!element) {
          return;
        }

        const activeStream =
          screenStreamRef.current ??
          mediaStreamRef.current;

        if (
          element.srcObject !==
          activeStream
        ) {
          element.srcObject =
            activeStream;
        }
      },
      []
    );

  const getRemoteVideoRef =
    useCallback(
      (participantId: string) => {
        const existingCallback =
          remoteVideoRefCallbacks.current.get(
            participantId
          );

        if (existingCallback) {
          return existingCallback;
        }

        const callback = (
          element: HTMLVideoElement | null
        ) => {
          if (!element) {
            remoteVideoRefs.current.delete(
              participantId
            );
            return;
          }

          remoteVideoRefs.current.set(
            participantId,
            element
          );

          const remoteStream =
            remoteStreamsRef.current.get(
              participantId
            );

          if (
            remoteStream &&
            element.srcObject !==
              remoteStream
          ) {
            element.srcObject =
              remoteStream;
          }
        };

        remoteVideoRefCallbacks.current.set(
          participantId,
          callback
        );

        return callback;
      },
      []
    );

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
        screenTrack,
        1_500_000
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
        cameraTrack,
        600_000
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

  async function startTranscription(
    reason: TranscriptionReason =
      "manual"
  ) {
    transcriptionReasonsRef.current.add(
      reason
    );

    if (reason === "manual") {
      setIsManualTranscriptionRequested(
        true
      );
    }

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

    if (reason === "manual") {
      setIsTranscriptOpen(
        true
      );

      setIsChatOpen(
        false
      );
    }

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
            "universal-3-5-pro",

          language_detection:
            "true",

          mode:
            "min_latency",

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

                latencyHint:
                  "interactive",
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

            if (reason === "manual") {
              addNotification(
                "Transcrição em tempo real ativada.",
                "success"
              );
            }
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
    immediate = false,
    reason:
      | TranscriptionReason
      | "all" =
      "manual"
  ) {
    if (
      immediate ||
      reason === "all"
    ) {
      transcriptionReasonsRef.current.clear();

      setIsManualTranscriptionRequested(
        false
      );
    } else {
      transcriptionReasonsRef.current.delete(
        reason
      );

      if (reason === "manual") {
        setIsManualTranscriptionRequested(
          false
        );
      }

      if (
        transcriptionReasonsRef.current.size >
        0
      ) {
        return;
      }
    }

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

    const participantSessionId =
      getOrCreateParticipantSessionId(
        roomId
      );

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
                  ideal:
                    640,
                },

                height: {
                  ideal:
                    360,
                },

                frameRate: {
                  ideal:
                    24,
                  max:
                    24,
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

        if (
          pictureInPictureVideoRef.current
        ) {
          pictureInPictureVideoRef.current.srcObject =
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

              participantSessionId,

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

          isHost:
            confirmedIsHost,
        }: {
          participantId:
            string;

          participantName:
            string;

          isHost?:
            boolean;
        }) => {
          participantNameRef.current =
            confirmedName;

          setParticipantName(
            confirmedName
          );

          setIsHost(
            confirmedIsHost === true
          );

          if (
            confirmedIsHost === true
          ) {
            persistHostResumeSessionId(
              roomId,
              participantSessionId
            );
          }

          socket.emit(
            "caption-preference-change",
            {
              roomId,
              enabled:
                captionsEnabledRef.current,
              targetLanguage:
                "pt-BR",
            }
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

            setIsHost(
              ownParticipant.isHost === true
            );
          }

          const nextRemoteParticipants =
            participants.filter(
              (participant) =>
                participant.participantId !==
                  socket.id
            );

          nextRemoteParticipants.forEach(
            (participant) => {
              remoteMediaStatusRef.current.set(
                participant.participantId,
                participant.mediaStatus
              );
            }
          );

          setRemoteParticipants(
            nextRemoteParticipants
          );
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
        "meeting-report-ready",
        ({
          report,
        }: {
          report:
            MeetingReport;

          cached?:
            boolean;
        }) => {
          if (!report) {
            return;
          }

          setMeetingReport(
            report
          );

          meetingReportRef.current =
            report;
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

          if (
            captionsEnabledRef.current
          ) {
            showLiveCaption({
              entryId:
                entry.id,
              senderId:
                entry.senderId,
              senderName:
                entry.senderName,
              originalText:
                entry.text,
              translatedText:
                "",
              targetLanguage:
                "pt-BR",
              wasTranslated:
                false,
              createdAt:
                entry.createdAt,
            });
          }
        }
      );

      socket.on(
        "caption-demand-state",
        ({
          active,
        }: {
          active:
            boolean;
        }) => {
          const nextActive =
            active === true;

          captionDemandActiveRef.current =
            nextActive;

          setIsCaptionDemandActive(
            nextActive
          );

          if (nextActive) {
            void startTranscription(
              "captions"
            );
          } else {
            stopTranscription(
              false,
              "captions"
            );
          }
        }
      );

      socket.on(
        "caption-translation",
        (caption: LiveCaption) => {
          if (
            !captionsEnabledRef.current ||
            !caption?.entryId
          ) {
            return;
          }

          showLiveCaption({
            ...caption,
            targetLanguage:
              "pt-BR",
          });
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

          for (
            const participant
            of participants
          ) {
            upsertRemoteParticipant(
              participant
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
                `Erro ao criar oferta para ${participant.participantName}:`,
                error
              );
            }
          }
        }
      );

      socket.on(
        "participant-joined",
        (participant: RoomParticipant) => {
          upsertRemoteParticipant(
            participant
          );

          addNotification(
            `${participant.participantName} entrou na reunião.`,
            "success"
          );
        }
      );

      socket.on(
        "participant-transcription-status",
        ({
          participantId,

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
          setRemoteParticipants(
            (current) =>
              current.map(
                (participant) =>
                  participant.participantId ===
                  participantId
                    ? {
                        ...participant,
                        isTranscribing:
                          remoteIsTranscribing,
                      }
                    : participant
              )
          );

          if (
            !captionDemandActiveRef.current
          ) {
            addNotification(
              remoteIsTranscribing
                ? `${changedName} ativou a transcrição.`
                : `${changedName} parou a transcrição.`,
              "info"
            );
          }
        }
      );

      socket.on(
        "participant-media-status",
        ({
          participantId,

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
            remoteMediaStatusRef.current.get(
              participantId
            ) ?? {
              ...DEFAULT_MEDIA_STATUS,
            };

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

          remoteMediaStatusRef.current.set(
            participantId,
            mediaStatus
          );

          setRemoteParticipants(
            (current) =>
              current.map(
                (participant) =>
                  participant.participantId ===
                  participantId
                    ? {
                        ...participant,
                        participantName:
                          changedName ||
                          participant.participantName,
                        mediaStatus,
                      }
                    : participant
              )
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
          setRemoteParticipants(
            (current) => {
              const exists =
                current.some(
                  (participant) =>
                    participant.participantId ===
                    senderId
                );

              if (exists) {
                return current.map(
                  (participant) =>
                    participant.participantId ===
                    senderId
                      ? {
                          ...participant,
                          participantName:
                            senderName ||
                            participant.participantName,
                        }
                      : participant
                );
              }

              return [
                ...current,
                {
                  participantId:
                    senderId,
                  participantName:
                    senderName ||
                    "Participante",
                  mediaStatus: {
                    ...DEFAULT_MEDIA_STATUS,
                  },
                  isTranscribing:
                    false,
                },
              ];
            }
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
              senderId,
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
          senderId,

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
          if (senderName) {
            setRemoteParticipants(
              (current) =>
                current.map(
                  (participant) =>
                    participant.participantId ===
                    senderId
                      ? {
                          ...participant,
                          participantName:
                            senderName,
                        }
                      : participant
                )
            );
          }

          const peerConnection =
            peerConnectionsRef.current.get(
              senderId
            );

          if (!peerConnection) {
            return;
          }

          try {
            await peerConnection.setRemoteDescription(
              answer
            );

            await flushPendingIceCandidates(
              senderId,
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
          senderId,

          candidate,
        }: {
          senderId:
            string;

          candidate:
            RTCIceCandidateInit;
        }) => {
          const peerConnection =
            peerConnectionsRef.current.get(
              senderId
            );

          if (
            !peerConnection ||
            !peerConnection.remoteDescription
          ) {
            const pending =
              pendingIceCandidatesRef.current.get(
                senderId
              ) ?? [];

            pending.push(
              candidate
            );

            pendingIceCandidatesRef.current.set(
              senderId,
              pending
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
          participantId,

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

          clearRemoteParticipant(
            participantId
          );
        }
      );

      socket.on(
        "room-full",
        () => {
          setRoomFull(
            true
          );

          addNotification(
            "Esta sala já possui 6 participantes.",
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

      if (
        reportRequestTimerRef.current !==
        null
      ) {
        window.clearTimeout(
          reportRequestTimerRef.current
        );

        reportRequestTimerRef.current =
          null;
      }

      if (
        meetingSaveTimerRef.current !==
        null
      ) {
        window.clearTimeout(
          meetingSaveTimerRef.current
        );

        meetingSaveTimerRef.current =
          null;
      }

      if (
        captionHideTimerRef.current !==
        null
      ) {
        window.clearTimeout(
          captionHideTimerRef.current
        );

        captionHideTimerRef.current =
          null;
      }

      transcriptionReasonsRef.current.clear();

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

      closeAllPeerConnections();

      socketRef.current?.disconnect();

      mediaStreamRef.current =
        null;

      screenStreamRef.current =
        null;

      socketRef.current =
        null;
    };
  }, [
    roomId,
    addNotification,
    showLiveCaption,
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

  function toggleCaptions() {
    const nextState =
      !isCaptionsEnabled;

    setIsCaptionsEnabled(
      nextState
    );

    captionsEnabledRef.current =
      nextState;

    if (!nextState) {
      setActiveCaption(
        null
      );

      if (
        captionHideTimerRef.current !==
        null
      ) {
        window.clearTimeout(
          captionHideTimerRef.current
        );

        captionHideTimerRef.current =
          null;
      }
    }

    socketRef.current?.emit(
      "caption-preference-change",
      {
        roomId,
        enabled:
          nextState,
        targetLanguage:
          "pt-BR",
      }
    );

    addNotification(
      nextState
        ? "Legendas em português ativadas. A fala dos participantes será transcrita e traduzida automaticamente."
        : "Legendas em português desativadas.",
      nextState
        ? "success"
        : "info"
    );
  }

  const resolveSavedMeetingId =
    useCallback(
      async () => {
        if (
          savedMeetingIdRef.current
        ) {
          return savedMeetingIdRef.current;
        }

        try {
          const stored =
            sessionStorage.getItem(
              ACTIVE_MEETING_SESSION_KEY
            );

          if (stored) {
            const parsed =
              JSON.parse(
                stored
              ) as {
                meetingId?: string;
                roomId?: string;
              };

            if (
              parsed.roomId ===
                roomId &&
              typeof parsed.meetingId ===
                "string" &&
              parsed.meetingId
            ) {
              savedMeetingIdRef.current =
                parsed.meetingId;

              return parsed.meetingId;
            }
          }
        } catch (error) {
          console.warn(
            "Não foi possível ler a reunião ativa:",
            error
          );
        }

        const {
          data:
            userData,
          error:
            userError,
        } =
          await supabase.auth.getUser();

        if (
          userError ||
          !userData.user
        ) {
          return null;
        }

        const {
          data,
          error,
        } =
          await supabase
            .from(
              "meetings"
            )
            .select(
              "id"
            )
            .eq(
              "room_id",
              roomId
            )
            .eq(
              "host_id",
              userData.user.id
            )
            .is(
              "ended_at",
              null
            )
            .maybeSingle();

        if (error) {
          console.error(
            "Erro ao localizar reunião salva:",
            error
          );

          return null;
        }

        if (!data?.id) {
          return null;
        }

        savedMeetingIdRef.current =
          data.id;

        return data.id;
      },
      [roomId]
    );

  const saveMeetingSnapshot =
    useCallback(
      async ({
        report,
        markEnded = false,
      }: {
        report?:
          MeetingReport | null;
        markEnded?: boolean;
      } = {}) => {
        if (
          !isHostRef.current
        ) {
          return false;
        }

        const meetingId =
          await resolveSavedMeetingId();

        if (!meetingId) {
          console.warn(
            "Nenhuma reunião salva foi encontrada para esta sala."
          );

          return false;
        }

        const transcript =
          transcriptEntriesRef.current.map(
            (entry) => ({
              id:
                entry.id,

              senderId:
                entry.senderId,

              senderName:
                entry.senderName,

              text:
                entry.text,

              time:
                entry.time,

              createdAt:
                entry.createdAt ??
                null,
            })
          );

        const participantMap =
          new Map<
            string,
            {
              name: string;
              role:
                | "host"
                | "participant";
            }
          >();

        const ownName =
          participantNameRef.current.trim();

        if (ownName) {
          participantMap.set(
            ownName.toLocaleLowerCase(
              "pt-BR"
            ),
            {
              name:
                ownName,

              role:
                "host",
            }
          );
        }

        remoteParticipantsRef.current.forEach(
          (participant) => {
            const name =
              participant.participantName.trim();

            if (!name) {
              return;
            }

            participantMap.set(
              name.toLocaleLowerCase(
                "pt-BR"
              ),
              {
                name,

                role:
                  participant.isHost
                    ? "host"
                    : "participant",
              }
            );
          }
        );

        report?.participants.forEach(
          (name) => {
            const normalizedName =
              String(name || "").trim();

            if (
              !normalizedName
            ) {
              return;
            }

            const key =
              normalizedName.toLocaleLowerCase(
                "pt-BR"
              );

            if (
              !participantMap.has(
                key
              )
            ) {
              participantMap.set(
                key,
                {
                  name:
                    normalizedName,

                  role:
                    normalizedName ===
                    ownName
                      ? "host"
                      : "participant",
                }
              );
            }
          }
        );

        const participants =
          Array.from(
            participantMap.values()
          );

        const durationSeconds =
          Math.max(
            0,
            report?.durationSeconds ??
              meetingSecondsRef.current
          );

        const fingerprint =
          JSON.stringify({
            transcriptIds:
              transcript.map(
                (entry) =>
                  entry.id
              ),

            participants,

            reportId:
              report?.id ??
              meetingReportRef.current?.id ??
              null,
          });

        if (
          !markEnded &&
          report === undefined &&
          fingerprint ===
            lastSavedSnapshotRef.current
        ) {
          return true;
        }

        const payload: {
          participants:
            {
              name: string;
              role:
                | "host"
                | "participant";
            }[];
          transcript:
            {
              id: string;
              senderId: string;
              senderName: string;
              text: string;
              time: string;
              createdAt:
                | number
                | null;
            }[];
          duration_seconds: number;
          report?:
            MeetingReport | null;
          ended_at?: string;
        } = {
          participants,
          transcript,
          duration_seconds:
            durationSeconds,
        };

        if (
          report !== undefined
        ) {
          payload.report =
            report;
        }

        if (markEnded) {
          payload.ended_at =
            new Date().toISOString();
        }

        const {
          error,
        } =
          await supabase
            .from(
              "meetings"
            )
            .update(
              payload
            )
            .eq(
              "id",
              meetingId
            );

        if (error) {
          console.error(
            "Erro ao salvar reunião no Supabase:",
            error
          );

          return false;
        }

        lastSavedSnapshotRef.current =
          fingerprint;

        return true;
      },
      [
        resolveSavedMeetingId,
      ]
    );

  useEffect(() => {
    if (
      !isHost ||
      transcriptEntries.length ===
        0
    ) {
      return;
    }

    if (
      meetingSaveTimerRef.current !==
      null
    ) {
      window.clearTimeout(
        meetingSaveTimerRef.current
      );
    }

    meetingSaveTimerRef.current =
      window.setTimeout(
        () => {
          meetingSaveTimerRef.current =
            null;

          void saveMeetingSnapshot();
        },
        1500
      );

    return () => {
      if (
        meetingSaveTimerRef.current !==
        null
      ) {
        window.clearTimeout(
          meetingSaveTimerRef.current
        );

        meetingSaveTimerRef.current =
          null;
      }
    };
  }, [
    isHost,
    transcriptEntries,
    saveMeetingSnapshot,
  ]);

  function generateMeetingReport() {
    const socket =
      socketRef.current;

    if (!isHost) {
      addNotification(
        "Apenas o anfitrião pode gerar o relatório.",
        "warning"
      );
      return;
    }

    if (
      transcriptEntries.length ===
      0
    ) {
      addNotification(
        "Ainda não há falas transcritas para gerar o relatório.",
        "warning"
      );
      return;
    }

    const reportIsCurrent =
      meetingReport &&
      meetingReport.transcriptEntryCount >=
        transcriptEntries.length;

    if (reportIsCurrent) {
      setIsReportOpen(
        true
      );
      return;
    }

    if (!socket) {
      addNotification(
        "A conexão da reunião não está disponível.",
        "warning"
      );
      return;
    }

    if (
      reportRequestTimerRef.current !==
      null
    ) {
      window.clearTimeout(
        reportRequestTimerRef.current
      );
    }

    setIsGeneratingReport(
      true
    );

    setIsReportOpen(
      true
    );

    setIsChatOpen(
      false
    );

    setIsTranscriptOpen(
      false
    );

    let requestFinished =
      false;

    reportRequestTimerRef.current =
      window.setTimeout(
        () => {
          if (requestFinished) {
            return;
          }

          requestFinished =
            true;

          reportRequestTimerRef.current =
            null;

          setIsGeneratingReport(
            false
          );

          addNotification(
            "A geração do relatório demorou demais. Tente novamente.",
            "warning"
          );
        },
        95000
      );

    socket.emit(
      "generate-meeting-report",
      {
        roomId,
      },
      (
        response:
          MeetingReportResponse
      ) => {
        if (requestFinished) {
          return;
        }

        requestFinished =
          true;

        if (
          reportRequestTimerRef.current !==
          null
        ) {
          window.clearTimeout(
            reportRequestTimerRef.current
          );

          reportRequestTimerRef.current =
            null;
        }

        setIsGeneratingReport(
          false
        );

        if (
          !response?.ok ||
          !response.report
        ) {
          setIsReportOpen(
            false
          );

          addNotification(
            response?.error ||
              "Não foi possível gerar o relatório.",
            "warning"
          );

          return;
        }

        setMeetingReport(
          response.report
        );

        meetingReportRef.current =
          response.report;

        void saveMeetingSnapshot({
          report:
            response.report,
        }).then(
          (saved) => {
            if (!saved) {
              addNotification(
                "O relatório foi gerado, mas não pôde ser salvo no histórico.",
                "warning"
              );
            }
          }
        );

        setIsReportOpen(
          true
        );

        addNotification(
          response.cached
            ? "Relatório carregado."
            : "Relatório da reunião gerado com sucesso.",
          "success"
        );
      }
    );
  }

  async function copyMeetingReport() {
    if (!meetingReport) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        formatMeetingReportText(
          meetingReport
        )
      );

      addNotification(
        "Relatório copiado.",
        "success"
      );
    } catch {
      addNotification(
        "Não foi possível copiar o relatório.",
        "warning"
      );
    }
  }



  function downloadMeetingReportPdf() {
    if (!meetingReport) {
      return;
    }

    try {
      const pdfBlob =
        createMeetingReportPdfBlob(
          meetingReport
        );

      const objectUrl =
        URL.createObjectURL(
          pdfBlob
        );

      const link =
        document.createElement(
          "a"
        );

      link.href = objectUrl;
      link.download =
        getMeetingReportPdfFileName(
          meetingReport
        );

      // Em navegadores móveis que ignoram o atributo download
      // para Blob URLs, target=_blank impede que a reunião seja
      // substituída pelo PDF na mesma aba.
      link.target = "_blank";
      link.rel =
        "noopener noreferrer";

      document.body.appendChild(
        link
      );

      link.click();
      link.remove();

      window.setTimeout(
        () => {
          URL.revokeObjectURL(
            objectUrl
          );
        },
        60000
      );

      addNotification(
        "PDF aberto/baixado sem sair da reunião.",
        "success"
      );
    } catch (error) {
      console.error(
        "Erro ao gerar PDF do relatório:",
        error
      );

      addNotification(
        "Não foi possível gerar o PDF do relatório.",
        "warning"
      );
    }
  }

  async function leaveMeeting() {
    if (
      isHostRef.current
    ) {
      await saveMeetingSnapshot({
        report:
          meetingReportRef.current,
        markEnded:
          true,
      });
    }

    const pipDocument =
      document as PictureInPictureDocument;

    if (
      pipDocument.pictureInPictureElement &&
      typeof pipDocument.exitPictureInPicture ===
        "function"
    ) {
      void pipDocument.exitPictureInPicture().catch(
        () => {}
      );
    }

    stopTranscription(
      true,
      "all"
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

    closeAllPeerConnections();

    socketRef.current?.disconnect();

    router.push(
      "/dashboard"
    );
  }

  const isAnyRemoteTranscribing =
    remoteParticipants.some(
      (participant) =>
        participant.isTranscribing
    );

  const totalVisibleParticipants =
    remoteParticipants.length + 1;

  const useOneToOneLayout =
    remoteParticipants.length === 1;

  const multiParticipantGridClass =
    totalVisibleParticipants <= 4
      ? "grid-cols-2 grid-rows-2"
      : "grid-cols-2 grid-rows-3 sm:grid-cols-3 sm:grid-rows-2";

  const sidePanelOpen =
    isChatOpen ||
    isTranscriptOpen;

  const glassPanel =
    "border border-white/10 bg-white/5 shadow-2xl shadow-black/20 backdrop-blur-2xl";

  const controlButton =
    "flex min-h-12 items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-sm font-semibold shadow-lg backdrop-blur-xl transition active:scale-95 sm:px-4";

  return (
    <main className="relative min-h-[100dvh] overflow-x-hidden bg-[#05070d] text-white">
      <video
        ref={
          pictureInPictureVideoRef
        }
        autoPlay
        playsInline
        muted
        aria-hidden="true"
        className="pointer-events-none fixed -left-[9999px] top-0 h-2 w-2 opacity-0"
      />
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

                {isHost && (
                  <span className="rounded-full border border-amber-400/15 bg-amber-500/10 px-3 py-1.5 text-amber-200">
                    👑 Anfitrião
                  </span>
                )}

                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                  👥{" "}
                  {
                    participantCount
                  }
                  /{MAX_ROOM_PARTICIPANTS}
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
          isAnyRemoteTranscribing ||
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
            Esta sala já possui 6 participantes.
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
                    ? "relative h-full w-full bg-black"
                    : "relative h-[68dvh] min-h-[380px] max-h-[680px] w-full bg-black sm:aspect-video sm:h-auto sm:min-h-[420px] sm:max-h-none lg:min-h-[540px]"
                }
              >
                {remoteParticipants.length === 0 ? (
                  <>
                    <div className="absolute inset-0 flex flex-col items-center justify-center px-5 text-center">
                      <div className="flex h-24 w-24 items-center justify-center rounded-full border border-white/10 bg-white/5 text-5xl">
                        👤
                      </div>

                      <p className="mt-4 text-lg font-semibold">
                        Aguardando participantes
                      </p>

                      <p className="mt-2 max-w-sm text-sm text-zinc-500">
                        A sala suporta até {MAX_ROOM_PARTICIPANTS} pessoas. Compartilhe o convite para começar.
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
                            attachLocalVideo
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
                            Você{isHost ? " • Anfitrião" : ""}
                          </span>

                          {!isMicOn && (
                            <span className="rounded-lg bg-yellow-500/40 px-2 py-1 text-[10px] backdrop-blur-md sm:text-xs">
                              🔇
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                ) : useOneToOneLayout ? (
                  <div className="grid h-full w-full grid-rows-2 gap-2 p-2 sm:block sm:p-0">
                    {remoteParticipants.map(
                      (participant) => {
                        const videoAvailable =
                          participant.mediaStatus.isCameraOn ||
                          participant.mediaStatus.isScreenSharing;

                        const connected =
                          remoteConnectionStates[
                            participant.participantId
                          ] === true;

                        return (
                          <div
                            key={
                              participant.participantId
                            }
                            className="relative min-h-0 overflow-hidden rounded-xl border border-white/10 bg-black sm:absolute sm:inset-0 sm:rounded-none sm:border-0"
                          >
                            <video
                              ref={
                                getRemoteVideoRef(
                                  participant.participantId
                                )
                              }
                              autoPlay
                              playsInline
                              className={`h-full w-full bg-black object-contain ${
                                videoAvailable
                                  ? ""
                                  : "hidden"
                              }`}
                            />

                            {!connected && (
                              <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950">
                                <div className="mb-3 h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-cyan-300" />

                                <span className="text-sm text-zinc-300">
                                  Conectando com {participant.participantName}...
                                </span>
                              </div>
                            )}

                            {connected &&
                              !videoAvailable && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950">
                                  <div className="flex h-24 w-24 items-center justify-center rounded-full border border-white/10 bg-white/5 text-5xl">
                                    👤
                                  </div>

                                  <p className="mt-4 text-lg font-semibold">
                                    {participant.participantName}
                                  </p>

                                  <p className="mt-1 text-sm text-zinc-500">
                                    Câmera desligada
                                  </p>
                                </div>
                              )}

                            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />

                            <div className="absolute bottom-3 left-3 z-20 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs backdrop-blur-xl sm:bottom-4 sm:left-4 sm:text-sm">
                              {participant.participantName}
                              {participant.isHost
                                ? " • Anfitrião"
                                : ""}
                            </div>

                            <div className="absolute left-3 top-3 z-20 flex flex-col items-start gap-2 sm:left-4 sm:top-4">
                              {!participant.mediaStatus.isMicOn && (
                                <span className="rounded-xl border border-yellow-300/10 bg-yellow-500/30 px-3 py-2 text-xs backdrop-blur-xl">
                                  🔇 Mudo
                                </span>
                              )}

                              {participant.mediaStatus.isScreenSharing && (
                                <span className="rounded-xl border border-purple-300/10 bg-purple-500/30 px-3 py-2 text-xs backdrop-blur-xl">
                                  🖥 Compartilhando tela
                                </span>
                              )}

                              {participant.isTranscribing && (
                                <span className="rounded-xl border border-cyan-300/10 bg-cyan-500/30 px-3 py-2 text-xs backdrop-blur-xl">
                                  🎙️ Live
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      }
                    )}

                    <div
                      className={`relative z-30 h-full w-full overflow-hidden rounded-xl border border-white/20 bg-black shadow-2xl shadow-black/60 backdrop-blur-xl sm:absolute sm:h-auto sm:rounded-2xl ${
                        isFullscreenLayout
                          ? "sm:bottom-5 sm:right-5 sm:w-[24vw] sm:min-w-[170px] sm:max-w-[360px]"
                          : "sm:bottom-5 sm:right-5 sm:w-[26%] sm:min-w-[120px] sm:max-w-[280px]"
                      }`}
                    >
                      <div className="relative h-full w-full overflow-hidden bg-black sm:aspect-video sm:h-auto">
                        <video
                          ref={
                            attachLocalVideo
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
                            Você{isHost ? " • Anfitrião" : ""}
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
                ) : (
                  <div
                    className={`grid h-full w-full gap-2 overflow-hidden p-2 sm:p-3 ${multiParticipantGridClass}`}
                  >
                    <div className="relative min-h-0 overflow-hidden rounded-xl border border-white/10 bg-black sm:rounded-2xl">
                      <video
                        ref={
                          attachLocalVideo
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
                            <div className="text-4xl">
                              👤
                            </div>

                            <p className="mt-2 text-xs text-zinc-400">
                              Câmera desligada
                            </p>
                          </div>
                        )}

                      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/80 to-transparent" />

                      <div className="absolute bottom-2 left-2 right-2 flex items-end justify-between gap-2">
                        <span className="truncate rounded-lg bg-black/50 px-2 py-1 text-xs backdrop-blur-md">
                          Você{isHost ? " • Anfitrião" : ""}
                        </span>

                        <div className="flex gap-1">
                          {!isMicOn && (
                            <span className="rounded-lg bg-yellow-500/40 px-2 py-1 text-xs">
                              🔇
                            </span>
                          )}

                          {isScreenSharing && (
                            <span className="rounded-lg bg-purple-500/40 px-2 py-1 text-xs">
                              🖥
                            </span>
                          )}

                          {isTranscribing && (
                            <span className="rounded-lg bg-cyan-500/40 px-2 py-1 text-xs">
                              🎙️
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {remoteParticipants.map(
                      (participant) => {
                        const videoAvailable =
                          participant.mediaStatus.isCameraOn ||
                          participant.mediaStatus.isScreenSharing;

                        const connected =
                          remoteConnectionStates[
                            participant.participantId
                          ] === true;

                        return (
                          <div
                            key={
                              participant.participantId
                            }
                            className="relative min-h-0 overflow-hidden rounded-xl border border-white/10 bg-black sm:rounded-2xl"
                          >
                            <video
                              ref={
                                getRemoteVideoRef(
                                  participant.participantId
                                )
                              }
                              autoPlay
                              playsInline
                              className={`h-full w-full bg-black object-contain ${
                                videoAvailable
                                  ? ""
                                  : "hidden"
                              }`}
                            />

                            {!connected && (
                              <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950 px-4 text-center">
                                <div className="mb-3 h-7 w-7 animate-spin rounded-full border-2 border-white/20 border-t-cyan-300" />

                                <span className="text-xs text-zinc-300">
                                  Conectando com {participant.participantName}...
                                </span>
                              </div>
                            )}

                            {connected &&
                              !videoAvailable && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950">
                                  <div className="text-4xl">
                                    👤
                                  </div>

                                  <p className="mt-2 max-w-[90%] truncate text-sm font-semibold">
                                    {participant.participantName}
                                  </p>

                                  <p className="mt-1 text-xs text-zinc-500">
                                    Câmera desligada
                                  </p>
                                </div>
                              )}

                            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/80 to-transparent" />

                            <div className="absolute bottom-2 left-2 right-2 flex items-end justify-between gap-2">
                              <span className="max-w-[72%] truncate rounded-lg bg-black/50 px-2 py-1 text-xs backdrop-blur-md">
                                {participant.participantName}
                                {participant.isHost
                                  ? " • Anfitrião"
                                  : ""}
                              </span>

                              <div className="flex gap-1">
                                {!participant.mediaStatus.isMicOn && (
                                  <span className="rounded-lg bg-yellow-500/40 px-2 py-1 text-xs">
                                    🔇
                                  </span>
                                )}

                                {participant.mediaStatus.isScreenSharing && (
                                  <span className="rounded-lg bg-purple-500/40 px-2 py-1 text-xs">
                                    🖥
                                  </span>
                                )}

                                {participant.isTranscribing && (
                                  <span className="rounded-lg bg-cyan-500/40 px-2 py-1 text-xs">
                                    🎙️
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      }
                    )}
                  </div>
                )}
              </div>

              {isCaptionsEnabled &&
                activeCaption && (
                  <div className="pointer-events-none absolute inset-x-3 bottom-4 z-40 flex justify-center sm:inset-x-8 sm:bottom-5">
                    <div className="max-w-4xl rounded-2xl border border-white/15 bg-black/80 px-4 py-3 text-center shadow-2xl backdrop-blur-xl sm:px-6 sm:py-4">
                      <div className="mb-1 flex items-center justify-center gap-2 text-[11px] font-semibold text-emerald-300 sm:text-xs">
                        <span>CC PT-BR</span>
                        <span className="text-zinc-500">
                          •
                        </span>
                        <span className="max-w-[52vw] truncate text-zinc-300">
                          {activeCaption.senderName}
                        </span>
                      </div>

                      {activeCaption.translatedText ? (
                        <>
                          {activeCaption.wasTranslated && (
                            <p className="mb-1 line-clamp-2 text-xs leading-relaxed text-zinc-400 sm:text-sm">
                              {activeCaption.originalText}
                            </p>
                          )}

                          <p className="text-base font-semibold leading-relaxed text-white sm:text-xl">
                            {activeCaption.translatedText}
                          </p>

                          {activeCaption.translationError && (
                            <p className="mt-1 text-[10px] text-yellow-300 sm:text-xs">
                              Tradução indisponível — exibindo o texto original.
                            </p>
                          )}
                        </>
                      ) : (
                        <>
                          <p className="text-base font-semibold leading-relaxed text-white sm:text-xl">
                            {activeCaption.originalText}
                          </p>

                          <p className="mt-1 text-[10px] text-emerald-300/80 sm:text-xs">
                            Traduzindo para português...
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                )}
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
                  void togglePictureInPicture()
                }
                className={`${controlButton} ${
                  isPictureInPicture
                    ? "border-cyan-300/25 bg-cyan-500/25"
                    : "border-cyan-400/15 bg-cyan-500/10"
                }`}
              >
                📺

                <span className="hidden sm:inline">
                  {isPictureInPicture
                    ? "Fechar miniatura"
                    : "Miniatura"}
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
                  isAssemblyConnecting &&
                  !isTranscribing
                }
                onClick={() => {
                  if (
                    isManualTranscriptionRequested
                  ) {
                    stopTranscription(
                      false,
                      "manual"
                    );
                  } else {
                    void startTranscription(
                      "manual"
                    );
                  }
                }}
                className={`${controlButton} ${
                  isManualTranscriptionRequested
                    ? "border-red-400/20 bg-red-500/25"
                    : "border-cyan-400/15 bg-cyan-500/10"
                } disabled:opacity-50`}
              >
                {isAssemblyConnecting &&
                !isTranscribing
                  ? "⌛"
                  : isManualTranscriptionRequested
                    ? "⏹"
                    : "📝"}

                <span className="hidden sm:inline">
                  {isAssemblyConnecting &&
                  !isTranscribing
                    ? "Conectando..."
                    : isManualTranscriptionRequested
                      ? "Parar transcrição"
                      : isTranscribing &&
                          isCaptionDemandActive
                        ? "Transcrição p/ legendas"
                        : "Transcrição Live"}
                </span>
              </button>

              <button
                type="button"
                onClick={
                  toggleCaptions
                }
                className={`${controlButton} ${
                  isCaptionsEnabled
                    ? "border-emerald-300/25 bg-emerald-500/25 text-emerald-50"
                    : "border-emerald-400/15 bg-emerald-500/10"
                }`}
              >
                CC

                <span className="hidden sm:inline">
                  {isCaptionsEnabled
                    ? "Legendas PT-BR"
                    : "Ativar legendas"}
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

              {isHost && (
                <button
                  type="button"
                  disabled={
                    isGeneratingReport ||
                    transcriptEntries.length ===
                      0
                  }
                  onClick={
                    generateMeetingReport
                  }
                  className={`${controlButton} border-amber-400/20 bg-amber-500/15 text-amber-100 disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  {isGeneratingReport
                    ? "✨"
                    : meetingReport &&
                        meetingReport.transcriptEntryCount >=
                          transcriptEntries.length
                      ? "📊"
                      : "✨"}

                  <span className="hidden sm:inline">
                    {isGeneratingReport
                      ? "Gerando relatório..."
                      : meetingReport &&
                          meetingReport.transcriptEntryCount >=
                            transcriptEntries.length
                        ? "Abrir relatório"
                        : meetingReport
                          ? "Atualizar relatório"
                          : "Gerar relatório"}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={() =>
                  void leaveMeeting()
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
              className={`fixed inset-2 z-50 flex min-h-0 flex-col overflow-hidden rounded-[1.5rem] ${glassPanel} xl:static xl:max-h-[720px] xl:min-h-[380px]`}
            >
              <div className="flex shrink-0 items-center justify-between border-b border-white/10 bg-[#0b0d14]/90 p-3 backdrop-blur-2xl sm:p-4">
                <div className="min-w-0">
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
                  aria-label="Fechar chat"
                  onClick={() =>
                    setIsChatOpen(
                      false
                    )
                  }
                  className="ml-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-lg transition hover:bg-white/20 active:scale-95"
                >
                  ✕
                </button>
              </div>

              <div
                ref={
                  chatScrollRef
                }
                className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-3 sm:p-4"
              >
                {messages.length ===
                  0 && (
                  <div className="flex min-h-[150px] flex-1 items-center justify-center text-sm text-zinc-500">
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
                className="shrink-0 border-t border-white/10 bg-[#0b0d14]/90 p-3 backdrop-blur-2xl"
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
                    className="h-12 w-12 shrink-0 rounded-2xl bg-blue-500/20 disabled:opacity-40"
                  >
                    ➤
                  </button>
                </div>
              </form>
            </aside>
          )}

          {isTranscriptOpen && (
            <aside
              className={`fixed inset-2 z-50 flex min-h-0 flex-col overflow-hidden rounded-[1.5rem] ${glassPanel} xl:static xl:max-h-[720px] xl:min-h-[410px]`}
            >
              <div className="flex shrink-0 items-center justify-between border-b border-white/10 bg-[#0b0d14]/90 p-3 backdrop-blur-2xl sm:p-4">
                <div className="min-w-0">
                  <h2 className="truncate font-semibold">
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
                  aria-label="Fechar transcrição"
                  onClick={() =>
                    setIsTranscriptOpen(
                      false
                    )
                  }
                  className="ml-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-lg transition hover:bg-white/20 active:scale-95"
                >
                  ✕
                </button>
              </div>

              <div className="shrink-0 border-b border-white/10 bg-black/20 px-3 py-2 text-xs sm:px-4 sm:py-3">
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
                className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-3 sm:p-4"
              >
                {transcriptEntries.length ===
                  0 &&
                !interimTranscript ? (
                  <div className="flex min-h-[150px] flex-1 flex-col items-center justify-center px-6 text-center">
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

              <div className="shrink-0 border-t border-white/10 bg-[#0b0d14]/90 p-2 backdrop-blur-2xl sm:p-3">
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

      {isReportOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-2 backdrop-blur-md sm:p-4">
          <section
            className={`flex max-h-[calc(100dvh-1rem)] w-full max-w-5xl flex-col overflow-hidden rounded-[1.6rem] sm:max-h-[calc(100dvh-2rem)] ${glassPanel}`}
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-[#0b0d14]/95 p-3 sm:p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-base font-bold sm:text-lg">
                    ✨ Relatório da reunião
                  </h2>

                  <span className="rounded-full border border-amber-400/15 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-200 sm:text-xs">
                    👑 Anfitrião
                  </span>
                </div>

                <p className="mt-1 text-xs text-zinc-500">
                  Resumo e análise gerados a partir da transcrição da reunião.
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {meetingReport &&
                  !isGeneratingReport && (
                    <>
                      <button
                        type="button"
                        onClick={
                          downloadMeetingReportPdf
                        }
                        className="hidden min-h-11 rounded-xl border border-emerald-400/20 bg-emerald-500/15 px-3 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/25 sm:block"
                      >
                        ⬇️ PDF
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          void copyMeetingReport()
                        }
                        className="hidden min-h-11 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-semibold transition hover:bg-white/10 sm:block"
                      >
                        📋 Copiar
                      </button>
                    </>
                  )}

                <button
                  type="button"
                  aria-label="Fechar relatório"
                  onClick={() =>
                    setIsReportOpen(
                      false
                    )
                  }
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-lg transition hover:bg-white/20 active:scale-95"
                >
                  ✕
                </button>
              </div>
            </div>

            {isGeneratingReport ? (
              <div className="flex min-h-[280px] flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-10 text-center">
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/15 border-t-amber-300" />

                <h3 className="mt-5 font-semibold text-amber-100">
                  Analisando a reunião...
                </h3>

                <p className="mt-2 max-w-md text-sm leading-relaxed text-zinc-500">
                  A IA está organizando o resumo, tópicos, decisões, próximos passos, análise da conversa e esclarecimentos.
                </p>
              </div>
            ) : meetingReport ? (
              <>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-5">
                  <div className="mx-auto flex max-w-4xl flex-col gap-4">
                    <div className="rounded-2xl border border-amber-400/15 bg-amber-500/[0.07] p-4 sm:p-5">
                      <h3 className="text-lg font-bold text-amber-100 sm:text-xl">
                        {meetingReport.title ||
                          "Relatório da reunião"}
                      </h3>

                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-400">
                        <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5">
                          📅 {formatReportDate(
                            meetingReport.startedAt
                          )}
                        </span>

                        <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5">
                          ⏱ {formatMeetingDuration(
                            meetingReport.durationSeconds
                          )}
                        </span>

                        <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5">
                          👥 {
                            meetingReport.participants.length
                          } participante(s)
                        </span>

                        <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5">
                          📝 {
                            meetingReport.transcriptEntryCount
                          } falas
                        </span>
                      </div>

                      {meetingReport.participants.length >
                        0 && (
                        <p className="mt-3 text-xs text-zinc-500">
                          Participantes: {
                            meetingReport.participants.join(
                              ", "
                            )
                          }
                        </p>
                      )}
                    </div>

                    <div className="rounded-2xl border border-blue-400/15 bg-blue-500/[0.06] p-4 sm:p-5">
                      <h3 className="font-semibold text-blue-200">
                        📌 Resumo executivo
                      </h3>

                      <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-zinc-200">
                        {meetingReport.executiveSummary}
                      </p>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:p-5">
                        <h3 className="font-semibold text-cyan-200">
                          🧩 Tópicos abordados
                        </h3>

                        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-zinc-300">
                          {meetingReport.topics.map(
                            (item, index) => (
                              <li
                                key={`topic-${index}`}
                                className="flex gap-2"
                              >
                                <span className="text-cyan-400">
                                  •
                                </span>
                                <span>{item}</span>
                              </li>
                            )
                          )}
                        </ul>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:p-5">
                        <h3 className="font-semibold text-violet-200">
                          🔎 Principais pontos
                        </h3>

                        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-zinc-300">
                          {meetingReport.keyPoints.map(
                            (item, index) => (
                              <li
                                key={`key-${index}`}
                                className="flex gap-2"
                              >
                                <span className="text-violet-400">
                                  •
                                </span>
                                <span>{item}</span>
                              </li>
                            )
                          )}
                        </ul>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-emerald-400/15 bg-emerald-500/[0.05] p-4 sm:p-5">
                      <h3 className="font-semibold text-emerald-200">
                        ✅ Decisões tomadas
                      </h3>

                      <ul className="mt-3 space-y-2 text-sm leading-relaxed text-zinc-300">
                        {meetingReport.decisions.map(
                          (item, index) => (
                            <li
                              key={`decision-${index}`}
                              className="flex gap-2"
                            >
                              <span className="text-emerald-400">
                                •
                              </span>
                              <span>{item}</span>
                            </li>
                          )
                        )}
                      </ul>
                    </div>

                    <div className="rounded-2xl border border-purple-400/15 bg-purple-500/[0.05] p-4 sm:p-5">
                      <h3 className="font-semibold text-purple-200">
                        🚀 Pendências e próximos passos
                      </h3>

                      <div className="mt-3 space-y-3">
                        {meetingReport.actionItems.map(
                          (item, index) => (
                            <div
                              key={`action-${index}`}
                              className="rounded-xl border border-white/10 bg-black/20 p-3"
                            >
                              <p className="text-sm leading-relaxed text-zinc-200">
                                {item.task}
                              </p>

                              <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-500">
                                <span className="rounded-lg bg-white/5 px-2 py-1">
                                  👤 {item.owner}
                                </span>

                                <span className="rounded-lg bg-white/5 px-2 py-1">
                                  📅 {item.deadline}
                                </span>
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-orange-400/15 bg-orange-500/[0.05] p-4 sm:p-5">
                      <h3 className="font-semibold text-orange-200">
                        🧠 Análise da conversa
                      </h3>

                      <div className="mt-4 space-y-4 text-sm leading-7 text-zinc-300">
                        <div>
                          <strong className="text-zinc-100">
                            Visão geral:
                          </strong>{" "}
                          {meetingReport.conversationAnalysis.overview}
                        </div>

                        <div>
                          <strong className="text-zinc-100">
                            Alinhamento:
                          </strong>{" "}
                          {meetingReport.conversationAnalysis.alignment}
                        </div>

                        <div>
                          <strong className="text-zinc-100">
                            Divergências:
                          </strong>{" "}
                          {meetingReport.conversationAnalysis.divergences}
                        </div>

                        <div>
                          <strong className="text-zinc-100">
                            Clareza da comunicação:
                          </strong>{" "}
                          {meetingReport.conversationAnalysis.communicationClarity}
                        </div>

                        <div>
                          <strong className="text-zinc-100">
                            Pontos de atenção:
                          </strong>

                          <ul className="mt-2 space-y-2">
                            {meetingReport.conversationAnalysis.risksAndAttentionPoints.map(
                              (item, index) => (
                                <li
                                  key={`risk-${index}`}
                                  className="flex gap-2"
                                >
                                  <span className="text-orange-400">
                                    •
                                  </span>
                                  <span>{item}</span>
                                </li>
                              )
                            )}
                          </ul>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-cyan-400/15 bg-cyan-500/[0.05] p-4 sm:p-5">
                      <h3 className="font-semibold text-cyan-200">
                        💡 Esclarecimentos
                      </h3>

                      <div className="mt-3 space-y-3">
                        {meetingReport.clarifications.map(
                          (item, index) => (
                            <div
                              key={`clarification-${index}`}
                              className="rounded-xl border border-white/10 bg-black/20 p-3"
                            >
                              <strong className="text-sm text-zinc-100">
                                {item.topic}
                              </strong>

                              <p className="mt-1 text-sm leading-relaxed text-zinc-400">
                                {item.explanation}
                              </p>
                            </div>
                          )
                        )}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-yellow-400/15 bg-yellow-500/[0.05] p-4 sm:p-5">
                      <h3 className="font-semibold text-yellow-200">
                        ⚠️ Pontos não definidos
                      </h3>

                      <ul className="mt-3 space-y-2 text-sm leading-relaxed text-zinc-300">
                        {meetingReport.unresolvedPoints.map(
                          (item, index) => (
                            <li
                              key={`unresolved-${index}`}
                              className="flex gap-2"
                            >
                              <span className="text-yellow-400">
                                •
                              </span>
                              <span>{item}</span>
                            </li>
                          )
                        )}
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap gap-2 border-t border-white/10 bg-[#0b0d14]/95 p-3 sm:p-4">
                  <button
                    type="button"
                    onClick={
                      downloadMeetingReportPdf
                    }
                    className="min-h-11 min-w-[140px] flex-1 rounded-xl border border-emerald-400/20 bg-emerald-500/15 px-4 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/25 active:scale-[0.99] sm:hidden"
                  >
                    ⬇️ Baixar PDF
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      void copyMeetingReport()
                    }
                    className="min-h-11 min-w-[140px] flex-1 rounded-xl border border-blue-400/20 bg-blue-500/15 px-4 text-sm font-semibold transition hover:bg-blue-500/25 active:scale-[0.99] sm:hidden"
                  >
                    📋 Copiar relatório
                  </button>

                  {meetingReport.transcriptEntryCount <
                    transcriptEntries.length && (
                    <button
                      type="button"
                      onClick={
                        generateMeetingReport
                      }
                      className="min-h-11 flex-1 rounded-xl border border-amber-400/20 bg-amber-500/15 px-4 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/25 active:scale-[0.99]"
                    >
                      ✨ Atualizar relatório
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="flex min-h-[260px] flex-1 flex-col items-center justify-center px-6 py-10 text-center">
                <div className="text-4xl">
                  📊
                </div>

                <p className="mt-3 text-sm text-zinc-300">
                  Nenhum relatório disponível.
                </p>
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}