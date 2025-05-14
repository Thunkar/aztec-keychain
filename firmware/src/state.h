#pragma once

#include <Arduino.h>
#include "board.h"

enum KeyChainStatus {
    IDLE,
    GENERATING_ACCOUNT,
    SELECTING_ACCOUNT,
    SIGNING,
    WAITING_FOR_SENDER_REQUEST,
};

struct CurrentSignatureRequest {
    int index;
    uint8_t msg[64];
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
    // Current sender
    char currentSender[67];
};

extern State state;