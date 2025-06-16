const roomService = require('../services/roomService');
const roomCleanupService = require('../services/roomCleanupService');
const disconnectionService = require('../services/disconnectionService');

const socketUserRoom = new Map();

function registerRoomSocket(io) {
    io.on('connection', (socket) => {        socket.on('join-room', async ({roomCode, user}) => {
            socket.join(roomCode);
            socketUserRoom.set(socket.id, {user, roomCode});

            disconnectionService.handleUserReconnect(roomCode, user.id, socket.id, io);

            const room = roomService.addParticipant(roomCode, user);
            if (room) {
                roomCleanupService.handleRoomMembershipChange(roomCode);

                // Check if this user became the host (first user in empty room)
                const joinedUser = room.members.find(m => m.id === user.id);
                const isNewHost = joinedUser && joinedUser.isHost;

                io.to(roomCode).emit('room-updated', room);
                socket.to(roomCode).emit('user-joined', {user: joinedUser, room});

                // Notify if user became host
                if (isNewHost) {
                    io.to(roomCode).emit('host-changed', {
                        newHost: joinedUser,
                        reason: 'first-user-in-empty-room',
                        room
                    });
                }

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
        });        socket.on('get-participants', ({roomCode}) => {
            const participants = roomService.getParticipants(roomCode);
            if (participants) {
                socket.emit('participant-list', participants);
            } else {
                socket.emit('error', {message: 'Room not found'});
            }
        });

        socket.on('transfer-host', ({roomCode, newHostId}) => {
            const room = roomService.getRoom(roomCode);
            if (!room) {
                socket.emit('error', {message: 'Room not found'});
                return;
            }

            // Get current user info
            const info = socketUserRoom.get(socket.id);
            if (!info || info.roomCode !== roomCode) {
                socket.emit('error', {message: 'You are not in this room'});
                return;
            }

            // Check if requester is current host
            if (room.hostId !== info.user.id) {
                socket.emit('error', {message: 'Only the current host can transfer host privileges'});
                return;
            }

            const result = roomService.transferHost(roomCode, newHostId);
            if (result) {
                io.to(roomCode).emit('room-updated', result.room);
                io.to(roomCode).emit('host-changed', {
                    newHost: result.newHost,
                    previousHost: room.members.find(m => m.id === info.user.id),
                    reason: 'manual-transfer',
                    room: result.room
                });
            } else {
                socket.emit('error', {message: 'Failed to transfer host. User not found or not in room.'});
            }
        });
    });
}

module.exports = registerRoomSocket;
