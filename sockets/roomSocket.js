const roomService = require('../services/roomService');
const roomCleanupService = require('../services/roomCleanupService');
const disconnectionService = require('../services/disconnectionService');

const socketUserRoom = new Map();

function registerRoomSocket(io) {
    io.on('connection', (socket) => {
        socket.on('join-room', async ({roomCode, user}) => {
            // Validate required parameters
            if (!roomCode) {
                console.error('❌ join-room: roomCode is required');
                socket.emit('error', {message: 'Room code is required'});
                return;
            }

            if (!user || !user.id) {
                console.error('❌ join-room: user object with id is required');
                socket.emit('error', {message: 'User information is required'});
                return;
            }

            console.log(`🚪 User ${user.name || user.id} joining room ${roomCode}`);

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
                }                // Always send sync data to the joining user for immediate synchronization
                const syncData = await roomService.getPlaybackSync(roomCode);
                if (syncData) {
                    socket.emit('music-state', syncData);
                }
            }
        });
        socket.on('leave-room', ({roomCode}) => {
            if (!roomCode) {
                console.error('❌ leave-room: roomCode is required');
                return;
            }

            const info = socketUserRoom.get(socket.id);
            if (info && info.user && info.user.id && info.roomCode === roomCode) {
                console.log(`🚪 User ${info.user.name || info.user.id} leaving room ${roomCode}`);
                socket.leave(roomCode);

                const result = disconnectionService.forceRemoveUser(roomCode, info.user.id, io);

                socketUserRoom.delete(socket.id);
            } else {
                console.log(`🚪 Socket ${socket.id} tried to leave room ${roomCode} but not in that room`);
            }
        });
        socket.on('disconnect', () => {
            const info = socketUserRoom.get(socket.id);
            if (info && info.user && info.user.id && info.roomCode) {
                const {roomCode, user} = info;
                console.log(`🚪 User ${user.name || user.id} disconnecting from room ${roomCode}`);

                disconnectionService.handleUserDisconnect(roomCode, user.id, socket.id, io);

                socketUserRoom.delete(socket.id);
            } else {
                console.log(`🚪 Socket ${socket.id} disconnected without room info`);
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
        socket.on('transfer-host', ({roomCode, newHostId}) => {
            if (!roomCode || !newHostId) {
                socket.emit('error', {message: 'Room code and new host ID are required'});
                return;
            }

            const room = roomService.getRoom(roomCode);
            if (!room) {
                socket.emit('error', {message: 'Room not found'});
                return;
            }

            // Get current user info
            const info = socketUserRoom.get(socket.id);
            if (!info || !info.user || !info.user.id || info.roomCode !== roomCode) {
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
