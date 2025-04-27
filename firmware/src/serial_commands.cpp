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
    char output[256];


    switch (type) {
      case SIGNATURE_REQUESTED: {
        int keyIndex = doc[F("data")][F("index")];
        KeyPair keyPair;
        readKeyPair(keyIndex, &keyPair);
        JsonArray pk_array = doc[F("data")][F("pk")];
        for(int i = 0; i < 64; i++) {
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
        for (int i = 0; i < 64; i++) {
          state.currentSignatureRequest.msg[i] = data_array[i];
        }

        state.currentSignatureRequest.index = keyIndex;
        state.status = SIGNING;
        break;
      } 
      case GET_KEY_REQUESTED: {
        int keyIndex = doc[F("data")][F("index")];
        KeyPair keyPair;
        readKeyPair(keyIndex, &keyPair);
        response[F("type")] = KEY;
        JsonArray pk_array = response[F("data")][F("pk")].to<JsonArray>();
        for (int i = 0; i < 64; i++) {
          pk_array[i] = keyPair.pk[i];
        }
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