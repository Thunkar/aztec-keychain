#include <Arduino.h>
#include "board.h"
#include "state.h"
#include "stats.h"
#include "scheduler.h"
#include "serial_commands.h"
#include "captive_portal.h"

#define DEBUG

void ONSequence() {
  unsigned long now = micros();
  unsigned long lastCheck = now;
  digitalWrite(LED, HIGH);
  while(digitalRead(BUTTON)){
    state.setupMode = (lastCheck - now) > SETUP_MODE_DELAY;
    lastCheck = micros();
    if(state.setupMode) {
      digitalWrite(LED, LOW);
      break;
    }
  };
}

task tasks[N_TASKS] = { readCommands, doServerWork, printStats };

void loop() {
  schedule(tasks);
}

void setup() {
  pinMode(BUTTON, INPUT_PULLDOWN);

  ONSequence();
  setupCurve();
  setupEEPROM();

  if(state.setupMode) {
    state.activeTasks[1] = true;
  }

  Serial.begin(115200);
  Serial.setRxBufferSize(1024);
  Serial.setTxBufferSize(1024);

  if(state.activeTasks[1]) {
    if(!SPIFFS.begin(true)){
      Serial.println(F("An Error has occurred while mounting SPIFFS"));
      return;
    }
    WiFi.softAP("Aztec keychain");
    setupServer();
    #ifdef DEBUG
    Serial.println(F("Setup mode"));
    #endif
  } 

  #ifdef DEBUG
  Serial.println(F("Keychain ready"));
  #endif
}
