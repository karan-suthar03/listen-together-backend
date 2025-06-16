const roomService = require('../services/roomService');
const roomCleanupService = require('../services/roomCleanupService');
const disconnectionService = require('../services/disconnectionService');

const socketUserRoom = new Map();

function registerRoomSocket(io) {
  io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id);    socket.on('join-room', async ({ roomCode, user }) => {
      console.log('🚪 User joining room via socket:', { roomCode, user });
      socket.join(roomCode);
      socketUserRoom.set(socket.id, { user, roomCode });
      
      disconnectionService.handleUserReconnect(roomCode, user.id, socket.id, io);
      
      const room = roomService.addParticipant(roomCode, user);
      if (room) {
        console.log('🚪 Room after adding participant:', { 
          code: room.code, 
          memberCount: room.members.length,
          members: room.members.map(m => ({ id: m.id, name: m.name, connected: m.isConnected }))
        });
        
        roomCleanupService.handleRoomMembershipChange(roomCode);
        
        io.to(roomCode).emit('room-updated', room);
        socket.to(roomCode).emit('user-joined', { user, room });
        
        const syncData = await roomService.getPlaybackSync(roomCode);
        if (syncData) {
          socket.emit('music-state', syncData);
        }
        
        console.log(`User joined via socket:`, user);
      } else {
        console.log('🚪 Failed to add user to room:', { roomCode, user });
      }
    });      socket.on('leave-room', ({ roomCode }) => {
      const info = socketUserRoom.get(socket.id);
      if (info && info.roomCode === roomCode) {
        socket.leave(roomCode);
        
        const result = disconnectionService.forceRemoveUser(roomCode, info.user.id, io);
        
        socketUserRoom.delete(socket.id);
      }
    });      socket.on('disconnect', () => {
      const info = socketUserRoom.get(socket.id);
      if (info) {
        const { roomCode, user } = info;
        
        disconnectionService.handleUserDisconnect(roomCode, user.id, socket.id, io);
        
        socketUserRoom.delete(socket.id);
      }
    });
    
    socket.on('get-participants', ({ roomCode }) => {
      const participants = roomService.getParticipants(roomCode);
      if (participants) {
        socket.emit('participant-list', participants);
        console.log(`Sent participant list for room ${roomCode}:`, participants.length, 'participants');
      } else {
        socket.emit('error', { message: 'Room not found' });
      }
    });
  });
}

module.exports = registerRoomSocket;
