
const { youtubeMusicSearch, getTrackData } = require('@hydralerne/youtube-api');
const ytSearch = require('yt-search');
const { createSuccessResponse, createErrorResponse } = require('../middleware/response');
const { urlValidators } = require('../utils/helpers');
const spotifyService = require('../services/spotifyService');

const searchYouTube = async (req, res) => {
    try {
        const { q: query, limit = 10 } = req.query;

        if (!query) {
            return res.status(400).json(createErrorResponse('Search query is required', 400));
        }

        let videos = [];        // Check if the query is a Spotify URL
        if (urlValidators.spotify(query)) {
            console.log('🎵 Detected Spotify URL:', query);
            try {
                console.log('🔄 Processing Spotify URL...');
                const spotifyResult = await spotifyService.processSpotifyUrl(query);
                console.log('🎵 Spotify result:', spotifyResult);
                
                if (spotifyResult && spotifyResult.type === 'track') {
                    const video = {
                        videoId: spotifyResult.videoId,
                        title: spotifyResult.title || spotifyResult.spotifyTitle,
                        description: spotifyResult.spotifyAlbum || 'No description available',
                        duration: {
                            seconds: spotifyResult.duration || 0,
                            timestamp: (() => {
                                const totalSeconds = spotifyResult.duration || 0;
                                const hours = Math.floor(totalSeconds / 3600);
                                const minutes = Math.floor((totalSeconds % 3600) / 60);
                                const seconds = totalSeconds % 60;
                                
                                if (hours > 0) {
                                    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                                } else {
                                    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
                                }
                            })()
                        },
                        thumbnail: spotifyResult.thumbnail || spotifyResult.spotifyThumbnail,
                        views: 0,
                        author: {
                            name: spotifyResult.artist || spotifyResult.spotifyArtist || 'Unknown Artist',
                            url: spotifyResult.youtubeUrl || ''
                        },
                        ago: 'Spotify',
                        url: spotifyResult.youtubeUrl || `https://www.youtube.com/watch?v=${spotifyResult.videoId}`
                    };

                    return res.json(createSuccessResponse({
                        query,
                        results: [video],
                        total: 1,
                        isDirectLink: true,
                        source: 'spotify'
                    }, 'Spotify track found and matched to YouTube'));
                }            } catch (spotifyError) {
                console.error('❌ Error processing Spotify URL:', spotifyError);
                console.log('🔄 Falling back to regular search...');
                // Fall back to regular search if Spotify processing fails
            }
        }

        // Check if the query is a YouTube URL
        if (urlValidators.youtube(query)) {
            const videoId = urlValidators.extractYouTubeVideoId(query);
            
            if (videoId) {
                try {
                    // Search for the specific video by ID using getTrackData
                    const trackData = await getTrackData(videoId);
                    
                    if (trackData && trackData.title) {
                        const video = {
                            videoId: trackData.id || videoId,
                            title: trackData.title,
                            description: trackData.album || trackData.description || 'No description available',
                            duration: trackData.duration ? {
                                seconds: Math.floor(trackData.duration / 1000),
                                timestamp: (() => {
                                    const totalSeconds = Math.floor(trackData.duration / 1000);
                                    const hours = Math.floor(totalSeconds / 3600);
                                    const minutes = Math.floor((totalSeconds % 3600) / 60);
                                    const seconds = totalSeconds % 60;
                                    
                                    if (hours > 0) {
                                        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                                    } else {
                                        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
                                    }
                                })()
                            } : {
                                seconds: 0,
                                timestamp: '0:00'
                            },
                            thumbnail: trackData.poster || trackData.thumbnail,
                            views: trackData.viewCount || 0,
                            author: {
                                name: trackData.artist || trackData.channelTitle || 'Unknown Artist',
                                url: `https://www.youtube.com/channel/${trackData.channelId || ''}`
                            },
                            ago: trackData.uploadDate || trackData.albumID || 'Unknown',
                            url: `https://www.youtube.com/watch?v=${videoId}`
                        };

                        return res.json(createSuccessResponse({
                            query,
                            results: [video],
                            total: 1,
                            isDirectLink: true
                        }, 'YouTube video found successfully'));
                    }
                } catch (videoError) {
                    console.error('Error fetching video by ID with getTrackData:', videoError);
                    // Fall back to regular search if direct video fetch fails
                }
            }
        }

        try {
            // Regular search for text queries or if direct video fetch failed
            let searchResults = await youtubeMusicSearch(query, 'songs');

            console.log('Search results from @hydralerne/youtube-api:', searchResults);

            if (!searchResults || searchResults.length === 0) {
                throw new Error('Invalid response from @hydralerne/youtube-api');
            }

            searchResults = searchResults.filter(video => video.id && video.title && video.poster && video.duration);

            videos = searchResults.map(video => ({
                videoId: video.id,
                title: video.title,
                description: video.album || 'No description available',                duration: video.duration ? {
                    seconds: Math.floor(video.duration / 1000),
                    timestamp: (() => {
                        const totalSeconds = Math.floor(video.duration / 1000);
                        const hours = Math.floor(totalSeconds / 3600);
                        const minutes = Math.floor((totalSeconds % 3600) / 60);
                        const seconds = totalSeconds % 60;
                        
                        if (hours > 0) {
                            return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                        } else {
                            return `${minutes}:${seconds.toString().padStart(2, '0')}`;
                        }
                    })()
                } : {
                    seconds: 0,
                    timestamp: '0:00'
                },
                thumbnail: video.poster,
                views: video.viewCount || 0,
                author: {
                    name: video.artist,
                    url: `https://www.youtube.com/channel/${video.artistID}`
                },
                ago: video.albumID || 'Unknown',
                url: `https://www.youtube.com/watch?v=${video.id}`
            }));
        } catch (mainError) {
            console.error('Error with @hydralerne/youtube-api:', mainError);
            console.log('Falling back to yt-search...');

            // Fallback to yt-search
            const searchResults = await ytSearch(query);
            videos = searchResults.videos.slice(0, parseInt(limit)).map(video => ({
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
        }

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