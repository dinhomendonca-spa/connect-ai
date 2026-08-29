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

const httpServer = createServer((req, res) => {
  handle(req, res);
});

const io = new Server(httpServer, {
  maxHttpBufferSize: 10 * 1024 * 1024,
});

const MAX_PARTICIPANTS = 2;

const defaultMediaStatus = {
  isMicOn: true,
  isCameraOn: true,
  isScreenSharing: false,
};

const roomTranscripts = new Map();
const roomCleanupTimers = new Map();

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
    const room =
      io.sockets.adapter.rooms.get(roomName);

    if (!room || room.size === 0) {
      roomTranscripts.delete(roomName);
    }

    roomCleanupTimers.delete(roomName);
  }, 2 * 60 * 60 * 1000);

  roomCleanupTimers.set(roomName, timer);
}

function getRoomParticipants(
  roomName,
  excludedSocketId = null
) {
  const room =
    io.sockets.adapter.rooms.get(roomName);

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

function audioDataToBuffer(audioData) {
  if (!audioData) {
    return null;
  }

  if (Buffer.isBuffer(audioData)) {
    return audioData;
  }

  if (audioData instanceof ArrayBuffer) {
    return Buffer.from(audioData);
  }

  if (ArrayBuffer.isView(audioData)) {
    return Buffer.from(
      audioData.buffer,
      audioData.byteOffset,
      audioData.byteLength
    );
  }

  if (
    audioData.type === "Buffer" &&
    Array.isArray(audioData.data)
  ) {
    return Buffer.from(audioData.data);
  }

  return null;
}

function getAudioFileInfo(mimeType) {
  const normalized =
    String(mimeType || "").toLowerCase();

  if (
    normalized.includes("mp4") ||
    normalized.includes("m4a")
  ) {
    return {
      type: "audio/mp4",
      extension: "m4a",
    };
  }

  if (normalized.includes("ogg")) {
    return {
      type: "audio/ogg",
      extension: "ogg",
    };
  }

  return {
    type: "audio/webm",
    extension: "webm",
  };
}

async function transcribeWithGroq(
  audioBuffer,
  mimeType
) {
  const apiKey =
    process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error(
      "GROQ_API_KEY não configurada no servidor."
    );
  }

  const { type, extension } =
    getAudioFileInfo(mimeType);

  const formData = new FormData();

  const blob = new Blob(
    [audioBuffer],
    {
      type,
    }
  );

  formData.append(
    "file",
    blob,
    `connectai-audio.${extension}`
  );

  formData.append(
    "model",
    "whisper-large-v3"
  );

  formData.append(
    "language",
    "pt"
  );

  formData.append(
    "response_format",
    "json"
  );

  formData.append(
    "temperature",
    "0"
  );

  formData.append(
    "prompt",
    "Transcrição de uma reunião em português do Brasil. Preserve nomes próprios, termos técnicos, palavras de programação e pontuação natural."
  );

  const response = await fetch(
    "https://api.groq.com/openai/v1/audio/transcriptions",
    {
      method: "POST",

      headers: {
        Authorization: `Bearer ${apiKey}`,
      },

      body: formData,
    }
  );

  if (!response.ok) {
    const errorText =
      await response.text();

    throw new Error(
      `Groq ${response.status}: ${errorText.slice(
        0,
        500
      )}`
    );
  }

  const data =
    await response.json();

  if (
    typeof data?.text !== "string"
  ) {
    return "";
  }

  return data.text.trim();
}

