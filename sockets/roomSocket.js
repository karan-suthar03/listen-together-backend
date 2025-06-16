const roomService = require('../services/roomService');
const roomCleanupService = require('../services/roomCleanupService');
const disconnectionService = require('../services/disconnectionService');

const socketUserRoom = new Map();

function registerRoomSocket(io) {
    io.on('connection', (socket) => {
        socket.on('join-room', async ({roomCode, user}) => {
            socket.join(roomCode);
            socketUserRoom.set(socket.id, {user, roomCode});

            disconnectionService.handleUserReconnect(roomCode, user.id, socket.id, io);

            const room = roomService.addParticipant(roomCode, user);
            if (room) {
                roomCleanupService.handleRoomMembershipChange(roomCode);

                io.to(roomCode).emit('room-updated', room);
                socket.to(roomCode).emit('user-joined', {user, room});

                const syncData = await roomService.getPlaybackSync(roomCode);
                if (syncData) {
                    socket.emit('music-state', syncData);
                }
            }
        });
        socket.on('leave-room', ({roomCode}) => {
            const info = socketUserRoom.get(socket.id);
            if (info && info.roomCode === roomCode) {
                socket.leave(roomCode);

                const result = disconnectionService.forceRemoveUser(roomCode, info.user.id, io);

                socketUserRoom.delete(socket.id);
            }
        });
        socket.on('disconnect', () => {
            const info = socketUserRoom.get(socket.id);
            if (info) {
                const {roomCode, user} = info;

                disconnectionService.handleUserDisconnect(roomCode, user.id, socket.id, io);

                socketUserRoom.delete(socket.id);
            }
        });
        socket.on('get-participants', ({roomCode}) => {
            const participants = roomService.getParticipants(roomCode);
            if (participants) {
                socket.emit('participant-list', participants);
            } else {
                socket.emit('error', {message: 'Room not found'});
            }
        });
    });
}

module.exports = registerRoomSocket;
