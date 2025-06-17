const {body, param, validationResult} = require('express-validator');

const validateRequest = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: errors.array()
        });
    }
    next();
};

const isYouTubeUrl = (url) => {
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)/;
    return youtubeRegex.test(url);
};

const isSpotifyUrl = (url) => {
    const spotifyRegex = /^(https?:\/\/)?(open\.)?spotify\.com\/(track|album|playlist)\/[a-zA-Z0-9]+/;
    return spotifyRegex.test(url);
};

const queueValidationRules = {
    addToQueue: [
        body('songData').notEmpty().withMessage('Song data is required'),
        body('addedBy').notEmpty().withMessage('Added by field is required'),
        body('songData.youtubeUrl').optional().custom((value) => {
            if (value && !isYouTubeUrl(value)) {
                throw new Error('Invalid YouTube URL');
            }
            return true;
        }),
        body('songData.spotifyUrl').optional().custom((value) => {
            if (value && !isSpotifyUrl(value)) {
                throw new Error('Invalid Spotify URL');
            }
            return true;
        })
    ],
    roomCode: [
        param('roomCode').isLength({min: 6, max: 6}).withMessage('Room code must be 6 characters')
    ],
    removeFromQueue: [
        param('index').isInt({min: 0}).withMessage('Index must be a non-negative integer')
    ], moveInQueue: [
        body('fromIndex').isInt({min: 0}).withMessage('From index must be a non-negative integer'),
        body('toIndex').isInt({min: 0}).withMessage('To index must be a non-negative integer')
    ],
    addSearchToQueue: [
        body('searchResult').notEmpty().withMessage('Search result data is required'),
        body('searchResult.id').notEmpty().withMessage('Search result ID is required'),
        body('searchResult.title').notEmpty().withMessage('Search result title is required'),
        body('searchResult.youtubeUrl').notEmpty().withMessage('YouTube URL is required'),
        body('searchResult.youtubeUrl').custom((value) => {
            if (!isYouTubeUrl(value)) {
                throw new Error('Invalid YouTube URL');
            }
            return true;
        }),
        body('addedBy').notEmpty().withMessage('Added by field is required')
    ]
};

module.exports = {
    validateRequest,
    queueValidationRules,
    isYouTubeUrl,
    isSpotifyUrl
};
