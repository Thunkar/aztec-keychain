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
    char output[1024];

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
      case GET_ACCOUNT_REQUESTED: {
        int index = doc[F("data")][F("index")];
        response[F("type")] = GET_ACCOUNT_RESPONSE;
        JsonArray pk_array = response[F("data")][F("pk")].to<JsonArray>();
        JsonArray msk_array = response[F("data")][F("msk")].to<JsonArray>();
        JsonArray salt_array = response[F("data")][F("salt")].to<JsonArray>();

        KeyPair keyPair;
        readKeyPair(index, &keyPair);
        for (int i = 0; i < 64; i++) {
          pk_array[i] = keyPair.pk[i];
        }
        uint8_t msk[32];
        readSecretKey(index, msk);
        for(int i = 0; i < 32; i++) {
          msk_array[i] = msk[i];
        }
        uint8_t salt[32];
        readSalt(index, salt);
        for(int i = 0; i < 32; i++) {
          salt_array[i] = salt[i];
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
          while(bufferedFile.available()) {
            size_t bytesRead = bufferedFile.readBytes(output, sizeof(output));
            Serial.write(output, bytesRead);
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