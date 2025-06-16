const roomService = require('./roomService');

// Map to track empty rooms and their timeout IDs
const emptyRoomTimeouts = new Map();
const EMPTY_ROOM_TIMEOUT = 3 * 60 * 1000; // 3 minutes in milliseconds

// Callback function to be called when a room is automatically deleted
let roomDeletionCallback = null;

/**
 * Set a callback function to be called when a room is automatically deleted
 * @param {Function} callback - Function to call when room is deleted (roomCode) => void
 */
function setRoomDeletionCallback(callback) {
    roomDeletionCallback = callback;
}

/**
 * Starts the cleanup timer for a room when it becomes empty
 * @param {string} roomCode - The room code to track
 */
function startEmptyRoomTimer(roomCode) {
    // Clear existing timer if any
    if (emptyRoomTimeouts.has(roomCode)) {
        clearTimeout(emptyRoomTimeouts.get(roomCode));
    }

    console.log(`🗑️ Starting cleanup timer for empty room: ${roomCode} (3 minutes)`);
    const timeoutId = setTimeout(() => {
        const room = roomService.getRoom(roomCode);

        // Double-check that room is still empty before deleting
        if (room && room.members.length === 0) {
            console.log(`🗑️ Deleting empty room after timeout: ${roomCode}`);
            roomService.deleteRoom(roomCode);
            emptyRoomTimeouts.delete(roomCode);

            // Call the deletion callback if set
            if (roomDeletionCallback) {
                roomDeletionCallback(roomCode, room);
            }

            // Notify about room deletion (optional - for monitoring)
            console.log(`✅ Room ${roomCode} has been automatically deleted due to inactivity`);
        } else if (room) {
            console.log(`🗑️ Room ${roomCode} is no longer empty, canceling deletion`);
            emptyRoomTimeouts.delete(roomCode);
        } else {
            // Room already deleted
            emptyRoomTimeouts.delete(roomCode);
        }
    }, EMPTY_ROOM_TIMEOUT);

    emptyRoomTimeouts.set(roomCode, timeoutId);
}

/**
 * Cancels the cleanup timer for a room when members join
 * @param {string} roomCode - The room code to stop tracking
 */
function cancelEmptyRoomTimer(roomCode) {
    if (emptyRoomTimeouts.has(roomCode)) {
        console.log(`🗑️ Canceling cleanup timer for room: ${roomCode} (members joined)`);
        clearTimeout(emptyRoomTimeouts.get(roomCode));
        emptyRoomTimeouts.delete(roomCode);
    }
}

/**
 * Checks if a room is empty and manages cleanup timers accordingly
 * @param {string} roomCode - The room code to check
 */
function handleRoomMembershipChange(roomCode) {
    const room = roomService.getRoom(roomCode);

    if (!room) {
        // Room doesn't exist, cancel any timers
        cancelEmptyRoomTimer(roomCode);
        return;
    }

    if (room.members.length === 0) {
        // Room is empty, start cleanup timer
        startEmptyRoomTimer(roomCode);
    } else {
        // Room has members, cancel cleanup timer
        cancelEmptyRoomTimer(roomCode);
    }
}

/**
 * Gets the current status of all cleanup timers (for debugging/monitoring)
 * @returns {Object} Status information about cleanup timers
 */
function getCleanupStatus() {
    const activeTimers = Array.from(emptyRoomTimeouts.keys());
    const rooms = roomService.rooms;

    // Additional safety check - find any empty rooms not being tracked
    const emptyRoomsNotTracked = [];
    rooms.forEach((room, roomCode) => {
        if (room.members.length === 0 && !emptyRoomTimeouts.has(roomCode)) {
            emptyRoomsNotTracked.push(roomCode);
        }
    });

    return {
        emptyRoomsBeingTracked: activeTimers.length,
        roomCodes: activeTimers,
        timeoutDuration: EMPTY_ROOM_TIMEOUT,
        emptyRoomsNotTracked: emptyRoomsNotTracked,
        totalRooms: rooms.size
    };
}

/**
 * Force cleanup all timers (useful for server shutdown)
 */
function clearAllTimers() {
    console.log(`🗑️ Clearing ${emptyRoomTimeouts.size} room cleanup timers`);
    emptyRoomTimeouts.forEach((timeoutId) => {
        clearTimeout(timeoutId);
    });
    emptyRoomTimeouts.clear();
}

module.exports = {
    handleRoomMembershipChange,
    startEmptyRoomTimer,
    cancelEmptyRoomTimer,
    getCleanupStatus,
    clearAllTimers,
    setRoomDeletionCallback,
    EMPTY_ROOM_TIMEOUT
};
