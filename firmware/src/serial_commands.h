#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>
#include "stats.h"
#include "board.h"
#include "config.h"
#include "curve.h"
#include "SPIFFS.h"
#include "StreamUtils.h"

enum Command {
    SIGNATURE_REQUEST,
    SIGNATURE_ACCEPTED_RESPONSE,
    SIGNATURE_REJECTED_RESPONSE,
    GET_ACCOUNT_REQUESTED,
    GET_ACCOUNT_RESPONSE,
    GET_ARTIFACT_REQUEST,
    GET_ARTIFACT_RESPONSE_START,
    ERROR,
};

TaskResult readCommands(unsigned long now);