const CONFIG = require('../config/constants');
const { sanitizeRoomId, sanitizeUserId, sanitizeText } = require('../utils/validation');
const logger = require('../utils/logger');

class SocketHandlers {
    constructor(storage) {
        this.storage = storage;
    }

    async handleInit(socket, syncUrl, userId) {
        try {
            const roomId = sanitizeRoomId(syncUrl);
            const cleanUserId = sanitizeUserId(userId);

            if (!roomId || !cleanUserId) {
                socket.emit('error', 'Invalid room ID or user ID');
                return;
            }

            // Prevent duplicate initialization for the same socket
            if (socket.roomId && socket.userId) {
                return;
            }

            const totalUsersCount = this.storage.getUserCount(roomId);

            const userAlreadyExists = this.storage.userExists(roomId, cleanUserId);

            // Reject if room is full AND user is not already in the room
            if (totalUsersCount >= CONFIG.MAX_ROOM_SIZE && !userAlreadyExists) {
                logger.info(`User ${cleanUserId} rejected from room ${roomId} - room is full (${totalUsersCount}/${CONFIG.MAX_ROOM_SIZE} users)`);
                socket.emit('error', 'Room is full');
                return;
            }

            if (!this.storage.getRoomData(roomId)) {
                this.storage.createRoom(roomId);
            }

            let isNewUser = false;
            if (this.storage.userExists(roomId, cleanUserId)) {
                this.storage.reconnectUser(roomId, cleanUserId, socket.id);
            } else {
                this.storage.addUserToRoom(roomId, cleanUserId, socket.id);
                isNewUser = true;
            }

            // Join socket room for efficient broadcasting
            socket.join(roomId);
            socket.roomId = roomId;
            socket.userId = cleanUserId;

            const currentUserCount = this.storage.getUserCount(roomId);
            const maxUsers = CONFIG.MAX_ROOM_SIZE;

            if (isNewUser) {
                logger.info(`User ${cleanUserId} joined room ${roomId} (${currentUserCount}/${maxUsers} users)`);
            } else {
                logger.info(`User ${cleanUserId} reconnected to room ${roomId} (${currentUserCount}/${maxUsers} users)`);
            }

            // Real-time backup after user joins
            await this.storage.saveRoom(roomId);

            // Send confirmation to client that initialization is complete
            socket.emit('initComplete', roomId, cleanUserId);

        } catch (error) {
            logger.error(`Error in init: ${error.message}`);
            socket.emit('error', 'Connection failed');
        }
    }

    // Listen to text change from client with validation and error handling
    async handleTextChange(socket, text, syncUrl, userId) {
        try {
            const roomId = sanitizeRoomId(syncUrl);
            const cleanUserId = sanitizeUserId(userId);
            const cleanText = sanitizeText(text, CONFIG.MAX_TEXT_LENGTH);

            if (!roomId || !cleanUserId || !this.storage.getRoomData(roomId)) {
                socket.emit('error', 'Invalid room or user');
                return;
            }

            // Verify user is in the room
            if (!this.storage.userExists(roomId, cleanUserId)) {
                socket.emit('error', 'User not in room');
                return;
            }

            // Update text and timestamp
            this.storage.updateRoomText(roomId, cleanText);
            this.storage.updateUserLastSeen(roomId, cleanUserId);

            // Broadcast to other users in the room
            socket.to(roomId).emit('textChange', cleanText);

            // Real-time backup after text change
            await this.storage.saveRoom(roomId);

        } catch (error) {
            logger.error(`Error in textChange: ${error.message}`);
            socket.emit('error', 'Failed to update text');
        }
    }

    // Listen init text from new client and emit getText method for that client
    handleInitText(socket, url, userId) {
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
                return;
            }

            const roomData = this.storage.getRoomData(roomId);
            if (roomData) {
                // Send the room's text to authorized user
                socket.emit('getText', roomData.text || '', roomId);
            } else {
                // Room doesn't exist yet, send empty text
                socket.emit('getText', '', roomId);
            }
        } catch (error) {
            logger.error(`Error in initText: ${error.message}`);
            socket.emit('error', 'Failed to get text');
        }
    }

    // Send server data to admin with room statistics
    handleGetData(socket) {
        try {
            const data = this.storage.getAllRooms();
            socket.emit('dataResponse', data);
        } catch (error) {
            logger.error(`Error in getData: ${error.message}`);
            socket.emit('error', 'Failed to get data');
        }
    }

    // Delete data on admin's request with confirmation
    handleDeleteData(socket) {
        try {
            // For security, only allow if there are no active users
            if (this.storage.hasActiveUsers()) {
                socket.emit('error', 'Cannot delete data while users are active');
                return;
            }

            // Clear all data
            Object.keys(this.storage.data).forEach(roomId => {
                this.storage.deleteRoom(roomId);
            });

            socket.emit('dataDeleted', 'All data deleted successfully');
        } catch (error) {
            logger.error(`Error in deleteData: ${error.message}`);
            socket.emit('error', 'Failed to delete data');
        }
    }

    // Handle user disconnection with proper cleanup
    async handleDisconnect(socket) {
        try {
            const roomId = socket.roomId;
            const userId = socket.userId;

            if (!roomId || !userId || !this.storage.getRoomData(roomId)) {
                return;
            }

            const userData = this.storage.disconnectUser(roomId, userId);
            if (userData) {
                clearTimeout(userData.timeoutId);

                const maxUsers = CONFIG.MAX_ROOM_SIZE;

                // Set cleanup timeout - only remove user if they don't reconnect
                const timeoutId = setTimeout(async () => {
                    try {
                        // Always delete user on disconnect (they closed tab or switched to local mode)
                        const newTotalCount = this.storage.removeUser(roomId, userId);

                        logger.info(`User ${userId} removed from room ${roomId} after grace period (${newTotalCount}/${maxUsers} users remaining)`);

                        // Check if room is now empty and delete it immediately
                        if (newTotalCount === 0) {
                            await this.storage.deleteRoom(roomId);
                            logger.info(`Room ${roomId} deleted - no users remaining`);
                        } else {
                            // Save room state if not empty
                            await this.storage.saveRoom(roomId);
                        }
                    } catch (error) {
                        logger.error(`Error in disconnect cleanup: ${error.message}`);
                    }
                }, CONFIG.DISCONNECT_GRACE_PERIOD);

                this.storage.setUserTimeout(roomId, userId, timeoutId);
            }
        } catch (error) {
            logger.error(`Error in disconnect handler: ${error.message}`);
        }
    }

    // Handle socket errors
    handleError(error) {
        logger.error(`Socket error: ${error.message || error}`);
    }
}

module.exports = SocketHandlers;
