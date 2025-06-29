const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const port = process.env.PORT || 5000;

const app = express();
const isDev = app.settings.env === 'development';
const URL = isDev ? 'http://localhost:3000/' : 'https://sync-board-client.vercel.app/';
app.use(cors({ origin: URL }));
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: URL,
});

// Configuration
const DATA_DIR = path.join(__dirname, 'data');
const MAX_ROOM_SIZE = 10; // Maximum users per room
const MAX_TEXT_LENGTH = 1000000; // 1MB text limit

// Ensure data directory exists
const ensureDataDir = async () => {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
};

// Data storage and persistence
class DataStorage {
  constructor() {
    this.data = {};
    this.initializeStorage();
  }

  async initializeStorage() {
    await ensureDataDir();
    await this.loadData();
    // Removed cleanup timer - now we clean up immediately on user disconnect
  }

  async loadData() {
    try {
      // Ensure directory exists before trying to read it
      await ensureDataDir();

      const files = await fs.readdir(DATA_DIR);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const roomId = file.replace('.json', '');
          const filePath = path.join(DATA_DIR, file);
          const fileContent = await fs.readFile(filePath, 'utf8');
          const roomData = JSON.parse(fileContent);

          // Reset socket connections and timeouts on server restart
          if (roomData.users) {
            Object.keys(roomData.users).forEach(userId => {
              roomData.users[userId].socketId = null;
              roomData.users[userId].timeoutId = null;
            });
          }

          this.data[roomId] = roomData;
        }
      }
      console.log(`Loaded ${Object.keys(this.data).length} rooms from storage`);

      // Log details of loaded rooms and clear disconnected users
      for (const [roomId, room] of Object.entries(this.data)) {
        const totalUsers = room.users ? Object.keys(room.users).length : 0;
        console.log(`  📁 Room ${roomId}: ${totalUsers} users (all disconnected on restart)`);

        // Clear all users on server restart since they're all disconnected
        if (room.users && totalUsers > 0) {
          console.log(`  🧹 Clearing ${totalUsers} users from room ${roomId} (server restart)`);
          room.users = {};
          await this.saveRoom(roomId);
        }
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('Data directory not found, starting with empty storage');
      } else {
        console.error('Error loading data:', error.message);
      }
    }
  }

  async saveRoom(roomId) {
    try {
      if (!this.data[roomId]) return;

      const filePath = path.join(DATA_DIR, `${roomId}.json`);
      const dataToSave = {
        ...this.data[roomId],
        lastUpdated: new Date().toISOString()
      };

      // Remove socket-specific data before saving
      if (dataToSave.users) {
        Object.keys(dataToSave.users).forEach(userId => {
          delete dataToSave.users[userId].socketId;
          delete dataToSave.users[userId].timeoutId;
        });
      }

      await fs.writeFile(filePath, JSON.stringify(dataToSave, null, 2));
    } catch (error) {
      console.error(`Error saving room ${roomId}:`, error.message);
    }
  }

  async deleteRoom(roomId) {
    try {
      delete this.data[roomId];
      const filePath = path.join(DATA_DIR, `${roomId}.json`);
      await fs.unlink(filePath);
      console.log(`🗑️ Deleted empty room: ${roomId}`);
    } catch (error) {
      console.error(`Error deleting room ${roomId}:`, error.message);
    }
  }
}

// Utility functions
const isObjEmpty = (obj) => {
  if (!obj) return true;
  return Object.keys(obj).length === 0;
};

const sanitizeRoomId = (roomId) => {
  if (!roomId || typeof roomId !== 'string') return null;
  // Allow only alphanumeric characters and hyphens
  return roomId.replace(/[^a-zA-Z0-9-]/g, '').substring(0, 50);
};

const sanitizeUserId = (userId) => {
  if (!userId || typeof userId !== 'string') return null;
  return userId.replace(/[^a-zA-Z0-9-]/g, '').substring(0, 50);
};

const sanitizeText = (text) => {
  if (typeof text !== 'string') return '';
  if (text.length > MAX_TEXT_LENGTH) {
    return text.substring(0, MAX_TEXT_LENGTH);
  }
  return text;
};

const generateRoomToken = () => {
  return crypto.randomBytes(16).toString('hex');
};

