#pragma once

#include <Arduino.h>
#include "board.h"
#include "state.h"

const int ERROR_TYPES = 3;

enum ErrorCode {
    UNKNOWN,
    JSON_PARSE,
    INVALID_PK
};

struct Stats {
    unsigned long successes[N_TASKS];
    unsigned long failures[N_TASKS];
    unsigned long times[N_TASKS];
    unsigned long maxTimes[N_TASKS];
    unsigned long minTimes[N_TASKS];
    unsigned long loops;
    unsigned long errors[ERROR_TYPES];
};

struct ComputedStats {
    float taskFrequencies[N_TASKS];
    float taskMeanTimes[N_TASKS];
    float taskRatios[N_TASKS];
    float loopFrequency;
    float errorsPerSecond[ERROR_TYPES];
};

extern Stats stats;
extern ComputedStats computedStats;

TaskResult printStats(unsigned long now);

void setError(ErrorCode code);
char* getReason(ErrorCode code);