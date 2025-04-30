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
      case SIGNATURE_REQUEST: {
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
        response[F("type")] = GET_KEY_RESPONSE;
        JsonArray pk_array = response[F("data")][F("pk")].to<JsonArray>();
        for (int i = 0; i < 64; i++) {
          pk_array[i] = keyPair.pk[i];
        }
        serializeJson(response, output);
        Serial.println(output);
        break;
      }
      case GET_ARTIFACT_REQUEST: {
          File artifact = SPIFFS.open("/EcdsaRAccount.json.gz", "r");
          JsonDocument responseStart;
          responseStart[F("type")] = GET_ARTIFACT_RESPONSE_START;
          responseStart[F("data")][F("size")] = artifact.size();
          serializeJson(responseStart, output);
          Serial.println(output);
          ReadBufferingStream bufferedFile{artifact, 64};  
          char buffer[256];
          while(bufferedFile.available()) {
            size_t bytesRead = bufferedFile.readBytes(buffer, sizeof(buffer));
            Serial.write(buffer, bytesRead);
          }
          artifact.close();
          Serial.println("");
          break;
      }
      default:
        // Unknown command
        setError(UNKNOWN);
    }
    

  }
  return { true, 0 };
}