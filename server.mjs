import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = Number(process.env.PORT || 3000);

const app = next({
  dev,
  hostname,
  port,
});

const handle = app.getRequestHandler();

await app.prepare();

const MAX_PARTICIPANTS = 2;
const MAX_REPORT_TRANSCRIPT_CHARS = 380000;

const defaultMediaStatus = {
  isMicOn: true,
  isCameraOn: true,
  isScreenSharing: false,
};

const roomTranscripts = new Map();
const roomCleanupTimers = new Map();
const roomHostSessions = new Map();
const roomStartedAt = new Map();
const roomReports = new Map();
const roomReportPromises = new Map();

function getRoomName(roomId) {
  return `meeting:${roomId}`;
}

function normalizeParticipantName(name, socketId) {
  if (typeof name === "string") {
    const normalized = name
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 80);

    if (normalized) {
      return normalized;
    }
  }

  const shortId = String(socketId)
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(-4)
    .toUpperCase();

  return shortId
    ? `Participante-${shortId}`
    : "Participante";
}

function normalizeParticipantSessionId(value, socketId) {
  if (typeof value === "string") {
    const normalized = value
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .slice(0, 120);

    if (normalized) {
      return normalized;
    }
  }

  return `socket-${socketId}`;
}

function normalizeMediaStatus(
  status,
  fallback = defaultMediaStatus
) {
  return {
    isMicOn:
      typeof status?.isMicOn === "boolean"
        ? status.isMicOn
        : fallback.isMicOn,

    isCameraOn:
      typeof status?.isCameraOn === "boolean"
        ? status.isCameraOn
        : fallback.isCameraOn,

    isScreenSharing:
      typeof status?.isScreenSharing === "boolean"
        ? status.isScreenSharing
        : fallback.isScreenSharing,
  };
}

function getRoomTranscript(roomName) {
  if (!roomTranscripts.has(roomName)) {
    roomTranscripts.set(roomName, []);
  }

  return roomTranscripts.get(roomName);
}

function cancelRoomCleanup(roomName) {
  const timer = roomCleanupTimers.get(roomName);

  if (!timer) {
    return;
  }

  clearTimeout(timer);
  roomCleanupTimers.delete(roomName);
}

function scheduleRoomCleanup(roomName) {
  cancelRoomCleanup(roomName);

  const timer = setTimeout(() => {
    const room = io.sockets.adapter.rooms.get(roomName);

    if (!room || room.size === 0) {
      roomTranscripts.delete(roomName);
      roomHostSessions.delete(roomName);
      roomStartedAt.delete(roomName);
      roomReports.delete(roomName);
      roomReportPromises.delete(roomName);
    }

    roomCleanupTimers.delete(roomName);
  }, 2 * 60 * 60 * 1000);

  roomCleanupTimers.set(roomName, timer);
}

function getRoomParticipants(
  roomName,
  excludedSocketId = null
) {
  const room = io.sockets.adapter.rooms.get(roomName);

  if (!room) {
    return [];
  }

  return Array.from(room)
    .filter(
      (participantId) =>
        participantId !== excludedSocketId
    )
    .map((participantId) => {
      const participantSocket =
        io.sockets.sockets.get(participantId);

      if (!participantSocket) {
        return null;
      }

      return {
        participantId,

        participantName:
          normalizeParticipantName(
            participantSocket.data.participantName,
            participantId
          ),

        mediaStatus:
          participantSocket.data.mediaStatus ||
          defaultMediaStatus,

        isTranscribing:
          participantSocket.data.isTranscribing ??
          false,

        isHost:
          participantSocket.data.isHost === true,
      };
    })
    .filter(Boolean);
}

function broadcastRoomState(roomName) {
  const participants =
    getRoomParticipants(roomName);

  io.to(roomName).emit(
    "room-participants-state",
    {
      count: participants.length,
      participants,
    }
  );

  io.to(roomName).emit(
    "room-participants",
    {
      count: participants.length,
    }
  );
}

function formatTranscriptForReport(transcript) {
  return transcript
    .map((entry) => {
      const time = entry.time || "--:--";
      const name = entry.senderName || "Participante";
      const text = String(entry.text || "").trim();

      return `[${time}] ${name}: ${text}`;
    })
    .join("\n");
}

