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

io.on("connection", (socket) => {
  console.log("✅ Socket conectado:", socket.id);

  socket.on(
    "join-room",
    ({ roomId, participantName }) => {
      if (!roomId) {
        return;
      }

      const roomName = getRoomName(roomId);

      const currentRoom =
        io.sockets.adapter.rooms.get(roomName);

      const existingParticipantIds = currentRoom
        ? Array.from(currentRoom)
        : [];

      if (existingParticipantIds.length >= 2) {
        socket.emit("room-full");
        return;
      }

      socket.join(roomName);

      socket.data.roomName = roomName;
      socket.data.roomId = roomId;
      socket.data.participantName =
        participantName || "Participante";

      console.log(
        `👤 ${socket.data.participantName} entrou em ${roomId}`
      );

      socket.emit("existing-participants", {
        participantIds: existingParticipantIds,
      });

      socket.to(roomName).emit("participant-joined", {
        participantId: socket.id,
        participantName:
          socket.data.participantName,
      });

      const participantCount =
        io.sockets.adapter.rooms.get(roomName)?.size ?? 0;

      io.to(roomName).emit("room-participants", {
        count: participantCount,
      });
    }
  );

  socket.on(
    "webrtc-offer",
    ({ targetId, offer }) => {
      if (!targetId || !offer) {
        return;
      }

      io.to(targetId).emit("webrtc-offer", {
        senderId: socket.id,
        senderName:
          socket.data.participantName ||
          "Participante",
        offer,
      });
    }
  );

  socket.on(
    "webrtc-answer",
    ({ targetId, answer }) => {
      if (!targetId || !answer) {
        return;
      }

      io.to(targetId).emit("webrtc-answer", {
        senderId: socket.id,
        senderName:
          socket.data.participantName ||
          "Participante",
        answer,
      });
    }
  );

  socket.on(
    "webrtc-ice-candidate",
    ({ targetId, candidate }) => {
      if (!targetId || !candidate) {
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

  // Chat:
  // envia SOMENTE para o outro participante.
  socket.on(
    "send-chat-message",
    ({ roomId, message }) => {
      if (
        !roomId ||
        !message?.text
      ) {
        return;
      }

      const roomName = getRoomName(roomId);

      console.log(
        `💬 ${socket.data.participantName}: ${message.text}`
      );

      socket.to(roomName).emit(
        "chat-message",
        {
          ...message,
          senderId: socket.id,
          senderName:
            socket.data.participantName ||
            "Participante",
        }
      );
    }
  );

  socket.on("disconnecting", () => {
    const roomName =
      socket.data.roomName;

    if (!roomName) {
      return;
    }

    const currentRoom =
      io.sockets.adapter.rooms.get(roomName);

    const participantCountAfterLeaving =
      Math.max(
        (currentRoom?.size ?? 1) - 1,
        0
      );

    socket
      .to(roomName)
      .emit("participant-left", {
        participantId: socket.id,
      });

    socket
      .to(roomName)
      .emit("room-participants", {
        count:
          participantCountAfterLeaving,
      });
  });

  socket.on("disconnect", () => {
    console.log(
      "❌ Socket desconectado:",
      socket.id
    );
  });
});

httpServer.listen(port, hostname, () => {
  console.log("");
  console.log("🚀 ConnectAI iniciado");
  console.log(
    `🌐 Local: http://localhost:${port}`
  );
  console.log("");
});