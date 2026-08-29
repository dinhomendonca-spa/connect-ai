import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";

const dev =
  process.env.NODE_ENV !== "production";

const hostname = "0.0.0.0";

const port = Number(
  process.env.PORT || 3000
);

const app = next({
  dev,
  hostname,
  port,
});

const handle =
  app.getRequestHandler();

await app.prepare();

const httpServer =
  createServer((req, res) => {
    handle(req, res);
  });

const io = new Server(
  httpServer
);

// ==================================================
// CONFIGURAÇÕES
// ==================================================

const MAX_PARTICIPANTS = 2;

const defaultMediaStatus = {
  isMicOn: true,
  isCameraOn: true,
  isScreenSharing: false,
};

// ==================================================
// TRANSCRIÇÕES
// ==================================================

const roomTranscripts =
  new Map();

const roomCleanupTimers =
  new Map();

// ==================================================
// HELPERS
// ==================================================

function getRoomName(roomId) {
  return `meeting:${roomId}`;
}

function normalizeParticipantName(
  name,
  socketId
) {
  if (
    typeof name === "string"
  ) {
    const normalized =
      name
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 80);

    if (normalized) {
      return normalized;
    }
  }

  const shortId =
    String(socketId)
      .replace(
        /[^a-zA-Z0-9]/g,
        ""
      )
      .slice(-4)
      .toUpperCase();

  return shortId
    ? `Participante-${shortId}`
    : "Participante";
}

function normalizeMediaStatus(
  status,
  fallback =
    defaultMediaStatus
) {
  return {
    isMicOn:
      typeof status?.isMicOn ===
      "boolean"
        ? status.isMicOn
        : fallback.isMicOn,

    isCameraOn:
      typeof status?.isCameraOn ===
      "boolean"
        ? status.isCameraOn
        : fallback.isCameraOn,

    isScreenSharing:
      typeof status
        ?.isScreenSharing ===
      "boolean"
        ? status.isScreenSharing
        : fallback.isScreenSharing,
  };
}

function getRoomTranscript(
  roomName
) {
  if (
    !roomTranscripts.has(
      roomName
    )
  ) {
    roomTranscripts.set(
      roomName,
      []
    );
  }

  return roomTranscripts.get(
    roomName
  );
}

function cancelRoomCleanup(
  roomName
) {
  const timer =
    roomCleanupTimers.get(
      roomName
    );

  if (!timer) {
    return;
  }

  clearTimeout(timer);

  roomCleanupTimers.delete(
    roomName
  );
}

function scheduleRoomCleanup(
  roomName
) {
  cancelRoomCleanup(
    roomName
  );

  const timer =
    setTimeout(() => {
      const room =
        io.sockets.adapter.rooms.get(
          roomName
        );

      if (
        !room ||
        room.size === 0
      ) {
        roomTranscripts.delete(
          roomName
        );
      }

      roomCleanupTimers.delete(
        roomName
      );
    }, 2 * 60 * 60 * 1000);

  roomCleanupTimers.set(
    roomName,
    timer
  );
}

// ==================================================
// ESTADO COMPLETO DOS PARTICIPANTES
// ==================================================

function getRoomParticipants(
  roomName,
  excludedSocketId = null
) {
  const room =
    io.sockets.adapter.rooms.get(
      roomName
    );

  if (!room) {
    return [];
  }

  return Array.from(room)
    .filter(
      (participantId) =>
        participantId !==
        excludedSocketId
    )
    .map(
      (participantId) => {
        const participantSocket =
          io.sockets.sockets.get(
            participantId
          );

        if (
          !participantSocket
        ) {
          return null;
        }

        return {
          participantId,

          participantName:
            normalizeParticipantName(
              participantSocket
                .data
                .participantName,
              participantId
            ),

          mediaStatus:
            participantSocket
              .data
              .mediaStatus ||
            defaultMediaStatus,

          isTranscribing:
            participantSocket
              .data
              .isTranscribing ??
            false,
        };
      }
    )
    .filter(Boolean);
}

function broadcastRoomState(
  roomName
) {
  const participants =
    getRoomParticipants(
      roomName
    );

  io.to(roomName).emit(
    "room-participants-state",
    {
      count:
        participants.length,

      participants,
    }
  );

  io.to(roomName).emit(
    "room-participants",
    {
      count:
        participants.length,
    }
  );
}

// ==================================================
// SOCKET.IO
// ==================================================

