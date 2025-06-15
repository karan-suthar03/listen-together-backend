const roomService = require('../services/roomService');
const roomCleanupService = require('../services/roomCleanupService');
const { createSuccessResponse } = require('../middleware/response');

class ParticipantController {
  async getParticipants(req, res) {
    const { roomCode } = req.params;
    const participants = roomService.getParticipants(roomCode);
    
    if (!participants) {
      throw new Error('Room not found');
    }
    
    return createSuccessResponse(participants, 'Participants retrieved successfully');
  }
  async addParticipant(req, res) {
    const { roomCode } = req.params;
    const { user } = req.body;
    
    if (!user || !user.id || !user.name) {
      throw new Error('Invalid user data provided');
    }
    
    const room = roomService.addParticipant(roomCode, user);
    
    if (!room) {
      throw new Error('Room not found');
    }
    
    // Handle room membership change for cleanup
    roomCleanupService.handleRoomMembershipChange(roomCode);
    
    // Emit socket events to notify other users about the new participant
    if (req.io) {
      console.log('🚪 Emitting socket events for HTTP user join:', { roomCode, user });
      req.io.to(roomCode).emit('room-updated', room);
      req.io.to(roomCode).emit('user-joined', { user, room });
    }
    
    return createSuccessResponse({
      room,
      user,
      participantCount: room.members.length
    }, 'Participant added successfully');
  }
  async removeParticipant(req, res) {
    const { roomCode, userId } = req.params;
    
    const result = roomService.removeParticipant(roomCode, userId);
    
    if (!result || !result.room) {
      throw new Error('Room not found or participant not found');
    }
    
    // Handle room membership change for cleanup
    roomCleanupService.handleRoomMembershipChange(roomCode);
    
    // Emit socket events to notify other users about the participant leaving
    if (req.io) {
      console.log('🚪 Emitting socket events for HTTP user leave:', { roomCode, userId });
      req.io.to(roomCode).emit('room-updated', result.room);
      req.io.to(roomCode).emit('user-left', { user: result.removedUser, room: result.room });
    }
    
    return createSuccessResponse({
      room: result.room,
      participantCount: result.room.members.length
    }, 'Participant removed successfully');
  }

  async updateParticipant(req, res) {
    const { roomCode, userId } = req.params;
    const { updateData } = req.body;
    
    const room = roomService.updateParticipant(roomCode, userId, updateData);
    
    if (!room) {
      throw new Error('Room not found or participant not found');
    }
    
    const updatedParticipant = room.members.find(m => m.id === userId);
    
    // Emit socket events to notify other users about the participant update
    if (req.io) {
      console.log('🚪 Emitting socket events for HTTP participant update:', { roomCode, userId, updateData });
      req.io.to(roomCode).emit('room-updated', room);
      req.io.to(roomCode).emit('participant-updated', { user: updatedParticipant, room });
    }
    
    return createSuccessResponse({
      participant: updatedParticipant,
      room
    }, 'Participant updated successfully');
  }
}

module.exports = new ParticipantController();