function saveTranscriptEntry({
  socket,
  roomName,
  text,
  time,
  capturedAt,
}) {
  const participantName =
    normalizeParticipantName(
      socket.data.participantName,
      socket.id
    );

  const savedEntry = {
    id:
      `${Date.now()}-${socket.id}-${Math.random()}`,

    senderId:
      socket.id,

    senderName:
      participantName,

    text,

    time:
      time ||
      new Date().toLocaleTimeString(
        "pt-BR",
        {
          hour: "2-digit",
          minute: "2-digit",
        }
      ),

    createdAt:
      Number(capturedAt) ||
      Date.now(),
  };

  const transcript =
    getRoomTranscript(roomName);

  transcript.push(savedEntry);

  transcript.sort(
    (a, b) =>
      a.createdAt - b.createdAt
  );

  if (transcript.length > 2000) {
    transcript.splice(
      0,
      transcript.length - 2000
    );
  }

  console.log(
    `📝 ${participantName}: ${text}`
  );

  // Agora enviamos também para quem falou.
  // Assim todos recebem exatamente
  // a mesma versão criada pelo servidor.
  io.to(roomName).emit(
    "transcript-entry",
    savedEntry
  );
}

async function processTranscriptionChunk(
  socket,
  payload
) {
  const {
    roomId,
    audioData,
    mimeType,
    time,
    capturedAt,
  } = payload || {};

  if (!roomId || !audioData) {
    return;
  }

  const roomName =
    getRoomName(roomId);

  if (
    socket.data.roomName !== roomName
  ) {
    return;
  }

  if (
    socket.data.isTranscribing !== true
  ) {
    return;
  }

  const audioBuffer =
    audioDataToBuffer(audioData);

  if (
    !audioBuffer ||
    audioBuffer.length < 1000
  ) {
    return;
  }

  if (
    audioBuffer.length >
    8 * 1024 * 1024
  ) {
    socket.emit(
      "transcription-error",
      {
        message:
          "O trecho de áudio ficou grande demais.",
      }
    );

    return;
  }

  socket.emit(
    "transcription-processing",
    {
      active: true,
    }
  );

  try {
    const text =
      await transcribeWithGroq(
        audioBuffer,
        mimeType
      );

    if (!text) {
      return;
    }

    saveTranscriptEntry({
      socket,
      roomName,
      text,
      time,
      capturedAt,
    });
  } catch (error) {
    console.error(
      "❌ Erro na transcrição:",
      error
    );

    socket.emit(
      "transcription-error",
      {
        message:
          error instanceof Error
            ? error.message
            : "Erro ao transcrever o áudio.",
      }
    );
  } finally {
    socket.emit(
      "transcription-processing",
      {
        active: false,
      }
    );
  }
}

io.on("connection", (socket) => {
  console.log(
    "✅ Socket conectado:",
    socket.id
  );

  socket.data.mediaStatus = {
    ...defaultMediaStatus,
  };

  socket.data.isTranscribing =
    false;

  socket.data.transcriptionQueue =
    Promise.resolve();

  // ==================================================
  // ENTRAR NA SALA
  // ==================================================

  socket.on(
    "join-room",
    ({
      roomId,
      participantName,
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

      socket.data.roomName =
        roomName;

      socket.data.roomId =
        roomId;

      socket.data.participantName =
        normalizedName;

      socket.data.mediaStatus =
        normalizeMediaStatus(
          mediaStatus
        );

      socket.data.isTranscribing =
        false;

      const existingParticipants =
        getRoomParticipants(
          roomName
        );

      socket.join(roomName);

      console.log("");
      console.log(
        `👤 ${normalizedName} entrou na sala ${roomId}`
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
      if (
        !roomId ||
        !status
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
  // ÁUDIO PARA O WHISPER
  // ==================================================

  socket.on(
    "transcription-audio-chunk",
    (payload) => {
      socket.data.transcriptionQueue =
        socket.data.transcriptionQueue
          .then(() =>
            processTranscriptionChunk(
              socket,
              payload
            )
          )
          .catch((error) => {
            console.error(
              "Erro na fila de transcrição:",
              error
            );
          });
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
  // WEBRTC
  // ==================================================

  socket.on(
    "webrtc-offer",
    ({
      targetId,
      offer,
    }) => {
      if (
        !targetId ||
        !offer
      ) {
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