// Initialize storage
const storage = new DataStorage();
// Socket connection handling
io.on('connection', (socket) => {
  console.log(`🔌 User connected: ${socket.id}`);

  // Track last init time to prevent rapid calls
  let lastInitTime = 0;

  /** Handle user connection with error handling and validation */
  socket.on('init', async (syncUrl, userId) => {
    try {
      // Throttle init calls - prevent multiple calls within 1 second
      const now = Date.now();
      if (now - lastInitTime < 1000) {
        console.log(`Throttling init call from socket ${socket.id}`);
        return;
      }
      lastInitTime = now;

      const roomId = sanitizeRoomId(syncUrl);
      const cleanUserId = sanitizeUserId(userId);

      if (!roomId || !cleanUserId) {
        socket.emit('error', 'Invalid room ID or user ID');
        return;
      }

      // Prevent duplicate initialization for the same socket
      if (socket.roomId && socket.userId) {
        console.log(`Socket ${socket.id} already initialized for room ${socket.roomId}, user ${socket.userId}`);
        return;
      }

      // Check room capacity - count total users, not just active ones
      const totalUsersCount = storage.data[roomId]?.users ?
        Object.keys(storage.data[roomId].users).length : 0;

      console.log(`🔍 DEBUG: Room ${roomId} has ${totalUsersCount} users, limit is ${MAX_ROOM_SIZE}`);
      if (storage.data[roomId]?.users) {
        console.log(`🔍 DEBUG: Users in room:`, Object.keys(storage.data[roomId].users));
      }

      // Check if user already exists in room
      const userAlreadyExists = storage.data[roomId]?.users && storage.data[roomId].users[cleanUserId];

      // Reject if room is full AND user is not already in the room
      if (totalUsersCount >= MAX_ROOM_SIZE && !userAlreadyExists) {
        console.log(`❌ Room ${roomId} is full (${totalUsersCount}/${MAX_ROOM_SIZE} users). Rejecting user ${cleanUserId}`);
        socket.emit('error', 'Room is full');
        return;
      }

      console.log(`🏠 Room ${roomId} capacity check: ${totalUsersCount}/${MAX_ROOM_SIZE} users`);

      // Initialize room if it doesn't exist
      if (!storage.data[roomId]) {
        storage.data[roomId] = {
          text: '',
          users: {},
          createdAt: new Date().toISOString(),
          lastUpdated: new Date().toISOString()
        };
        console.log(`🆕 Created new room: ${roomId}`);
      }

      // Handle existing user reconnection
      if (storage.data[roomId].users && storage.data[roomId].users[cleanUserId]) {
        clearTimeout(storage.data[roomId].users[cleanUserId].timeoutId);

        storage.data[roomId].users[cleanUserId] = {
          ...storage.data[roomId].users[cleanUserId],
          socketId: socket.id,
          lastSeen: new Date().toISOString()
        };
        console.log(`🔄 User ${cleanUserId} reconnected to room ${roomId}`);
      } else {
        // Add new user
        if (!storage.data[roomId].users) {
          storage.data[roomId].users = {};
        }
        storage.data[roomId].users[cleanUserId] = {
          timeoutId: null,
          socketId: socket.id,
          joinedAt: new Date().toISOString(),
          lastSeen: new Date().toISOString()
        };
        console.log(`👤 New user ${cleanUserId} added to room ${roomId}`);
      }

      // Join socket room for efficient broadcasting
      socket.join(roomId);
      socket.roomId = roomId;
      socket.userId = cleanUserId;

      storage.data[roomId].lastUpdated = new Date().toISOString();

      // Get updated counts after adding user
      const finalTotalCount = storage.data[roomId].users ? Object.keys(storage.data[roomId].users).length : 0;

      console.log(`✅ User ${cleanUserId} joined room ${roomId} (${finalTotalCount}/${MAX_ROOM_SIZE} users)`);

      // Real-time backup after user joins
      await storage.saveRoom(roomId);

      // Send confirmation to client that initialization is complete
      socket.emit('initComplete', roomId, cleanUserId);

    } catch (error) {
      console.error('Error in init:', error);
      socket.emit('error', 'Connection failed');
    }
  });

  /** Listen to text change from client with validation and error handling */
  socket.on('textChange', async (text, syncUrl, userId) => {
    try {
      const roomId = sanitizeRoomId(syncUrl);
      const cleanUserId = sanitizeUserId(userId);
      const cleanText = sanitizeText(text);

      if (!roomId || !cleanUserId || !storage.data[roomId]) {
        socket.emit('error', 'Invalid room or user');
        return;
      }

      // Verify user is in the room
      if (!storage.data[roomId].users || !storage.data[roomId].users[cleanUserId]) {
        socket.emit('error', 'User not in room');
        return;
      }

      // Update text and timestamp
      storage.data[roomId].text = cleanText;
      storage.data[roomId].lastUpdated = new Date().toISOString();
      storage.data[roomId].users[cleanUserId].lastSeen = new Date().toISOString();

      // Broadcast to other users in the room
      socket.to(roomId).emit('textChange', cleanText);

      // Real-time backup after text change
      await storage.saveRoom(roomId);

    } catch (error) {
      console.error('Error in textChange:', error);
      socket.emit('error', 'Failed to update text');
    }
  });

  /** Listen init text from new client and emit getText method for that client */
  socket.on('initText', (url, userId) => {
    try {
      const roomId = sanitizeRoomId(url);
      const cleanUserId = sanitizeUserId(userId);

      if (!roomId || !cleanUserId) {
        socket.emit('error', 'Invalid room or user ID');
        return;
      }

      // Only send text if the user is properly initialized in a room
      if (!socket.roomId || !socket.userId || socket.roomId !== roomId || socket.userId !== cleanUserId) {
        socket.emit('error', 'User not authorized for this room');
        console.log(`🚫 Blocked unauthorized text request from user ${cleanUserId} for room ${roomId}`);
        return;
      }

      const roomData = storage.data[roomId];
      if (roomData) {
        // Send the room's text to authorized user
        socket.emit('getText', roomData.text || '', roomId);
        console.log(`📄 Sent text to user ${cleanUserId} in room ${roomId} (${(roomData.text || '').length} chars)`);
      } else {
        // Room doesn't exist yet, send empty text
        socket.emit('getText', '', roomId);
        console.log(`📄 Sent empty text to user ${cleanUserId} (room ${roomId} doesn't exist yet)`);
      }
    } catch (error) {
      console.error('Error in initText:', error);
      socket.emit('error', 'Failed to get text');
    }
  });

  /** Send server data to admin with room statistics */
  socket.on('getData', () => {
    try {
      const data = Object.keys(storage.data).map(roomId => {
        const room = storage.data[roomId];
        const userCount = room.users ? Object.keys(room.users).length : 0;
        const activeUsers = room.users ? Object.values(room.users).filter(user => user.socketId).length : 0;
        return {
          roomId,
          totalUsers: userCount,
          activeUsers,
          lastUpdated: room.lastUpdated,
          textLength: room.text ? room.text.length : 0
        };
      });

      socket.emit('dataResponse', data);
    } catch (error) {
      console.error('Error in getData:', error);
      socket.emit('error', 'Failed to get data');
    }
  });

  /** Delete data on admin's request with confirmation */
  socket.on('deleteData', () => {
    try {
      // For security, only allow if there are no active users
      const hasActiveUsers = Object.values(storage.data).some(room =>
        room.users && Object.values(room.users).some(user => user.socketId)
      );

      if (hasActiveUsers) {
        socket.emit('error', 'Cannot delete data while users are active');
        return;
      }

      // Clear all data
      Object.keys(storage.data).forEach(roomId => {
        storage.deleteRoom(roomId);
      });

      socket.emit('dataDeleted', 'All data deleted successfully');
    } catch (error) {
      console.error('Error in deleteData:', error);
      socket.emit('error', 'Failed to delete data');
    }
  });

  /** Handle user disconnection with proper cleanup */
  socket.on('disconnect', () => {
    try {
      console.log(`🔌❌ User disconnected: ${socket.id}`);

      const roomId = socket.roomId;
      const userId = socket.userId;

      if (!roomId || !userId || !storage.data[roomId]) {
        console.log(`No room/user info for disconnected socket ${socket.id}`);
        return;
      }

      const room = storage.data[roomId];
      if (room.users && room.users[userId]) {
        clearTimeout(room.users[userId].timeoutId);

        // Remove socketId immediately but keep user data
        room.users[userId].socketId = null;

        const totalCount = Object.keys(room.users).length;
        console.log(`👤❌ User ${userId} disconnected from room ${roomId} (${totalCount}/${MAX_ROOM_SIZE} users)`);

        // Set cleanup timeout - only remove user if they don't reconnect
        room.users[userId].timeoutId = setTimeout(async () => {
          try {
            // Always delete user on disconnect (they closed tab or switched to local mode)
            delete room.users[userId];
            const newTotalCount = Object.keys(room.users).length;
            console.log(`🗑️👤 Removed user ${userId} from room ${roomId} (${newTotalCount}/${MAX_ROOM_SIZE} users)`);

            // Update room's last updated time when user is removed
            room.lastUpdated = new Date().toISOString();

            // Check if room is now empty and delete it immediately
            if (newTotalCount === 0) {
              console.log(`📭 Room ${roomId} is now empty, deleting immediately`);
              await storage.deleteRoom(roomId);
            } else {
              // Save room state if not empty
              await storage.saveRoom(roomId);
            }
          } catch (error) {
            console.error('Error in disconnect cleanup:', error);
          }
        }, 5000); // 5 second grace period for reconnection
      }
    } catch (error) {
      console.error('Error in disconnect handler:', error);
    }
  });

  /** Handle socket errors */
  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
});

