import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import cors from 'cors';
import crypto from 'node:crypto';

const app = express();
// @todo: move all hardcoded http://localhost into .env
app.use(cors({ origin: 'http://localhost:4200' }));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: 'http://localhost:4200',
    methods: ['GET', 'POST'],
  },
});

io.on('connection', (socket) => {
  console.log(`[Socket.io] User connected: ${socket.id}`);

  socket.on('message', (payload) => {
    const enrichedMessage = {
      id: crypto.randomUUID(),
      text: payload?.text ?? '',
      sender: payload?.sender ?? '',
      timestamp: new Date().toISOString(),
    };
    io.emit('message', enrichedMessage);
  });

  socket.on('disconnect', () => {
    console.log(`[Socket.io] User disconnected: ${socket.id}`);
  });
});

const PORT = 3000;
httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
