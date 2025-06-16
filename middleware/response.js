const createSuccessResponse = (data, message = 'Success') => ({
    success: true,
    message,
    data
});

const createErrorResponse = (error, statusCode = 500, details = null) => ({
    success: false,
    error: typeof error === 'string' ? error : error.message,
    statusCode,
    ...(details && {details})
});

const sendResponse = (res, statusCode, response) => {
    res.status(statusCode).json(response);
};

const handleError = (res, error, context = 'Operation') => {
    console.error(`${context} error:`, error);

    if (error.name === 'ValidationError') {
        return sendResponse(res, 400, createErrorResponse(error, 400));
    }

    if (error.message === 'Room not found') {
        return sendResponse(res, 404, createErrorResponse(error, 404));
    }

    if (error.message === 'Not found') {
        return sendResponse(res, 404, createErrorResponse(error, 404));
    }

    sendResponse(res, 500, createErrorResponse('Internal server error', 500));
};

const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
        handleError(res, error);
    });
};

module.exports = {
    createSuccessResponse,
    createErrorResponse,
    sendResponse,
    handleError,
    asyncHandler
};
