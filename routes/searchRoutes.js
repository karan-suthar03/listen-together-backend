const express = require('express');
const router = express.Router();
const searchController = require('../controllers/searchController');

const {asyncHandler} = require('../middleware/response');

// Search YouTube videos
router.get('/youtube', asyncHandler(async (req, res) => {
    await searchController.searchYouTube(req, res);
}));

module.exports = router;
