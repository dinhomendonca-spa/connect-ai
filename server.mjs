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
    const room = io.sockets.adapter.rooms.get(roomName);

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

      socket.data.roomName = roomName;
      socket.data.roomId = roomId;

      socket.data.participantName =
        normalizedName;

      socket.data.mediaStatus =
        normalizeMediaStatus(mediaStatus);

      socket.data.isTranscribing =
        false;

      const existingParticipants =
        getRoomParticipants(roomName);

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