const express = require('express');
const router = express.Router();
const participantController = require('../controllers/participantController');
const {queueValidationRules, validateRequest} = require('../middleware/validation');
const {handleError, asyncHandler, sendResponse} = require('../middleware/response');


router.get('/:roomCode/participants',
    queueValidationRules.roomCode,
    validateRequest,
    asyncHandler(async (req, res) => {
        const result = await participantController.getParticipants(req, res);
        sendResponse(res, 200, result);
    })
);


router.post('/:roomCode/participants',
    queueValidationRules.roomCode,
    validateRequest,
    asyncHandler(async (req, res) => {
        const result = await participantController.addParticipant(req, res);
        sendResponse(res, 201, result);
    })
);


router.delete('/:roomCode/participants/:userId',
    queueValidationRules.roomCode,
    validateRequest,
    asyncHandler(async (req, res) => {
        const result = await participantController.removeParticipant(req, res);
        sendResponse(res, 200, result);
    })
);


router.put('/:roomCode/participants/:userId',
    queueValidationRules.roomCode,
    validateRequest,
    asyncHandler(async (req, res) => {
        const result = await participantController.updateParticipant(req, res);
        sendResponse(res, 200, result);
    })
);

// Get user info with server-validated host status
router.get('/:roomCode/user-info/:userId',
    queueValidationRules.roomCode,
    validateRequest,
    asyncHandler(async (req, res) => {
        const result = await participantController.getUserInfo(req, res);
        sendResponse(res, 200, result);
    })
);

router.get('/:roomCode',
    queueValidationRules.roomCode,
    validateRequest,
    asyncHandler(async (req, res) => {
        const {roomCode} = req.params;
        const room = await require('../services/roomService').getRoom(roomCode);

        if (!room) {
            throw new Error('Room not found');
        }

        const {createSuccessResponse} = require('../middleware/response');
        const result = createSuccessResponse(room, 'Room details retrieved successfully');
        sendResponse(res, 200, result);
    })
);

module.exports = router;
