#include "state.h"

State state = { 
    // Button state
    LOW,
    // Setup mode 
    false,
    // Status
    IDLE,
    // Next time tasks should be run in us
    { 0, 0, 0 },
    // Active tasks
    { 1, 1, 1 },
    // Current signature request
    { 0, { 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,0, 0, 0, 0, 0, 0, 0, 0 } },
    // Current sender
    { 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 }
};