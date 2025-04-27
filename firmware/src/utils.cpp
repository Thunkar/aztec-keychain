#include "utils.h"

void writeDebug(const char *message) {
    Serial.print(F("[DEBUG] "));
    Serial.println(message);
}