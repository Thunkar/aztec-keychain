#include "state.h"

State state = { 
    // Button state
    LOW,
    // Setup mode 
    false,
    // Status
    0, // 0 -> IDLE, 1 -> GENERATING KEY, 2 -> SIGNING
    // Next time tasks should be run in us
    { 0, 0, 0 },
    // Active tasks
    { 1, 1, 1 },
};