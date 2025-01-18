import dotenv from 'dotenv';
import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Server } from 'socket.io';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

dotenv.config();

(async () => {
  // Opening the SQLite database connection
  const db = await open({
    filename: 'chat.db',
    driver: sqlite3.Database
  });

  // Creating the messages table if it doesn't exist
  await db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_offset TEXT UNIQUE,
        content TEXT
    );
  `);

  const PORT = process.env.PORT || 3000;
  const app = express();
  const server = createServer(app);
  const io = new Server(server, {
    connectionStateRecovery: {},
  });

  const __dirname = dirname(fileURLToPath(import.meta.url));

  // Route to serve the main chat page
  app.get('/', (req, res) => {
    res.sendFile(join(__dirname, 'index.html'));
  });

  // Route to serve the background image
  app.get('/bg.jpg', (req, res) => {
    res.sendFile(join(__dirname, 'bg.jpg'));
  });

  // Starting the server
  server.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
  });

  // Handling WebSocket connection
  io.on("connection", async (socket) => {
    console.log("A user connected!");

    // Listening for chat messages from clients
    socket.on("chat message", async (msg) => {
      let result;
      try {
        // Inserting the chat message into the database
        result = await db.run('INSERT INTO messages (content) VALUES (?)', msg);
      } catch (e) {
        // Logging the error
        console.log(e);
        return;
      }
      // Broadcasting the message to all connected clients
      io.emit('chat message', msg, result.lastID);
    });

    // Sending previous messages if the client is not recovering
    if (!socket.recovered) {
      try {
        await db.each(
          'SELECT id, content FROM messages WHERE id > ?',
          [socket.handshake.auth.serverOffset || 0],
          (_err, row) => {
            socket.emit('chat message', row.content, row.id);
          }
        );
      } catch (e) {
        console.log(e);
      }
    }
  });
})();