const roomService = require('../services/roomService');
const musicService = require('../services/musicService');

function registerMusicSocket(io) {
  io.on('connection', (socket) => {    
    socket.on('music-control', async ({ roomCode, action, data, userId }) => {
      console.log(`🎵 Music control received:`, { roomCode, action, userId, data });
      
      const room = roomService.getRoom(roomCode);
      if (!room) {
        console.log(`❌ Room not found: ${roomCode}`);
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      console.log(`🏠 Room found with ${room.members.length} members:`, room.members.map(m => ({ id: m.id, name: m.name })));

      const isUserInRoom = room.members && room.members.some(p => p.id === userId);
      if (!isUserInRoom) {
        console.log(`❌ User ${userId} not found in room members:`, room.members.map(m => m.id));
        socket.emit('error', { message: 'User not in room' });
        return;
      }

      console.log(`✅ User ${userId} authorized for music control`);
      const updatedRoom = roomService.updatePlayback(roomCode, action, data);
      if (updatedRoom) {
        const syncData = await roomService.getPlaybackSync(roomCode);
        io.to(roomCode).emit('music-state', syncData);
        console.log(`Music control in room ${roomCode} by user ${userId}: ${action}`, data);
      }
    });

    socket.on('host-control', async ({ roomCode, action, data, userId }) => {
      const room = roomService.getRoom(roomCode);
      if (!room || room.hostId !== userId) {
        socket.emit('error', { message: 'Only host can control playback' });
        return;
      }

      const updatedRoom = roomService.updatePlayback(roomCode, action, data);
      if (updatedRoom) {
        const syncData = await roomService.getPlaybackSync(roomCode);
        io.to(roomCode).emit('music-state', syncData);
        console.log(`Host control in room ${roomCode}: ${action}`, data);
      }
    });    
    socket.on('sync-request', async ({ roomCode }) => {
      const syncData = await roomService.getPlaybackSync(roomCode);
      if (syncData) {
        socket.emit('music-state', syncData);
        console.log(`Sync sent to user in room ${roomCode}`);
      }
    });

    socket.on('get-music-meta', async () => {
      const metadata = await musicService.getMetadata();
      socket.emit('music-meta', metadata);
    });

  });
}

module.exports = registerMusicSocket;
