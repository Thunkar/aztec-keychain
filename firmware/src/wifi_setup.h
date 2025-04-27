#pragma once

#include <Arduino.h>
#include <WiFi.h>
#include <ArduinoJson.h>
#include <AsyncJson.h>
#include "ESPAsyncWebServer.h"
#include <DNSServer.h>
#include "SPIFFS.h"
#include "curve.h"
#include "config.h"
#include "state.h"
#include "scheduler.h"

void setupServer();

TaskResult doServerWork(unsigned long now);
