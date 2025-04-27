#pragma once

#include <Arduino.h>
#include "stats.h"
#include "state.h"

typedef TaskResult (*task)(unsigned long);
void schedule(task tasks[]);