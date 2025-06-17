const roomService = require('./roomService');
const roomCleanupService = require('./roomCleanupService');

const disconnectedUsers = new Map();
const DISCONNECT_TIMEOUT = 60 * 1000;

function handleUserDisconnect(roomCode, userId, socketId, io) {
    console.log(`🔌 User ${userId} disconnected from room ${roomCode}, starting grace period...`);

    const room = roomService.markUserDisconnected(roomCode, userId);
    if (!room) {
        console.log(`❌ Room ${roomCode} not found when marking user disconnected`);
        return;
    }

    io.to(roomCode).emit('room-updated', room);
    io.to(roomCode).emit('user-disconnected', {
        userId,
        user: room.members.find(m => m.id === userId),
        room
    });

    if (disconnectedUsers.has(userId)) {
        clearTimeout(disconnectedUsers.get(userId).timeoutId);
    }
    const timeoutId = setTimeout(() => {
        console.log(`⏰ Grace period expired for user ${userId}, removing from room ${roomCode}`);

        const result = roomService.removeParticipant(roomCode, userId);
        if (result && result.room) {
            roomCleanupService.handleRoomMembershipChange(roomCode);

            io.to(roomCode).emit('room-updated', result.room);
            io.to(roomCode).emit('user-left', {
                user: result.removedUser,
                room: result.room,
                reason: 'timeout'
            });

            if (result.newHost) {
                io.to(roomCode).emit('host-changed', {
                    newHost: result.newHost,
                    previousHost: result.removedUser,
                    reason: 'host-left',
                    room: result.room
                });
            }

            console.log(`🚪 User ${userId} finally removed from room ${roomCode} after grace period`);
        }

        disconnectedUsers.delete(userId);
    }, DISCONNECT_TIMEOUT);

    disconnectedUsers.set(userId, {
        timeoutId,
        roomCode,
        userId,
        disconnectedAt: Date.now()
    });
}

function handleUserReconnect(roomCode, userId, socketId, io) {
    console.log(`🔌 User ${userId} reconnected to room ${roomCode}, canceling removal timeout`);

    if (disconnectedUsers.has(userId)) {
        const disconnectData = disconnectedUsers.get(userId);
        clearTimeout(disconnectData.timeoutId);
        disconnectedUsers.delete(userId);

        console.log(`✅ Removal timeout canceled for user ${userId}`);
    }

    const room = roomService.markUserConnected(roomCode, userId);
    if (room) {
        io.to(roomCode).emit('room-updated', room);
        io.to(roomCode).emit('user-reconnected', {
            userId,
            user: room.members.find(m => m.id === userId),
            room
        });

        console.log(`🎉 User ${userId} marked as reconnected in room ${roomCode}`);
    }
}

function forceRemoveUser(roomCode, userId, io) {
    console.log(`🚪 Force removing user ${userId} from room ${roomCode}`);

    if (disconnectedUsers.has(userId)) {
        const disconnectData = disconnectedUsers.get(userId);
        clearTimeout(disconnectData.timeoutId);
        disconnectedUsers.delete(userId);
    }

    const result = roomService.removeParticipant(roomCode, userId);
    if (result && result.room) {
        roomCleanupService.handleRoomMembershipChange(roomCode);

        io.to(roomCode).emit('room-updated', result.room);
        io.to(roomCode).emit('user-left', {
            user: result.removedUser,
            room: result.room,
            reason: 'explicit'
        });

        if (result.newHost) {
            io.to(roomCode).emit('host-changed', {
                newHost: result.newHost,
                previousHost: result.removedUser,
                reason: 'host-left',
                room: result.room
            });
        }
    }

    return result;
}

function getDisconnectionStatus() {
    return {
        pendingRemovals: disconnectedUsers.size,
        users: Array.from(disconnectedUsers.values()).map(data => ({
            userId: data.userId,
            roomCode: data.roomCode,
            disconnectedAt: data.disconnectedAt,
            timeRemaining: Math.max(0, DISCONNECT_TIMEOUT - (Date.now() - data.disconnectedAt))
        }))
    };
}

function clearAllTimers() {
    console.log(`🗑️ Clearing ${disconnectedUsers.size} disconnection timers`);
    disconnectedUsers.forEach((data) => {
        clearTimeout(data.timeoutId);
    });
    disconnectedUsers.clear();
}

module.exports = {
    handleUserDisconnect,
    handleUserReconnect,
    forceRemoveUser,
    getDisconnectionStatus,
    clearAllTimers,
    DISCONNECT_TIMEOUT
};
