#include "stats.h"

char *TASK_NAMES[] = { "readCommands", "doServerWork", "printStats" };

unsigned long lastRun = 0;

Stats stats = {
    // Successes
    { 0, 0, 0 },
    // Failures
    { 0, 0, 0 },
    // Times
    { 0, 0, 0 },
    { 0, 0, 0 },
    { 10000000, 10000000, 10000000 },
    // Loops
    0,
    // Errors
    { 0 }
};

ComputedStats computedStats = {
    // Task frequencies
    { 0, 0, 0 },
    // Task mean times
    { 0, 0, 0 },
    // Task ratios
    { 0, 0, 0},
    // Loop frequency
    0,
    // Errors per second
    { 0  }
};

void resetStats() {
    for(int i = 0; i < N_TASKS; i++) {
      stats.successes[i] = 0;
      stats.failures[i] = 0;
      stats.times[i] = 0;
      stats.maxTimes[i] = 0;
      stats.minTimes[i] = 10000000;
    }
    stats.loops = 0;
    for(int i = 0; i < ERROR_TYPES; i++) {
        stats.errors[i] = 0;
    }
}

void setError(ErrorCode code) {
  stats.errors[code]++;
}

char* getReason(ErrorCode code) {
  switch(code) {
    case JSON_PARSE:
      return "JSON parse";
    case INVALID_PK:
      return "Invalid public key";
    default:
      return "Unknown error";
  }
}

void computeStats(unsigned long now) {
  // In seconds
  float ellapsed = (now - lastRun)/1e6;
  for(int i = 0; i < N_TASKS; i++) {
    if(!state.activeTasks[i]) {
        continue;
    }
    long executions = stats.successes[i] + stats.failures[i];
    computedStats.taskFrequencies[i] = stats.successes[i] / ellapsed;
    computedStats.taskMeanTimes[i] = stats.times[i] / (float)executions;
    computedStats.taskRatios[i] = stats.successes[i]/(float)executions;
  }
  computedStats.loopFrequency = stats.loops / ellapsed;
  for(int i = 0; i < ERROR_TYPES; i++) {
    computedStats.errorsPerSecond[i] = stats.errors[i] / ellapsed;
  }
  lastRun = now;
}

TaskResult printStats(unsigned long now) {
  computeStats(now);
  #ifdef DEBUG
  char titleBuffer[150];
  sprintf(titleBuffer, "%-23s | %8s | %8s | %11s | %8s | %3s", "Task", "Freq", "Min", "Mean", "Max", "Ratio");
  Serial.println(titleBuffer);
  Serial.println(F("-----------------------------------------------------------------------------"));
  for(int i = 0; i < N_TASKS; i++) {
    if(!state.activeTasks[i]) {
        continue;
    }
    char prBuffer[150];
    sprintf(prBuffer, "%-23s | %6.2fHz | %6dus | ~%8.2fus | %6dus | %.2f", TASK_NAMES[i], computedStats.taskFrequencies[i], stats.minTimes[i], computedStats.taskMeanTimes[i], stats.maxTimes[i], computedStats.taskRatios[i]);
    Serial.print(prBuffer);
    Serial.println("");
  }
  Serial.println(F("-----------------------------------------------------------------------------"));
  Serial.print(F("Loop frequency: "));
  Serial.print(computedStats.loopFrequency);
  Serial.println(F("Hz"));
  Serial.println("");
  sprintf(titleBuffer, "%-23s | %8s", "Error code", "Count/s");
  Serial.println(titleBuffer);
  Serial.println(F("-------------------------------------"));
  for(int i = 0; i < ERROR_TYPES; i++) {
    char prBuffer[150];
    sprintf(prBuffer, "%-23s | %5.2f", getReason((ErrorCode)i), computedStats.errorsPerSecond[i]);
    Serial.println(prBuffer);
  }
  Serial.println(F("-------------------------------------"));
  #endif
  resetStats();
  return { true, 0 };
}