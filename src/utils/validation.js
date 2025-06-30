// Utility functions for data validation and sanitization

const sanitizeRoomId = (roomId) => {
    if (!roomId || typeof roomId !== 'string') return null;
    // Allow only alphanumeric characters and hyphens
    return roomId.replace(/[^a-zA-Z0-9-]/g, '').substring(0, 50);
};

const sanitizeUserId = (userId) => {
    if (!userId || typeof userId !== 'string') return null;
    return userId.replace(/[^a-zA-Z0-9-]/g, '').substring(0, 50);
};

const sanitizeText = (text, maxLength) => {
    if (typeof text !== 'string') return '';
    if (text.length > maxLength) {
        return text.substring(0, maxLength);
    }
    return text;
};

const isObjEmpty = (obj) => {
    if (!obj) return true;
    return Object.keys(obj).length === 0;
};

module.exports = {
    sanitizeRoomId,
    sanitizeUserId,
    sanitizeText,
    isObjEmpty
};