// Graceful shutdown handling
process.on('SIGINT', async () => {
  console.log('Received SIGINT, gracefully shutting down...');

  try {
    // Save all room data before shutdown
    for (const roomId of Object.keys(storage.data)) {
      await storage.saveRoom(roomId);
    }
    console.log('Data backup completed');

    // Set a timeout to force exit if graceful shutdown takes too long
    const forceExitTimeout = setTimeout(() => {
      console.log('Force exiting after timeout');
      process.exit(1);
    }, 5000);

    // Close server
    httpServer.close(() => {
      clearTimeout(forceExitTimeout);
      console.log('Server closed gracefully');
      process.exit(0);
    });

    // Also close all socket connections
    io.close(() => {
      console.log('Socket.IO connections closed');
    });

  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, gracefully shutting down...');

  try {
    for (const roomId of Object.keys(storage.data)) {
      await storage.saveRoom(roomId);
    }
    console.log('Data backup completed');

    const forceExitTimeout = setTimeout(() => {
      console.log('Force exiting after timeout');
      process.exit(1);
    }, 5000);

    httpServer.close(() => {
      clearTimeout(forceExitTimeout);
      console.log('Server closed gracefully');
      process.exit(0);
    });

    io.close(() => {
      console.log('Socket.IO connections closed');
    });

  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
});

httpServer.listen(port, () => {
  console.log(`🚀 Express server running on http://localhost:${port}`);
  console.log(`📁 Data directory: ${DATA_DIR}`);
  console.log(`💾 Backup: Real-time (after each change)`);
  console.log(`🗑️ Room cleanup: Immediate when empty (5s grace period for reconnection)`);
  console.log(`👥 Max room size: ${MAX_ROOM_SIZE} users`);
  console.log(`📝 Max text length: ${(MAX_TEXT_LENGTH / 1000000).toFixed(1)}MB`);
  console.log(`=== Server Ready ===\n`);
});

/**
 * Data Structure Documentation
 * 
 * storage.data = {
 *   roomId1: {
 *     text: 'room content text',
 *     createdAt: '2025-06-30T12:00:00.000Z',
 *     lastUpdated: '2025-06-30T12:30:00.000Z',
 *     users: { 
 *       userId1: { 
 *         socketId: 'socket123', 
 *         shouldDeleteOnClose: true, 
 *         timeoutId: null,
 *         joinedAt: '2025-06-30T12:00:00.000Z',
 *         lastSeen: '2025-06-30T12:30:00.000Z'
 *       }
 *     }
 *   }
 * }
 * 
 * File Storage:
 * - Each room is stored as a separate JSON file in the 'data' directory
 * - Files are named: {roomId}.json
 * - Socket-specific data (socketId, timeoutId) is excluded from file storage
 * - Real-time backup after every change
 * - Immediate cleanup when rooms become empty (5s grace period for user reconnection)
 * 
 * Security Features:
 * - Input sanitization for room IDs and user IDs
 * - Text length limits (1MB max)
 * - Room capacity limits (2 users max)
 * - Data validation and error handling
 * 
 * Scalability Features:
 * - File-based persistence (survives server restarts)
 * - Efficient socket room broadcasting
 * - Immediate cleanup of empty rooms (minimal polling overhead)
 * - Memory usage monitoring through user limits
 */