function getReportParticipants(roomName, transcript) {
  const names = new Set();

  for (const entry of transcript) {
    if (entry.senderName) {
      names.add(String(entry.senderName));
    }
  }

  for (const participant of getRoomParticipants(roomName)) {
    if (participant?.participantName) {
      names.add(participant.participantName);
    }
  }

  return Array.from(names);
}

function getMeetingDurationSeconds(roomName, transcript) {
  const startedAt =
    roomStartedAt.get(roomName) ||
    transcript[0]?.createdAt ||
    Date.now();

  const lastTranscriptAt =
    transcript[transcript.length - 1]?.createdAt ||
    Date.now();

  const endedAt = Math.max(
    Date.now(),
    Number(lastTranscriptAt) || 0
  );

  return Math.max(
    0,
    Math.floor((endedAt - startedAt) / 1000)
  );
}

const meetingReportSchema = {
  type: "object",
  properties: {
    title: {
      type: "string",
    },
    executiveSummary: {
      type: "string",
    },
    topics: {
      type: "array",
      items: {
        type: "string",
      },
    },
    keyPoints: {
      type: "array",
      items: {
        type: "string",
      },
    },
    decisions: {
      type: "array",
      items: {
        type: "string",
      },
    },
    actionItems: {
      type: "array",
      items: {
        type: "object",
        properties: {
          task: {
            type: "string",
          },
          owner: {
            type: "string",
          },
          deadline: {
            type: "string",
          },
        },
        required: [
          "task",
          "owner",
          "deadline",
        ],
        additionalProperties: false,
      },
    },
    conversationAnalysis: {
      type: "object",
      properties: {
        overview: {
          type: "string",
        },
        alignment: {
          type: "string",
        },
        divergences: {
          type: "string",
        },
        communicationClarity: {
          type: "string",
        },
        risksAndAttentionPoints: {
          type: "array",
          items: {
            type: "string",
          },
        },
      },
      required: [
        "overview",
        "alignment",
        "divergences",
        "communicationClarity",
        "risksAndAttentionPoints",
      ],
      additionalProperties: false,
    },
    clarifications: {
      type: "array",
      items: {
        type: "object",
        properties: {
          topic: {
            type: "string",
          },
          explanation: {
            type: "string",
          },
        },
        required: [
          "topic",
          "explanation",
        ],
        additionalProperties: false,
      },
    },
    unresolvedPoints: {
      type: "array",
      items: {
        type: "string",
      },
    },
  },
  required: [
    "title",
    "executiveSummary",
    "topics",
    "keyPoints",
    "decisions",
    "actionItems",
    "conversationAnalysis",
    "clarifications",
    "unresolvedPoints",
  ],
  additionalProperties: false,
};

