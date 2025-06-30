const fs = require('fs').promises;
const path = require('path');
const CONFIG = require('../config/constants');
const logger = require('../utils/logger');

// Ensure data directory exists
const ensureDataDir = async () => {
    try {
        await fs.access(CONFIG.DATA_DIR);
    } catch {
        await fs.mkdir(CONFIG.DATA_DIR, { recursive: true });
    }
};

// Data storage and persistence class
class DataStorage {
    constructor() {
        this.data = {};
        this.initializeStorage();
    }

    async initializeStorage() {
        await ensureDataDir();
        await this.loadData();
    }

    async loadData() {
        try {
            await ensureDataDir();

            const files = await fs.readdir(CONFIG.DATA_DIR);
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const roomId = file.replace('.json', '');
                    const filePath = path.join(CONFIG.DATA_DIR, file);
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
            logger.info(`Loaded ${Object.keys(this.data).length} rooms from storage`);

            // Clear all users on server restart since they're all disconnected
            for (const [roomId, room] of Object.entries(this.data)) {
                if (room.users && Object.keys(room.users).length > 0) {
                    room.users = {};
                    await this.saveRoom(roomId);
                }
            }
        } catch (error) {
            if (error.code === 'ENOENT') {
                logger.info('Data directory not found, starting with empty storage');
            } else {
                logger.error(`Error loading data: ${error.message}`);
            }
        }
    }

    async saveRoom(roomId) {
        try {
            if (!this.data[roomId]) return;

            const filePath = path.join(CONFIG.DATA_DIR, `${roomId}.json`);
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
            logger.error(`Error saving room ${roomId}: ${error.message}`);
        }
    }

    async deleteRoom(roomId) {
        try {
            delete this.data[roomId];
            const filePath = path.join(CONFIG.DATA_DIR, `${roomId}.json`);
            await fs.unlink(filePath);
            // Removed unnecessary log - room deletion is expected behavior
        } catch (error) {
            logger.error(`Error deleting room ${roomId}: ${error.message}`);
        }
    }

    getRoomData(roomId) {
        return this.data[roomId];
    }

    createRoom(roomId) {
        this.data[roomId] = {
            text: '',
            users: {},
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString()
        };
    }

    updateRoomText(roomId, text) {
        if (this.data[roomId]) {
            this.data[roomId].text = text;
            this.data[roomId].lastUpdated = new Date().toISOString();
        }
    }

    addUserToRoom(roomId, userId, socketId) {
        if (!this.data[roomId].users) {
            this.data[roomId].users = {};
        }

        this.data[roomId].users[userId] = {
            timeoutId: null,
            socketId: socketId,
            joinedAt: new Date().toISOString(),
            lastSeen: new Date().toISOString()
        };

        this.data[roomId].lastUpdated = new Date().toISOString();
    }

    reconnectUser(roomId, userId, socketId) {
        if (this.data[roomId].users && this.data[roomId].users[userId]) {
            clearTimeout(this.data[roomId].users[userId].timeoutId);

            this.data[roomId].users[userId] = {
                ...this.data[roomId].users[userId],
                socketId: socketId,
                lastSeen: new Date().toISOString()
            };
        }
    }

    updateUserLastSeen(roomId, userId) {
        if (this.data[roomId]?.users?.[userId]) {
            this.data[roomId].users[userId].lastSeen = new Date().toISOString();
        }
    }

    getUserCount(roomId) {
        return this.data[roomId]?.users ? Object.keys(this.data[roomId].users).length : 0;
    }

    userExists(roomId, userId) {
        return this.data[roomId]?.users && this.data[roomId].users[userId];
    }

    getAllRooms() {
        return Object.keys(this.data).map(roomId => {
            const room = this.data[roomId];
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
    }

    hasActiveUsers() {
        return Object.values(this.data).some(room =>
            room.users && Object.values(room.users).some(user => user.socketId)
        );
    }

    disconnectUser(roomId, userId) {
        if (this.data[roomId]?.users?.[userId]) {
            this.data[roomId].users[userId].socketId = null;
            return this.data[roomId].users[userId];
        }
        return null;
    }

    removeUser(roomId, userId) {
        if (this.data[roomId]?.users) {
            delete this.data[roomId].users[userId];
            this.data[roomId].lastUpdated = new Date().toISOString();
            return Object.keys(this.data[roomId].users).length;
        }
        return 0;
    }

    setUserTimeout(roomId, userId, timeoutId) {
        if (this.data[roomId]?.users?.[userId]) {
            this.data[roomId].users[userId].timeoutId = timeoutId;
        }
    }
}

module.exports = DataStorage;
