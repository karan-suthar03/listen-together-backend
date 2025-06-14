class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, field = null) {
    super(message, 400, 'VALIDATION_ERROR');
    this.field = field;
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
    this.resource = resource;
  }
}

class ConflictError extends AppError {
  constructor(message) {
    super(message, 409, 'CONFLICT');
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized access') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Forbidden access') {
    super(message, 403, 'FORBIDDEN');
  }
}

class RateLimitError extends AppError {
  constructor(message = 'Rate limit exceeded') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
  }
}

class ServiceUnavailableError extends AppError {
  constructor(service = 'Service') {
    super(`${service} is temporarily unavailable`, 503, 'SERVICE_UNAVAILABLE');
    this.service = service;
  }
}

class RoomNotFoundError extends NotFoundError {
  constructor(roomCode = null) {
    super('Room');
    this.roomCode = roomCode;
    this.message = roomCode ? `Room ${roomCode} not found` : 'Room not found';
  }
}

class RoomFullError extends ConflictError {
  constructor(roomCode = null) {
    super(roomCode ? `Room ${roomCode} is full` : 'Room is full');
    this.roomCode = roomCode;
  }
}

class ParticipantNotFoundError extends NotFoundError {
  constructor(userId = null) {
    super('Participant');
    this.userId = userId;
    this.message = userId ? `Participant ${userId} not found` : 'Participant not found';
  }
}

class InvalidUrlError extends ValidationError {
  constructor(url, platform = null) {
    const message = platform ? 
      `Invalid ${platform} URL: ${url}` : 
      `Invalid URL: ${url}`;
    super(message, 'url');
    this.url = url;
    this.platform = platform;
  }
}

class DownloadError extends AppError {
  constructor(message, videoId = null) {
    super(message, 500, 'DOWNLOAD_ERROR');
    this.videoId = videoId;
  }
}

class UnsupportedFormatError extends ValidationError {
  constructor(format) {
    super(`Unsupported format: ${format}`, 'format');
    this.format = format;
  }
}

module.exports = {
  AppError,
  ValidationError,
  NotFoundError,
  ConflictError,
  UnauthorizedError,
  ForbiddenError,
  RateLimitError,
  ServiceUnavailableError,
  RoomNotFoundError,
  RoomFullError,
  ParticipantNotFoundError,
  InvalidUrlError,
  DownloadError,
  UnsupportedFormatError
};
