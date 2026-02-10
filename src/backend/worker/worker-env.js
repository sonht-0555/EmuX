// ===== Worker Environment Module =====
var POINTER_CACHE = {};
var activeVars = {};

const getPointer = (string, pointer) => {
    if (POINTER_CACHE[string]) return POINTER_CACHE[string];
    pointer = Module._malloc(string.length + 1);
    Module.stringToUTF8(string, pointer, string.length + 1);
    POINTER_CACHE[string] = pointer;
    return pointer;
};

function env_cb(command, data) {
    const d32 = Number(data) >> 2;
    if (command === 1) { // SET_PIXEL_FORMAT
        pixelFormat = Module.HEAP32[d32];
        return true;
    }
    if (command === 15) { // GET_VARIABLE
        const key = Module.UTF8ToString(Module.HEAP32[d32]);
        if (activeVars[key]) { Module.HEAP32[d32 + 1] = getPointer(activeVars[key]); return true; }
    }
    if (command === 9 || command === 31) { // GET_SYSTEM_DIRECTORY, GET_SAVE_DIRECTORY
        Module.HEAP32[d32] = getPointer('.');
        return true;
    }
    return command === 10; // GET_VARIABLE_UPDATE
}
