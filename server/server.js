import { createServer } from 'node:http';
import crypto from 'node:crypto';
import StompServer from 'stomp-broker-js';

const httpServer = createServer();
const stompServer = new StompServer({ server: httpServer });

stompServer.on('connecting', (sessionId) => {
  console.log(`[STOMP] Client connecting: ${sessionId}`);
});

stompServer.on('disconnected', (sessionId) => {
  console.log(`[STOMP] Client disconnected: ${sessionId}`);
});

// Clients SEND chat payloads to /app/chat; the broker relays them here.
stompServer.subscribe('/app/chat', (msg, headers) => {
  const payload = typeof msg === 'string' ? JSON.parse(msg) : msg;
  const enrichedMessage = {
    id: crypto.randomUUID(),
    text: payload?.text ?? '',
    sender: payload?.sender ?? '',
    timestamp: new Date().toISOString(),
  };
  stompServer.send('/topic/chat', { 'content-type': 'application/json' }, JSON.stringify(enrichedMessage));
});

const PORT = 3000;
httpServer.listen(PORT, () => {
  console.log(`STOMP broker running on ws://localhost:${PORT}/stomp`);
});
