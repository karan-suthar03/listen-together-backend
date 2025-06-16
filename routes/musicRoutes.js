const express = require('express');
const router = express.Router();
const musicController = require('../controllers/musicController');
const {queueValidationRules, validateRequest} = require('../middleware/validation');
const {handleError, asyncHandler, sendResponse} = require('../middleware/response');

router.get('/sync/:roomCode',
    queueValidationRules.roomCode,
    validateRequest,
    asyncHandler(async (req, res) => {
        const result = await musicController.getPlaybackSync(req, res);
        sendResponse(res, 200, result);
    })
);

router.get('/stream/:filename',
    asyncHandler(async (req, res) => {
        await musicController.streamAudio(req, res);
    })
);

router.post('/playback/:roomCode',
    queueValidationRules.roomCode,
    validateRequest,
    asyncHandler(async (req, res) => {
        const result = await musicController.updatePlayback(req, res);
        sendResponse(res, 200, result);
    })
);

router.get('/info/:filename',
    asyncHandler(async (req, res) => {
        const result = await musicController.getAudioInfo(req, res);
        sendResponse(res, 200, result);
    })
);

module.exports = router;
