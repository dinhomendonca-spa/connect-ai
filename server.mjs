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

io.on("connection", (socket) => {
  console.log("✅ Socket conectado:", socket.id);

  socket.data.mediaStatus = {
    ...defaultMediaStatus,
  };

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

      const roomName = getRoomName(roomId);

      const currentRoom =
        io.sockets.adapter.rooms.get(roomName);

      const existingParticipantIds =
        currentRoom
          ? Array.from(currentRoom)
          : [];

      // Nesta fase, cada sala terá no máximo 2 pessoas.
      if (
        existingParticipantIds.length >= 2
      ) {
        socket.emit("room-full");
        return;
      }

      socket.data.roomName = roomName;
      socket.data.roomId = roomId;

      socket.data.participantName =
        participantName || "Participante";

      socket.data.mediaStatus =
        normalizeMediaStatus(mediaStatus);

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
            };
          }
        );

      socket.join(roomName);

      console.log(
        `👤 ${socket.data.participantName} entrou em ${roomId}`
      );

      // Informa ao novo participante
      // quem já estava na sala.
      socket.emit(
        "existing-participants",
        {
          participants:
            existingParticipants,
        }
      );

      // Avisa quem já estava na sala
      // que uma nova pessoa entrou.
      socket
        .to(roomName)
        .emit("participant-joined", {
          participantId: socket.id,

          participantName:
            socket.data.participantName,

          mediaStatus:
            socket.data.mediaStatus,
        });

      const participantCount =
        io.sockets.adapter.rooms.get(
          roomName
        )?.size ?? 0;

      io.to(roomName).emit(
        "room-participants",
        {
          count: participantCount,
        }
      );
    }
  );

  // --------------------------------------------------
  // STATUS DE MICROFONE / CÂMERA / TELA
  // --------------------------------------------------

  socket.on(
    "media-status-change",
    ({ roomId, status }) => {
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
  // WEBRTC — OFERTA
  // --------------------------------------------------

  socket.on(
    "webrtc-offer",
    ({ targetId, offer }) => {
      if (!targetId || !offer) {
        return;
      }

      io.to(targetId).emit(
        "webrtc-offer",
        {
          senderId: socket.id,

          senderName:
            socket.data
              .participantName ||
            "Participante",

          offer,
        }
      );
    }
  );

  // --------------------------------------------------
  // WEBRTC — RESPOSTA
  // --------------------------------------------------

  socket.on(
    "webrtc-answer",
    ({ targetId, answer }) => {
      if (!targetId || !answer) {
        return;
      }

      io.to(targetId).emit(
        "webrtc-answer",
        {
          senderId: socket.id,

          senderName:
            socket.data
              .participantName ||
            "Participante",

          answer,
        }
      );
    }
  );

  // --------------------------------------------------
  // WEBRTC — ICE
  // --------------------------------------------------

  socket.on(
    "webrtc-ice-candidate",
    ({ targetId, candidate }) => {
      if (
        !targetId ||
        !candidate
      ) {
        return;
      }

      io.to(targetId).emit(
        "webrtc-ice-candidate",
        {
          senderId: socket.id,
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
    ({ roomId, message }) => {
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
        .emit("chat-message", {
          ...message,

          senderId: socket.id,

          senderName:
            socket.data
              .participantName ||
            "Participante",
        });
    }
  );

  // --------------------------------------------------
  // PARTICIPANTE SAINDO
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
        socket.data.participantName ||
        "Participante";

      const currentRoom =
        io.sockets.adapter.rooms.get(
          roomName
        );

      const participantCountAfterLeaving =
        Math.max(
          (currentRoom?.size ?? 1) -
            1,
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
    }
  );

  socket.on("disconnect", () => {
    console.log(
      "❌ Socket desconectado:",
      socket.id
    );
  });
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