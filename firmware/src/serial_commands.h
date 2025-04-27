#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>
#include "stats.h"
#include "board.h"
#include "config.h"
#include "curve.h"

enum Command {
    SIGNATURE_REQUESTED,
    SIGNATURE_REQUEST_REJECTED,
    GET_KEY_REQUESTED,
    KEY,
    ERROR,
    SIGNATURE,
};

TaskResult readCommands(unsigned long now);