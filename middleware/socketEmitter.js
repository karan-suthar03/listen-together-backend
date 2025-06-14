class SocketEmitter {
  constructor(io) {
    this.io = io;
  }

  emitQueueUpdate(roomCode, queue, currentTrackIndex) {
    this.io.to(roomCode).emit('queueUpdated', {
      queue,
      currentTrackIndex
    });
  }

  emitMusicState(roomCode, syncData) {
    this.io.to(roomCode).emit('music-state', syncData);
  }

  emitWorkingStateChange(roomCode, isWorking, workingMessage = '') {
    this.io.to(roomCode).emit('roomWorkingStateChanged', {
      isWorking,
      workingMessage
    });
  }

  emitQueueItemProgress(roomCode, queueItemId, progress, status) {
    this.io.to(roomCode).emit('queueItemProgress', {
      queueItemId,
      progress,
      status
    });
  }

  emitRoomStateChange(roomCode, state) {
    this.io.to(roomCode).emit('roomStateChanged', state);
  }

  emitParticipantUpdate(roomCode, participants) {
    this.io.to(roomCode).emit('participantsUpdated', participants);
  }
}

module.exports = SocketEmitter;
