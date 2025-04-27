#pragma once

#define DEBUG

// Pins

const int BUTTON = 3;
const int LED = 8;

const int RNG_SOURCE = 1;

// Scheduler

const int N_TASKS = 3;
struct TaskResult {
    bool success;
    long offset;
};

// Time in us to hold the button to enter setup mode

const int SETUP_MODE_DELAY = 5000 * 1e3; 