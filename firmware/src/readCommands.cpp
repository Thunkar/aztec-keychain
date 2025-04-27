#include "readCommands.h"


TaskResult readCommands(unsigned long now) {
  // Read commands from the serial port
  if (Serial.available()) {
    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, Serial);

    if (error) {
        setError(JSON_PARSE);
        return { false, 0 };
    }

    JsonDocument response;
    Command type = doc[F("type")]; 

    switch (type) {
      case SIGN: {
        int keyIndex = doc[F("data")][F("keyIndex")];
        uint8_t signature[64];
        KeyPair keyPair;
        readKeyPair(keyIndex, &keyPair);
        JsonArray data_array = doc[F("data")][F("data")];
        uint8_t data[32];
        for (int i = 0; i < 32; i++) {
          data[i] = data_array[i];
        }
        sign(&keyPair, data, signature);

        response[F("type")] = SIGN;
        response[F("data")][F("signature")] = signature;

        serializeJson(doc, Serial);
        break;
      }
      default:
        // Unknown command
        setError(UNKNOWN);
        return { false, 0 };
    }
  }
  return { true, 0 };
}