const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const port = 5000;

const app = express();
const isDev = app.settings.env === 'development';
const URL = isDev ? 'http://localhost:3000/' : 'https://sync-board-client.vercel.app/';
app.use(cors({ origin: URL }));
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: URL,
});

/** Check if object is empty */
const isObjEmpty = (obj) => {
  for (const prop in obj) {
    if (Object.hasOwn(obj, prop)) {
      return false;
    }
  }

  return true;
}

let obj = {};
io.on('connection', (socket) => {
  /** Handle user connection */
  socket.on('init', (syncUrl, userId) => {
    if (syncUrl) {
      if(Object.keys(obj).length > 0 && obj[syncUrl]?.users && Object.keys(obj[syncUrl].users).includes(userId)) {
        obj[syncUrl] = {
          ...obj[syncUrl],
          users: {
            ...obj[syncUrl]?.users,
            [userId]: {
              ...obj[syncUrl]?.users[userId],
              socketId: socket.id,
              shouldDeleteOnClose: false,
            }
          }
        }
      }
      else {
        obj[syncUrl] = {
          text: obj[syncUrl]?.text || '',
          users: {
            ...obj[syncUrl]?.users,
            [userId]: {
              timeoutId: null,
              socketId: socket.id,
              shouldDeleteOnClose: true,
            },
          },
          draw: {
            coords: {
            },
            config: {
            }
          }
        }
      }
    }
  });

  /** Listen begin path from client and emit it to the other users */
  socket.on('beginPath', (coords, syncUrl, userId) => {
    for (let user in obj[syncUrl]?.users) {
      if (user !== userId) {
        io.to(obj[syncUrl]?.users[user]?.socketId).emit('beginPath', coords);
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

  /** Listen draw line from client and emit it to the other users */
  socket.on('drawLine', (coords, syncUrl, userId) => {
    for (let user in obj[syncUrl]?.users) {
      if (user !== userId) {
        io.to(obj[syncUrl]?.users[user]?.socketId).emit('drawLine', coords);
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

  /** Listen change config from client and emit it to the other users */
  socket.on('changeConfig', (config, syncUrl, userId) => {
    for (let user in obj[syncUrl]?.users) {
      if (user !== userId) {
        io.to(obj[syncUrl]?.users[user]?.socketId).emit('changeConfig', config);
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

  /** Listen to text change from client and emit it to the other users */
  socket.on('textChange', (text, syncUrl, userId) => {
    for (let user in obj[syncUrl]?.users) {
      if (user !== userId) {
        io.to(obj[syncUrl]?.users[user]?.socketId).emit('textChange', text);
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

  /** Listen init text from new client and emit getText method for that client */
  socket.on('initText', (url, userId) => {
    socket.emit('getText', obj[url]?.text, url, userId);
    io.to(obj[url]?.users[userId]?.socketId).emit('getText', obj[url]?.text);
  });

  /** Send server data to the admin */
  socket.on('getData', () => {
    const data = Object.keys(obj).map(url => {
      const users = obj[url]?.users;
      const userCount = users ? Object.keys(users).length : 0;
      return { [url]: userCount };
    });

    socket.emit('dataResponse', data);
  });

  /** Delete data on admin's request */
  socket.on('deleteData', () => {
    obj = {};
  });

  /** Handle user disconnection */
  socket.on('disconnect', () => {
    const id = socket.id;
    for (const url in obj) {
      // Find the userId associated with the socket
      const userId = Object.keys(obj[url]?.users).find(key => {
          if(obj[url]?.users[key]?.socketId === id) {
            return true;
          }
          else {
            return false;
          }
        });
      if (userId) {
        clearTimeout(obj[url]?.users[userId]?.timeoutId);
        obj[url].users[userId].timeoutId = setTimeout(() => {
          if(obj[url]?.users[userId]?.shouldDeleteOnClose) {
            // Remove the user from object
            delete obj[url]?.users[userId];
            socket.disconnect(true);

            // Remove the url object if no active users for that url
            if (isObjEmpty(obj[url]?.users)) {
              delete obj[url];
            }
          }
          if(obj[url]?.users[userId] && !obj[url]?.users[userId]?.shouldDeleteOnClose) {
            obj[url].users[userId].shouldDeleteOnClose = true;
          }
        }, 5000);
      }
    }
  });
});

httpServer.listen(5000, () => {
  console.log(`Express server running on http://localhost:${port}`);
});

/**
 * Object example
 *
 * obj = {
 *   url1: {
 *     text: 'abc',
 *     users: { userId1: { socketId: socketId1, shouldDeleteOnClose: true, timeoutId: null }, userId2: { socketId: socketId2, shouldDeleteOnClose: true, timeoutId: null }},
 *     draw: { coords: { x: '', y: '' }, config: { color: 'red', size: 1 }}
 *   },
*    url2: {
*      text: 'abc',
*      users: { userId1: { socketId: socketId1, shouldDeleteOnClose: true, timeoutId: null }, userId2: { socketId: socketId2, shouldDeleteOnClose: true, timeoutId: null }},
*      draw: { coords: { x: '', y: '' }, config: { color: 'red', size: 1 }}
*   }
 * }
 */