async function generateMeetingReport(roomName, roomId) {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error(
      "GROQ_API_KEY não configurada no servidor."
    );
  }

  const transcript = [
    ...getRoomTranscript(roomName),
  ].sort(
    (a, b) =>
      (a.createdAt || 0) -
      (b.createdAt || 0)
  );

  if (transcript.length === 0) {
    throw new Error(
      "Ainda não há transcrição suficiente para gerar o relatório."
    );
  }

  const transcriptText =
    formatTranscriptForReport(transcript);

  if (
    transcriptText.length >
    MAX_REPORT_TRANSCRIPT_CHARS
  ) {
    throw new Error(
      "A transcrição ficou grande demais para gerar o relatório de uma só vez."
    );
  }

  const participants =
    getReportParticipants(
      roomName,
      transcript
    );

  const startedAt =
    roomStartedAt.get(roomName) ||
    transcript[0]?.createdAt ||
    Date.now();

  const durationSeconds =
    getMeetingDurationSeconds(
      roomName,
      transcript
    );

  const model =
    process.env.GROQ_MODEL ||
    "openai/gpt-oss-120b";

  const controller =
    new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    90000
  );

  try {
    const groqResponse = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          reasoning_effort: "medium",
          temperature: 0.2,
          messages: [
            {
              role: "system",
              content: [
                "Você é um analista profissional de reuniões.",
                "Crie o relatório exclusivamente a partir da transcrição fornecida.",
                "Nunca invente fatos, decisões, responsáveis, prazos ou intenções.",
                "Quando algo não estiver definido, escreva exatamente: Não definido durante a reunião.",
                "Diferencie claramente fatos discutidos, decisões tomadas e pontos pendentes.",
                "Em análise da conversa, descreva apenas aspectos observáveis da comunicação, como clareza, alinhamento, divergências e pontos de atenção.",
                "Não faça diagnósticos, julgamentos de personalidade ou inferências sobre características pessoais dos participantes.",
                "Escreva todo o conteúdo em português do Brasil, com linguagem profissional, clara e objetiva.",
              ].join(" "),
            },
            {
              role: "user",
              content: [
                `Sala: ${roomId}`,
                `Participantes: ${
                  participants.length > 0
                    ? participants.join(", ")
                    : "Não definido durante a reunião."
                }`,
                `Início: ${new Date(
                  startedAt
                ).toLocaleString("pt-BR")}`,
                `Duração aproximada em segundos: ${durationSeconds}`,
                "",
                "TRANSCRIÇÃO COMPLETA:",
                transcriptText,
              ].join("\n"),
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "meeting_report",
              strict: true,
              schema: meetingReportSchema,
            },
          },
        }),
      }
    );

    const groqData =
      await groqResponse.json();

    if (!groqResponse.ok) {
      console.error(
        "❌ Erro Groq ao gerar relatório:",
        groqData
      );

      throw new Error(
        groqData?.error?.message ||
          "Não foi possível gerar o relatório com a IA."
      );
    }

    const content =
      groqData?.choices?.[0]?.message?.content;

    if (
      typeof content !== "string" ||
      !content.trim()
    ) {
      throw new Error(
        "A IA não retornou um relatório válido."
      );
    }

    const aiReport =
      JSON.parse(content);

    return {
      id: `report-${Date.now()}`,
      roomId,
      generatedAt: Date.now(),
      startedAt,
      durationSeconds,
      participants,
      transcriptEntryCount:
        transcript.length,
      ...aiReport,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "AbortError"
    ) {
      throw new Error(
        "A geração do relatório demorou demais. Tente novamente."
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// ==================================================
// HTTP
// ==================================================

const httpServer = createServer(
  async (req, res) => {
    try {
      const requestUrl = new URL(
        req.url || "/",
        `http://${req.headers.host || "localhost"}`
      );

      // ==============================================
      // TOKEN TEMPORÁRIO DA ASSEMBLYAI
      // ==============================================

      if (
        req.method === "GET" &&
        requestUrl.pathname ===
          "/api/assemblyai-token"
      ) {
        res.setHeader(
          "Cache-Control",
          "no-store, no-cache, must-revalidate"
        );

        res.setHeader(
          "Content-Type",
          "application/json; charset=utf-8"
        );

        const apiKey =
          process.env.ASSEMBLYAI_API_KEY;

        if (!apiKey) {
          res.statusCode = 500;

          res.end(
            JSON.stringify({
              error:
                "ASSEMBLYAI_API_KEY não configurada no servidor.",
            })
          );

          return;
        }

        const tokenUrl =
          new URL(
            "https://streaming.assemblyai.com/v3/token"
          );

        tokenUrl.searchParams.set(
          "expires_in_seconds",
          "60"
        );

        tokenUrl.searchParams.set(
          "max_session_duration_seconds",
          "10800"
        );

        const assemblyResponse =
          await fetch(tokenUrl, {
            headers: {
              Authorization: apiKey,
            },
          });

        const responseText =
          await assemblyResponse.text();

        if (!assemblyResponse.ok) {
          console.error(
            "❌ Erro ao gerar token AssemblyAI:",
            responseText
          );

          res.statusCode =
            assemblyResponse.status;

          res.end(
            JSON.stringify({
              error:
                "Não foi possível gerar o token da AssemblyAI.",
            })
          );

          return;
        }

        res.statusCode = 200;
        res.end(responseText);

        return;
      }

      await handle(req, res);
    } catch (error) {
      console.error(
        "Erro HTTP:",
        error
      );

      if (!res.headersSent) {
        res.statusCode = 500;

        res.setHeader(
          "Content-Type",
          "application/json; charset=utf-8"
        );
      }

      res.end(
        JSON.stringify({
          error:
            "Erro interno do servidor.",
        })
      );
    }
  }
);

// ==================================================
// SOCKET.IO
// ==================================================

const io = new Server(httpServer);

io.on("connection", (socket) => {
  console.log(
    "✅ Socket conectado:",
    socket.id
  );

  socket.data.mediaStatus = {
    ...defaultMediaStatus,
  };

  socket.data.isTranscribing = false;
  socket.data.isHost = false;

  // ==================================================
  // ENTRAR NA SALA
  // ==================================================

  socket.on(
    "join-room",
    ({
      roomId,
      participantName,
      participantSessionId,
      mediaStatus,
    }) => {
      if (!roomId) {
        return;
      }

      const roomName =
        getRoomName(roomId);

      cancelRoomCleanup(roomName);

      const currentRoom =
        io.sockets.adapter.rooms.get(
          roomName
        );

      const existingParticipantIds =
        currentRoom
          ? Array.from(currentRoom)
          : [];

      if (
        existingParticipantIds.length >=
        MAX_PARTICIPANTS
      ) {
        socket.emit("room-full");
        return;
      }

      const normalizedName =
        normalizeParticipantName(
          participantName,
          socket.id
        );

      const normalizedSessionId =
        normalizeParticipantSessionId(
          participantSessionId,
          socket.id
        );

      if (
        !roomHostSessions.has(
          roomName
        )
      ) {
        roomHostSessions.set(
          roomName,
          normalizedSessionId
        );

        roomStartedAt.set(
          roomName,
          Date.now()
        );
      }

      const isHost =
        roomHostSessions.get(
          roomName
        ) === normalizedSessionId;

      socket.data.roomName = roomName;
      socket.data.roomId = roomId;

      socket.data.participantName =
        normalizedName;

      socket.data.participantSessionId =
        normalizedSessionId;

      socket.data.isHost = isHost;

      socket.data.mediaStatus =
        normalizeMediaStatus(mediaStatus);

      socket.data.isTranscribing =
        false;

      const existingParticipants =
        getRoomParticipants(roomName);

      socket.join(roomName);

      console.log("");
      console.log(
        `👤 ${normalizedName} entrou na sala ${roomId}${
          isHost ? " como anfitrião" : ""
        }`
      );
      console.log(
        `🆔 Socket: ${socket.id}`
      );
      console.log("");

      socket.emit(
        "participant-identity",
        {
          participantId:
            socket.id,

          participantName:
            normalizedName,

          isHost,
        }
      );

      socket.emit(
        "existing-participants",
        {
          participants:
            existingParticipants,
        }
      );

      socket.emit(
        "transcript-history",
        {
          entries:
            getRoomTranscript(
              roomName
            ),
        }
      );

      if (
        isHost &&
        roomReports.has(roomName)
      ) {
        socket.emit(
          "meeting-report-ready",
          {
            report:
              roomReports.get(
                roomName
              ),
            cached: true,
          }
        );
      }

      socket
        .to(roomName)
        .emit(
          "participant-joined",
          {
            participantId:
              socket.id,

            participantName:
              normalizedName,

            mediaStatus:
              socket.data.mediaStatus,

            isTranscribing:
              false,

            isHost,
          }
        );

      broadcastRoomState(roomName);
    }
  );

  // ==================================================
  // STATUS DE MÍDIA
  // ==================================================

  socket.on(
    "media-status-change",
    ({
      roomId,
      status,
    }) => {
      if (!roomId || !status) {
        return;
      }

      const roomName =
        getRoomName(roomId);

      if (
        socket.data.roomName !==
        roomName
      ) {
        return;
      }

      const nextStatus =
        normalizeMediaStatus(
          status,
          socket.data.mediaStatus ||
            defaultMediaStatus
        );

      socket.data.mediaStatus =
        nextStatus;

      socket
        .to(roomName)
        .emit(
          "participant-media-status",
          {
            participantId:
              socket.id,

            participantName:
              normalizeParticipantName(
                socket.data
                  .participantName,
                socket.id
              ),

            mediaStatus:
              nextStatus,
          }
        );
    }
  );

  // ==================================================
  // STATUS DA TRANSCRIÇÃO
  // ==================================================

  socket.on(
    "transcription-status-change",
    ({
      roomId,
      isTranscribing,
    }) => {
      if (
        !roomId ||
        typeof isTranscribing !==
          "boolean"
      ) {
        return;
      }

      const roomName =
        getRoomName(roomId);

      if (
        socket.data.roomName !==
        roomName
      ) {
        return;
      }

      socket.data.isTranscribing =
        isTranscribing;

      socket
        .to(roomName)
        .emit(
          "participant-transcription-status",
          {
            participantId:
              socket.id,

            participantName:
              normalizeParticipantName(
                socket.data
                  .participantName,
                socket.id
              ),

            isTranscribing,
          }
        );

      broadcastRoomState(roomName);
    }
  );

  // ==================================================
  // FALA FINAL DA ASSEMBLYAI
  // ==================================================

  socket.on(
    "transcript-entry",
    ({
      roomId,
      entry,
    }) => {
      if (
        !roomId ||
        !entry?.text
      ) {
        return;
      }

      const roomName =
        getRoomName(roomId);

      if (
        socket.data.roomName !==
        roomName
      ) {
        return;
      }

      const text =
        String(entry.text)
          .trim()
          .slice(0, 5000);

      if (!text) {
        return;
      }

      const participantName =
        normalizeParticipantName(
          socket.data.participantName,
          socket.id
        );

      const savedEntry = {
        id:
          entry.id ||
          `${Date.now()}-${socket.id}`,

        senderId:
          socket.id,

        senderName:
          participantName,

        text,

        time:
          entry.time ||
          new Date()
            .toLocaleTimeString(
              "pt-BR",
              {
                hour: "2-digit",
                minute: "2-digit",
              }
            ),

        createdAt:
          Number(
            entry.createdAt
          ) || Date.now(),
      };

      const transcript =
        getRoomTranscript(roomName);

      const alreadyExists =
        transcript.some(
          (item) =>
            item.id ===
            savedEntry.id
        );

      if (alreadyExists) {
        return;
      }

      transcript.push(savedEntry);

      transcript.sort(
        (a, b) =>
          a.createdAt -
          b.createdAt
      );

      if (
        transcript.length > 2000
      ) {
        transcript.splice(
          0,
          transcript.length -
            2000
        );
      }

      roomReports.delete(roomName);

      console.log(
        `📝 ${participantName}: ${text}`
      );

      io.to(roomName).emit(
        "transcript-entry",
        savedEntry
      );
    }
  );

  socket.on(
    "request-transcript",
    ({ roomId }) => {
      if (!roomId) {
        return;
      }

      const roomName =
        getRoomName(roomId);

      if (
        socket.data.roomName !==
        roomName
      ) {
        return;
      }

      socket.emit(
        "transcript-history",
        {
          entries:
            getRoomTranscript(
              roomName
            ),
        }
      );
    }
  );

  // ==================================================
  // RELATÓRIO DA REUNIÃO - SOMENTE ANFITRIÃO
  // ==================================================

  socket.on(
    "generate-meeting-report",
    async (
      { roomId } = {},
      callback
    ) => {
      const respond =
        typeof callback === "function"
          ? callback
          : () => {};

      if (!roomId) {
        respond({
          ok: false,
          error:
            "Sala inválida.",
        });
        return;
      }

      const roomName =
        getRoomName(roomId);

      if (
        socket.data.roomName !==
        roomName
      ) {
        respond({
          ok: false,
          error:
            "Você não está nesta sala.",
        });
        return;
      }

      if (
        socket.data.isHost !== true
      ) {
        respond({
          ok: false,
          error:
            "Apenas o anfitrião pode gerar o relatório da reunião.",
        });
        return;
      }

      const transcript =
        getRoomTranscript(roomName);

      if (
        transcript.length === 0
      ) {
        respond({
          ok: false,
          error:
            "Ainda não há falas transcritas para analisar.",
        });
        return;
      }

      const cachedReport =
        roomReports.get(roomName);

      if (cachedReport) {
        respond({
          ok: true,
          report:
            cachedReport,
          cached: true,
        });
        return;
      }

      try {
        let reportPromise =
          roomReportPromises.get(
            roomName
          );

        if (!reportPromise) {
          reportPromise =
            generateMeetingReport(
              roomName,
              roomId
            );

          roomReportPromises.set(
            roomName,
            reportPromise
          );
        }

        const report =
          await reportPromise;

        roomReports.set(
          roomName,
          report
        );

        respond({
          ok: true,
          report,
          cached: false,
        });
      } catch (error) {
        console.error(
          "❌ Erro ao gerar relatório:",
          error
        );

        respond({
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "Não foi possível gerar o relatório.",
        });
      } finally {
        roomReportPromises.delete(
          roomName
        );
      }
    }
  );

  // ==================================================
  // WEBRTC
  // ==================================================

  socket.on(
    "webrtc-offer",
    ({
      targetId,
      offer,
    }) => {
      if (!targetId || !offer) {
        return;
      }

      io.to(targetId).emit(
        "webrtc-offer",
        {
          senderId:
            socket.id,

          senderName:
            normalizeParticipantName(
              socket.data
                .participantName,
              socket.id
            ),

          offer,
        }
      );
    }
  );

  socket.on(
    "webrtc-answer",
    ({
      targetId,
      answer,
    }) => {
      if (
        !targetId ||
        !answer
      ) {
        return;
      }

      io.to(targetId).emit(
        "webrtc-answer",
        {
          senderId:
            socket.id,

          senderName:
            normalizeParticipantName(
              socket.data
                .participantName,
              socket.id
            ),

          answer,
        }
      );
    }
  );

  socket.on(
    "webrtc-ice-candidate",
    ({
      targetId,
      candidate,
    }) => {
      if (
        !targetId ||
        !candidate
      ) {
        return;
      }

      io.to(targetId).emit(
        "webrtc-ice-candidate",
        {
          senderId:
            socket.id,

          candidate,
        }
      );
    }
  );

  // ==================================================
  // CHAT
  // ==================================================

  socket.on(
    "send-chat-message",
    ({
      roomId,
      message,
    }) => {
      if (
        !roomId ||
        !message?.text
      ) {
        return;
      }

      const roomName =
        getRoomName(roomId);

      if (
        socket.data.roomName !==
        roomName
      ) {
        return;
      }

      const participantName =
        normalizeParticipantName(
          socket.data.participantName,
          socket.id
        );

      socket
        .to(roomName)
        .emit(
          "chat-message",
          {
            ...message,

            senderId:
              socket.id,

            senderName:
              participantName,
          }
        );
    }
  );

  // ==================================================
  // SAÍDA
  // ==================================================

  socket.on(
    "disconnecting",
    () => {
      const roomName =
        socket.data.roomName;

      if (!roomName) {
        return;
      }

      const participantName =
        normalizeParticipantName(
          socket.data.participantName,
          socket.id
        );

      const remainingParticipants =
        getRoomParticipants(
          roomName,
          socket.id
        );

      socket
        .to(roomName)
        .emit(
          "participant-left",
          {
            participantId:
              socket.id,

            participantName,
          }
        );

      socket
        .to(roomName)
        .emit(
          "room-participants-state",
          {
            count:
              remainingParticipants.length,

            participants:
              remainingParticipants,
          }
        );

      socket
        .to(roomName)
        .emit(
          "room-participants",
          {
            count:
              remainingParticipants.length,
          }
        );

      if (
        remainingParticipants.length ===
        0
      ) {
        scheduleRoomCleanup(
          roomName
        );
      }
    }
  );

  socket.on(
    "disconnect",
    () => {
      console.log(
        "❌ Socket desconectado:",
        socket.id
      );
    }
  );
});

// ==================================================
// INICIAR SERVIDOR
// ==================================================

httpServer.listen(
  port,
  hostname,
  () => {
    console.log("");
    console.log(
      "🚀 ConnectAI iniciado"
    );
    console.log(
      `🌐 Local: http://localhost:${port}`
    );
    console.log("");
  }
);