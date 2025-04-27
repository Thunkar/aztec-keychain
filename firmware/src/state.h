#pragma once

#include <Arduino.h>
#include "board.h"

struct State {
    // Button state
    int lastButtonState;  
    // Mode
    bool setupMode;
    // Status
    int status;
    // Next time tasks should be run in ns
    unsigned long nextRun[N_TASKS];
    // Active tasks
    bool activeTasks[N_TASKS];
};

extern State state;