import express from "express";
import { createServer as createViteServer } from "vite";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  const PORT = 3000;
  const httpServer = createServer(app);
  
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    },
    pingTimeout: 60000,
    pingInterval: 25000
  });

  // Active broadcasters: socket.id -> { id, name, viewers }
  const activeBroadcasters = new Map<string, { id: string, name: string, viewers: number }>();
  const chatHistory: any[] = [];
  // Connected users: socket.id -> { username, id }
  const users: { [id: string]: { username: string; id: string } } = {};

  const emitUserList = () => {
    const userList = Object.values(users);
    io.emit("user_list", userList);
  };

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    socket.on("broadcaster", (streamName: string) => {
      activeBroadcasters.set(socket.id, { 
        id: socket.id, 
        name: streamName || `Transmisión de ${socket.id.slice(0, 4)}`,
        viewers: 0 
      });
      io.emit("broadcaster_list", Array.from(activeBroadcasters.values()));
    });

    socket.on("get_broadcasters", () => {
      socket.emit("broadcaster_list", Array.from(activeBroadcasters.values()));
    });

    socket.on("watcher", (broadcasterId: string) => {
      const b = activeBroadcasters.get(broadcasterId);
      if (b) {
        socket.to(broadcasterId).emit("watcher", socket.id);
        b.viewers++;
        io.emit("broadcaster_list", Array.from(activeBroadcasters.values()));
        io.to(broadcasterId).emit("viewers_count", b.viewers);
      }
      socket.emit("chat_history", chatHistory);
    });

    socket.on("register_user", (username: string) => {
      users[socket.id] = { username, id: socket.id };
      emitUserList();
    });

    socket.on("chat_message", (message) => {
      chatHistory.push(message);
      if (chatHistory.length > 100) chatHistory.shift();
      io.emit("chat_message", message);
    });

    socket.on("delete_message", (messageId) => {
      if (activeBroadcasters.has(socket.id)) {
        const index = chatHistory.findIndex(m => m.id === messageId);
        if (index !== -1) {
          chatHistory.splice(index, 1);
        }
        io.emit("message_deleted", messageId);
      }
    });

    socket.on("offer", (id, message) => {
      socket.to(id).emit("offer", socket.id, message);
    });

    socket.on("answer", (id, message) => {
      socket.to(id).emit("answer", socket.id, message);
    });

    socket.on("candidate", (id, message) => {
      socket.to(id).emit("candidate", socket.id, message);
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
      if (activeBroadcasters.has(socket.id)) {
        activeBroadcasters.delete(socket.id);
        io.emit("broadcaster_list", Array.from(activeBroadcasters.values()));
      }
      if (users[socket.id]) {
        delete users[socket.id];
        emitUserList();
      }
      socket.broadcast.emit("disconnectPeer", socket.id);
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.get("*", (req, res) => {
      res.sendFile(path.resolve(__dirname, "dist", "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer().catch(err => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
