const ytSearch = require('yt-search');
const {createSuccessResponse, createErrorResponse} = require('../middleware/response');

const searchYouTube = async (req, res) => {
    try {
        const {q: query, limit = 10} = req.query;

        if (!query) {
            return res.status(400).json(createErrorResponse('Search query is required', 400));
        }

        // Search YouTube videos
        const searchResults = await ytSearch(query);

        // Filter only videos (not playlists or channels) and format the response
        const videos = searchResults.videos.slice(0, parseInt(limit)).map(video => ({
            videoId: video.videoId,
            title: video.title,
            description: video.description,
            duration: {
                seconds: video.duration.seconds,
                timestamp: video.duration.timestamp
            },
            thumbnail: video.thumbnail,
            views: video.views,
            author: {
                name: video.author.name,
                url: video.author.url
            },
            ago: video.ago,
            url: video.url
        }));

        return res.json(createSuccessResponse({
            query,
            results: videos,
            total: videos.length
        }, 'YouTube search completed successfully'));

    } catch (error) {
        console.error('YouTube search error:', error);
        return res.status(500).json(createErrorResponse('Failed to search YouTube', 500));
    }
};

module.exports = {
    searchYouTube
};