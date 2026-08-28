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

const io = new Server(httpServer);

function getRoomName(roomId) {
  return `meeting:${roomId}`;
}

const defaultMediaStatus = {
  isMicOn: true,
  isCameraOn: true,
  isScreenSharing: false,
};

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

// --------------------------------------------------
// TRANSCRIÇÕES DAS SALAS
// --------------------------------------------------

// Nesta primeira versão, a transcrição fica
// guardada na memória do servidor.
//
// Depois, quando refinarmos o sistema,
// podemos substituir isso por banco de dados.
const roomTranscripts = new Map();

// Quando uma sala fica vazia,
// mantemos sua transcrição por 2 horas.
const roomCleanupTimers = new Map();

function getRoomTranscript(roomName) {
  if (!roomTranscripts.has(roomName)) {
    roomTranscripts.set(roomName, []);
  }

  return roomTranscripts.get(roomName);
}

function cancelRoomCleanup(roomName) {
  const timer =
    roomCleanupTimers.get(roomName);

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
      io.sockets.adapter.rooms.get(
        roomName
      );

    if (!room || room.size === 0) {
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

  // --------------------------------------------------
  // ENTRAR NA SALA
  // --------------------------------------------------

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
        existingParticipantIds.length >= 2
      ) {
        socket.emit("room-full");
        return;
      }

      socket.data.roomName =
        roomName;

      socket.data.roomId =
        roomId;

      socket.data.participantName =
        participantName ||
        "Participante";

      socket.data.mediaStatus =
        normalizeMediaStatus(
          mediaStatus
        );

      const existingParticipants =
        existingParticipantIds.map(
          (participantId) => {
            const participantSocket =
              io.sockets.sockets.get(
                participantId
              );

            return {
              participantId,

              participantName:
                participantSocket?.data
                  ?.participantName ||
                "Participante",

              mediaStatus:
                participantSocket?.data
                  ?.mediaStatus ||
                defaultMediaStatus,

              isTranscribing:
                participantSocket?.data
                  ?.isTranscribing ??
                false,
            };
          }
        );

      socket.join(roomName);

      console.log(
        `👤 ${socket.data.participantName} entrou em ${roomId}`
      );

      socket.emit(
        "existing-participants",
        {
          participants:
            existingParticipants,
        }
      );

      // Envia para quem entrou
      // a transcrição que já existe.
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
              socket.data
                .participantName,

            mediaStatus:
              socket.data
                .mediaStatus,

            isTranscribing:
              socket.data
                .isTranscribing,
          }
        );

      const participantCount =
        io.sockets.adapter.rooms.get(
          roomName
        )?.size ?? 0;

      io.to(roomName).emit(
        "room-participants",
        {
          count:
            participantCount,
        }
      );
    }
  );

  // --------------------------------------------------
  // STATUS DE MÍDIA
  // --------------------------------------------------

  socket.on(
    "media-status-change",
    ({ roomId, status }) => {
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
              socket.data
                .participantName ||
              "Participante",

            mediaStatus:
              nextStatus,
          }
        );
    }
  );

  // --------------------------------------------------
  // STATUS DA TRANSCRIÇÃO
  // --------------------------------------------------

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
              socket.data
                .participantName ||
              "Participante",

            isTranscribing,
          }
        );
    }
  );

  // --------------------------------------------------
  // NOVA FALA TRANSCRITA
  // --------------------------------------------------

  socket.on(
    "transcript-entry",
    ({ roomId, entry }) => {
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
          .slice(0, 3000);

      if (!text) {
        return;
      }

      const savedEntry = {
        id:
          entry.id ||
          `${Date.now()}-${socket.id}`,

        senderId:
          socket.id,

        senderName:
          socket.data
            .participantName ||
          "Participante",

        text,

        time:
          entry.time ||
          new Date()
            .toLocaleTimeString(
              "pt-BR",
              {
                hour: "2-digit",
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

      // Evita crescimento sem limite
      // durante nossos testes.
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
        `📝 ${savedEntry.senderName}: ${savedEntry.text}`
      );

      // O próprio navegador já
      // adiciona sua fala localmente.
      // O servidor envia para os outros.
      socket
        .to(roomName)
        .emit(
          "transcript-entry",
          savedEntry
        );
    }
  );

  // Já deixamos isso preparado
  // para a etapa do relatório.
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

  // --------------------------------------------------
  // WEBRTC
  // --------------------------------------------------

  socket.on(
    "webrtc-offer",
    ({ targetId, offer }) => {
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
            socket.data
              .participantName ||
            "Participante",

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
            socket.data
              .participantName ||
            "Participante",

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

  // --------------------------------------------------
  // CHAT
  // --------------------------------------------------

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

      console.log(
        `💬 ${socket.data.participantName}: ${message.text}`
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
              socket.data
                .participantName ||
              "Participante",
          }
        );
    }
  );

  // --------------------------------------------------
  // SAÍDA
  // --------------------------------------------------

  socket.on(
    "disconnecting",
    () => {
      const roomName =
        socket.data.roomName;

      if (!roomName) {
        return;
      }

      const participantName =
        socket.data
          .participantName ||
        "Participante";

      const currentRoom =
        io.sockets.adapter.rooms.get(
          roomName
        );

      const participantCountAfterLeaving =
        Math.max(
          (currentRoom?.size ??
            1) - 1,
          0
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
          "room-participants",
          {
            count:
              participantCountAfterLeaving,
          }
        );

      if (
        participantCountAfterLeaving ===
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