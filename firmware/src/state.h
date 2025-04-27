#pragma once

#include <Arduino.h>
#include "board.h"

enum KeyChainStatus {
    IDLE,
    GENERATING_KEY,
    SIGNING
};

struct CurrentSignatureRequest {
    int index;
    uint8_t msg[32];
};

struct State {
    // Button state
    int lastButtonState;  
    // Mode
    bool setupMode;
    // Status
    KeyChainStatus status;
    // Next time tasks should be run in ns
    unsigned long nextRun[N_TASKS];
    // Active tasks
    bool activeTasks[N_TASKS];
    // Current signature request
    CurrentSignatureRequest currentSignatureRequest;
};

extern State state;