io.on(
  "connection",
  (socket) => {
    console.log(
      "✅ Socket conectado:",
      socket.id
    );

    socket.data.mediaStatus = {
      ...defaultMediaStatus,
    };

    socket.data.isTranscribing =
      false;

    // ==============================================
    // ENTRAR NA SALA
    // ==============================================

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

        cancelRoomCleanup(
          roomName
        );

        const currentRoom =
          io.sockets.adapter.rooms.get(
            roomName
          );

        const existingParticipantIds =
          currentRoom
            ? Array.from(
                currentRoom
              )
            : [];

        if (
          existingParticipantIds.length >=
          MAX_PARTICIPANTS
        ) {
          socket.emit(
            "room-full"
          );

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

        socket.join(
          roomName
        );

        console.log("");
        console.log(
          `👤 ${normalizedName} entrou na sala ${roomId}`
        );

        console.log(
          `🆔 Socket: ${socket.id}`
        );

        console.log("");

        // Confirma para o próprio
        // navegador qual identidade
        // o servidor registrou.
        socket.emit(
          "participant-identity",
          {
            participantId:
              socket.id,

            participantName:
              normalizedName,
          }
        );

        // Participantes que já
        // estavam na sala.
        socket.emit(
          "existing-participants",
          {
            participants:
              existingParticipants,
          }
        );

        // Histórico existente.
        socket.emit(
          "transcript-history",
          {
            entries:
              getRoomTranscript(
                roomName
              ),
          }
        );

        // Avisa os demais.
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
                socket.data
                  .mediaStatus,

              isTranscribing:
                socket.data
                  .isTranscribing,
            }
          );

        // Estado oficial da sala.
        broadcastRoomState(
          roomName
        );
      }
    );

    // ==============================================
    // STATUS DE MÍDIA
    // ==============================================

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
          getRoomName(
            roomId
          );

        if (
          socket.data
            .roomName !==
          roomName
        ) {
          return;
        }

        const nextStatus =
          normalizeMediaStatus(
            status,
            socket.data
              .mediaStatus ||
              defaultMediaStatus
          );

        socket.data.mediaStatus =
          nextStatus;

        const participantName =
          normalizeParticipantName(
            socket.data
              .participantName,
            socket.id
          );

        socket
          .to(roomName)
          .emit(
            "participant-media-status",
            {
              participantId:
                socket.id,

              participantName,

              mediaStatus:
                nextStatus,
            }
          );
      }
    );

    // ==============================================
    // STATUS DA TRANSCRIÇÃO
    // ==============================================

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
          getRoomName(
            roomId
          );

        if (
          socket.data
            .roomName !==
          roomName
        ) {
          return;
        }

        socket.data.isTranscribing =
          isTranscribing;

        const participantName =
          normalizeParticipantName(
            socket.data
              .participantName,
            socket.id
          );

        socket
          .to(roomName)
          .emit(
            "participant-transcription-status",
            {
              participantId:
                socket.id,

              participantName,

              isTranscribing,
            }
          );
      }
    );

    // ==============================================
    // TRANSCRIÇÃO
    // ==============================================

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
          getRoomName(
            roomId
          );

        if (
          socket.data
            .roomName !==
          roomName
        ) {
          return;
        }

        const text =
          String(
            entry.text
          )
            .trim()
            .slice(
              0,
              3000
            );

        if (!text) {
          return;
        }

        const participantName =
          normalizeParticipantName(
            socket.data
              .participantName,
            socket.id
          );

        const savedEntry = {
          id:
            entry.id ||
            `${Date.now()}-${socket.id}`,

          senderId:
            socket.id,

          // IMPORTANTE:
          // o nome vem do servidor,
          // nunca do texto enviado
          // pelo navegador.
          senderName:
            participantName,

          text,

          time:
            entry.time ||
            new Date()
              .toLocaleTimeString(
                "pt-BR",
                {
                  hour:
                    "2-digit",

                  minute:
                    "2-digit",
                }
              ),

          createdAt:
            Date.now(),
        };

        const transcript =
          getRoomTranscript(
            roomName
          );

        transcript.push(
          savedEntry
        );

        if (
          transcript.length >
          2000
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

        socket
          .to(roomName)
          .emit(
            "transcript-entry",
            savedEntry
          );
      }
    );

    // ==============================================
    // SOLICITAR HISTÓRICO
    // ==============================================

    socket.on(
      "request-transcript",
      ({ roomId }) => {
        if (!roomId) {
          return;
        }

        const roomName =
          getRoomName(
            roomId
          );

        if (
          socket.data
            .roomName !==
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

    // ==============================================
    // WEBRTC OFFER
    // ==============================================

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

        const senderName =
          normalizeParticipantName(
            socket.data
              .participantName,
            socket.id
          );

        io.to(
          targetId
        ).emit(
          "webrtc-offer",
          {
            senderId:
              socket.id,

            senderName,

            offer,
          }
        );
      }
    );

    // ==============================================
    // WEBRTC ANSWER
    // ==============================================

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

        const senderName =
          normalizeParticipantName(
            socket.data
              .participantName,
            socket.id
          );

        io.to(
          targetId
        ).emit(
          "webrtc-answer",
          {
            senderId:
              socket.id,

            senderName,

            answer,
          }
        );
      }
    );

    // ==============================================
    // ICE
    // ==============================================

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

        io.to(
          targetId
        ).emit(
          "webrtc-ice-candidate",
          {
            senderId:
              socket.id,

            candidate,
          }
        );
      }
    );

    // ==============================================
    // CHAT
    // ==============================================

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
          getRoomName(
            roomId
          );

        if (
          socket.data
            .roomName !==
          roomName
        ) {
          return;
        }

        const participantName =
          normalizeParticipantName(
            socket.data
              .participantName,
            socket.id
          );

        console.log(
          `💬 ${participantName}: ${message.text}`
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

    // ==============================================
    // SAÍDA
    // ==============================================

    socket.on(
      "disconnecting",
      () => {
        const roomName =
          socket.data
            .roomName;

        if (!roomName) {
          return;
        }

        const participantName =
          normalizeParticipantName(
            socket.data
              .participantName,
            socket.id
          );

        const remainingParticipants =
          getRoomParticipants(
            roomName,
            socket.id
          );

        console.log("");
        console.log(
          `👋 ${participantName} saiu da reunião`
        );
        console.log("");

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
            "room-participants",
            {
              count:
                remainingParticipants.length,
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
  }
);

// ==================================================
// SERVIDOR
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