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

const isObjEmpty = (obj) => {
  for (const prop in obj) {
    if (Object.hasOwn(obj, prop)) {
      return false;
    }
  }

  return true;
}

/* let objExample = {
  url1: {
    text: '',
    users: {
      userId: socket,
    },
    draw: {
      coords: {
        x: '',
        y: '',
      },
      config: {
        color: 'red',
        size: 1,
      }
    }
  }
}; */

let obj = {};
io.on('connection', (socket) => {
  socket.on('init', (syncUrl, userId) => {
    if (syncUrl) {
      obj[syncUrl] = {
        text: obj[syncUrl]?.text || '',
        users: {
          ...obj[syncUrl]?.users,
          [userId]: socket.id,
        },
        draw: {
          coords: {
          },
          config: {
          }
        }
      }
    }
  });

  socket.on('beginPath', (coords, syncUrl, userId) => {
    for (let user in obj[syncUrl]?.users) {
      if (user !== userId) {
        io.to(obj[syncUrl].users[user]).emit('beginPath', coords);
      }
    }

    obj = {
      ...obj,
      [syncUrl]: {
        ...obj[syncUrl],
        draw: {
          ...obj[syncUrl]?.draw,
          coords: coords
        }
      }
    }
  });

  socket.on('drawLine', (coords, syncUrl, userId) => {
    for (let user in obj[syncUrl]?.users) {
      if (user !== userId) {
        io.to(obj[syncUrl]?.users[user]).emit('drawLine', coords);
      }
    }

    obj = {
      ...obj,
      [syncUrl]: {
        ...obj[syncUrl],
        draw: {
          ...obj[syncUrl]?.draw,
          coords: coords
        }
      }
    }
  });

  socket.on('changeConfig', (config, syncUrl, userId) => {
    for (let user in obj[syncUrl]?.users) {
      if (user !== userId) {
        io.to(obj[syncUrl]?.users[user]).emit('changeConfig', config);
      }
    }

    obj = {
      ...obj,
      [syncUrl]: {
        ...obj[syncUrl],
        draw: {
          ...obj[syncUrl]?.draw,
          config: config
        }
      }
    }
  });

  socket.on('textChange', (text, syncUrl, userId) => {
    for (let user in obj[syncUrl]?.users) {
      if (user !== userId) {
        io.to(obj[syncUrl]?.users[user]).emit('textChange', text);
      }
    }

    obj = {
      ...obj,
      [syncUrl]: {
        ...obj[syncUrl],
        text: text
      }
    }
  });

  socket.on('initText', (url, userId) => {
    socket.emit('getText', obj[url]?.text, url, userId);
    io.to(obj[url]?.users[userId]).emit('getText', obj[url]?.text);
  });

  socket.on('disconnect', () => {
    const id = socket.id;
    for (const url in obj) {
      const urlObj = obj[url];
      // Check if the socketToFind exists in the users object
      if (Object.values(urlObj.users).includes(id)) {
        // Find the userId associated with the socket
        const userId = Object.keys(urlObj.users).find(key => urlObj.users[key] === id);

        // Remove the user from the users object
        delete urlObj.users[userId];
        socket.disconnect(true);

        if(isObjEmpty(obj[url].users)) {
          delete obj[url];
        }
      }
    }
  });
});

httpServer.listen(5000);
