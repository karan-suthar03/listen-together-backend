const express = require('express');
const router = express.Router();
const queueController = require('../controllers/queueController');
const {queueValidationRules, validateRequest} = require('../middleware/validation');
const {handleError, asyncHandler, sendResponse} = require('../middleware/response');

router.use((req, res, next) => {
    if (req.io && !queueController.socketEmitter) {
        queueController.initializeSocket(req.io);
    }
    next();
});

router.get('/:roomCode',
    queueValidationRules.roomCode,
    validateRequest,
    asyncHandler(async (req, res) => {
        const result = await queueController.getQueue(req, res);
        sendResponse(res, 200, result);
    })
);

router.post('/:roomCode/add',
    [...queueValidationRules.roomCode, ...queueValidationRules.addToQueue],
    validateRequest,
    asyncHandler(async (req, res) => {
        const result = await queueController.addToQueue(req, res);
        sendResponse(res, 201, result);
    })
);

router.delete('/:roomCode/:index',
    [...queueValidationRules.roomCode, ...queueValidationRules.removeFromQueue],
    validateRequest,
    asyncHandler(async (req, res) => {
        const result = await queueController.removeFromQueue(req, res);
        sendResponse(res, 200, result);
    })
);

router.put('/:roomCode/move',
    [...queueValidationRules.roomCode, ...queueValidationRules.moveInQueue],
    validateRequest,
    asyncHandler(async (req, res) => {
        const result = await queueController.moveInQueue(req, res);
        sendResponse(res, 200, result);
    })
);

router.get('/:roomCode/download-stats',
    queueValidationRules.roomCode,
    validateRequest,
    asyncHandler(async (req, res) => {
        const result = await queueController.getDownloadStats(req, res);
        sendResponse(res, 200, result);
    })
);

router.post('/:roomCode/refresh-downloads',
    queueValidationRules.roomCode,
    validateRequest,
    asyncHandler(async (req, res) => {
        const result = await queueController.refreshDownloadStatus(req, res);
        sendResponse(res, 200, result);
    })
);

router.post('/:roomCode/play/:index',
    [...queueValidationRules.roomCode, ...queueValidationRules.removeFromQueue], // Reuse index validation
    validateRequest,
    asyncHandler(async (req, res) => {
        const result = await queueController.playTrack(req, res);
        sendResponse(res, 200, result);
    })
);

module.exports = router;
