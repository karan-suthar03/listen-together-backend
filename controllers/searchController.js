const ytSearch = require('yt-search');
const {createSuccessResponse} = require('../middleware/response');

class SearchController {
    async searchMusic(req, res) {
        const {query, limit = 20} = req.query;

        if (!query || query.trim().length === 0) {
            throw new Error('Search query is required');
        }

        try {
            console.log(`🔍 Searching for: "${query}"`);

            const searchResults = await ytSearch(query);

            if (!searchResults || !searchResults.videos) {
                return createSuccessResponse([], 'No results found');
            }
            const formattedResults = searchResults.videos
                .slice(0, limit)
                .filter(video =>
                    video.duration?.seconds > 30 &&
                    video.duration?.seconds < 600 &&
                    !video.title.toLowerCase().includes('podcast') &&
                    !video.title.toLowerCase().includes('interview') &&
                    !video.title.toLowerCase().includes('tutorial')
                )
                .map(video => ({
                    id: video.videoId,
                    title: video.title,
                    artist: video.author?.name || 'Unknown Artist',
                    album: 'YouTube',
                    duration: this.formatDuration(video.duration?.seconds || 0),
                    thumbnail: video.thumbnail || video.image,
                    youtubeUrl: video.url,
                    viewCount: video.views,
                    uploadDate: video.ago
                }));

            console.log(`🎵 Found ${formattedResults.length} relevant results for "${query}"`);

            return createSuccessResponse(formattedResults, `Found ${formattedResults.length} results`);

        } catch (error) {
            console.error('Search error:', error);
            throw new Error('Failed to search for music. Please try again.');
        }
    }

    formatDuration(seconds) {
        if (!seconds || seconds === 0) return '0:00';

        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        } else {
            return `${minutes}:${secs.toString().padStart(2, '0')}`;
        }
    }

    async getSuggestions(req, res) {
        try {
            const suggestions = [
                'trending music 2024',
                'top hits',
                'chill music',
                'pop music',
                'rock songs',
                'electronic music'
            ];

            return createSuccessResponse(suggestions, 'Suggestions retrieved successfully');
        } catch (error) {
            console.error('Suggestions error:', error);
            throw new Error('Failed to get suggestions');
        }
    }
}

module.exports = new SearchController();
