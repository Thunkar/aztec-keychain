#include "serial_commands.h"


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
    char output[512];


    switch (type) {
      case SIGNATURE_REQUESTED: {
        int keyIndex = doc[F("data")][F("index")];
        uint8_t signature[64];
        KeyPair keyPair;
        readKeyPair(keyIndex, &keyPair);
        JsonArray pk_array = doc[F("data")][F("pk")];
        for(int i = 0; i < 32; i++) {
          if(pk_array[i] != keyPair.pk[i]) {
            setError(INVALID_PK);
            response[F("type")] = ERROR;
            response[F("data")][F("error")] = "Invalid public key";
            serializeJson(response, output);
            Serial.println(output);
            return { false, 0 };
          }
        }
        JsonArray data_array = doc[F("data")][F("msg")];
        uint8_t data[32];
        for (int i = 0; i < 32; i++) {
          data[i] = data_array[i];
        }

        state.currentSignatureRequest = { index: keyIndex, *data };
        state.status = SIGNING;
        response[F("type")] = SIGNATURE_REQUEST_ACCEPTED;
        serializeJson(response, output);
        Serial.println(output);
        break;
      }
      default:
        // Unknown command
        setError(UNKNOWN);
    }
    

  }
  return { true, 0 };
}