const roomService = require('../services/roomService');
const roomCleanupService = require('../services/roomCleanupService');
const {createSuccessResponse} = require('../middleware/response');

class RoomController {
    async createRoom(req, res) {
        const {name} = req.body;
        const result = await roomService.createRoom(name);

        return createSuccessResponse(result, 'Room created successfully');
    }

    async joinRoom(req, res) {
        const {code, name} = req.body;
        const result = await roomService.joinRoom(code, name);

        if (!result) {
            throw new Error('Room not found');
        }

        // Handle room membership change for cleanup
        roomCleanupService.handleRoomMembershipChange(code);

        // Emit socket events to notify other users about the new participant
        if (req.io) {
            console.log('🚪 Emitting socket events for HTTP room join:', {code, user: result.user});
            req.io.to(code).emit('room-updated', result.room);
            req.io.to(code).emit('user-joined', {user: result.user, room: result.room});
        }

        return createSuccessResponse(result, 'Joined room successfully');
    }

    async getRoomDetails(req, res) {
        const {roomCode} = req.params;
        const room = await roomService.getRoom(roomCode);

        if (!room) {
            throw new Error('Room not found');
        }

        return createSuccessResponse(room, 'Room details retrieved successfully');
    }

    async deleteRoom(req, res) {
        const {roomCode} = req.params;
        const result = await roomService.deleteRoom(roomCode);

        if (!result) {
            throw new Error('Room not found');
        }

        // Cancel any pending cleanup timers for the deleted room
        roomCleanupService.cancelEmptyRoomTimer(roomCode);

        return createSuccessResponse({roomCode}, 'Room deleted successfully');
    }

    async getCleanupStatus(req, res) {
        const status = roomCleanupService.getCleanupStatus();
        const roomStats = roomService.getRoomStats();

        return createSuccessResponse({
            cleanup: status,
            rooms: roomStats
        }, 'Cleanup status retrieved successfully');
    }
}

module.exports = new RoomController();
