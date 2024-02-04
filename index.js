const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const isDev = app.settings.env === 'development';
const URL = isDev ? 'http://localhost:3000/' : 'https://sync-board-client.vercel.app/';
app.use(cors({ origin: URL }));
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: URL,
});

let text = null, syncUrl = '';
io.on('connection', (socket) => {
  console.log('Server Connected!');

  socket.on('beginPath', (args) => {
    socket.broadcast.emit('beginPath', args);
  });

  socket.on('drawLine', (args) => {
    socket.broadcast.emit('drawLine', args);
  });

  socket.on('changeConfig', (args) => {
    socket.broadcast.emit('changeConfig', args);
  });

  socket.on('textChange', (args) => {
    socket.broadcast.emit('textChange', args, syncUrl);
    text = args;
  });

  socket.on('initText', (url) => {
    socket.emit('getText', text, syncUrl);
    syncUrl = url;
  });
});

httpServer.listen(5000);
