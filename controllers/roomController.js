const roomService = require('../services/roomService');
const { createSuccessResponse } = require('../middleware/response');

class RoomController {
  async createRoom(req, res) {
    const { name } = req.body;
    const result = await roomService.createRoom(name);
    
    return createSuccessResponse(result, 'Room created successfully');
  }
  async joinRoom(req, res) {
    const { code, name } = req.body;
    const result = await roomService.joinRoom(code, name);
    
    if (!result) {
      throw new Error('Room not found');
    }
    
    return createSuccessResponse(result, 'Joined room successfully');
  }
  async getRoomDetails(req, res) {
    const { roomCode } = req.params;
    const room = await roomService.getRoom(roomCode);
    
    if (!room) {
      throw new Error('Room not found');
    }
    
    return createSuccessResponse(room, 'Room details retrieved successfully');
  }
  async deleteRoom(req, res) {
    const { roomCode } = req.params;
    const result = await roomService.deleteRoom(roomCode);
    
    if (!result) {
      throw new Error('Room not found');
    }
    
    return createSuccessResponse({ roomCode }, 'Room deleted successfully');
  }
}

module.exports = new RoomController();
