#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>
#include "stats.h"
#include "board.h"
#include "config.h"
#include "curve.h"

enum Command {
    SIGN,
};

TaskResult readCommands(unsigned long now);