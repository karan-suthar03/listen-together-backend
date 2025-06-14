const express = require('express');
const router = express.Router();
const roomController = require('../controllers/roomController');
const { queueValidationRules, validateRequest } = require('../middleware/validation');
const { handleError, asyncHandler, sendResponse } = require('../middleware/response');


router.post('/', 
  asyncHandler(async (req, res) => {
    const result = await roomController.createRoom(req, res);
    sendResponse(res, 201, result);
  })
);


router.post('/join',
  asyncHandler(async (req, res) => {
    const result = await roomController.joinRoom(req, res);
    sendResponse(res, 200, result);
  })
);


router.get('/:roomCode',
  queueValidationRules.roomCode,
  validateRequest,
  asyncHandler(async (req, res) => {
    const result = await roomController.getRoomDetails(req, res);
    sendResponse(res, 200, result);
  })
);


router.delete('/:roomCode',
  queueValidationRules.roomCode,
  validateRequest,
  asyncHandler(async (req, res) => {
    const result = await roomController.deleteRoom(req, res);
    sendResponse(res, 200, result);
  })
);


module.exports = router;
