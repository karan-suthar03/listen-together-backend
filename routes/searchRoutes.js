const express = require('express');
const router = express.Router();
const searchController = require('../controllers/searchController');
const {asyncHandler, sendResponse} = require('../middleware/response');

router.get('/',
    asyncHandler(async (req, res) => {
        const result = await searchController.searchMusic(req, res);
        sendResponse(res, 200, result);
    })
);

router.get('/suggestions',
    asyncHandler(async (req, res) => {
        const result = await searchController.getSuggestions(req, res);
        sendResponse(res, 200, result);
    })
);

module.exports = router;
