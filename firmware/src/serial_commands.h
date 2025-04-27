#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>
#include "stats.h"
#include "board.h"
#include "config.h"
#include "curve.h"

enum Command {
    SIGNATURE_REQUESTED,
    SIGNATURE_REQUEST_IN_PROGRESS,
    SIGNATURE_REQUEST_ACCEPTED,
    SIGNATURE_REQUEST_REJECTED,
    ERROR,
    SIGNATURE,
};

TaskResult readCommands(unsigned long now);