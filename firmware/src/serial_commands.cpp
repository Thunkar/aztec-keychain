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

    Command type = doc[F("type")]; 

    switch (type) {
      case SIGNATURE_REQUEST: {
        JsonDocument response;
        Command type = doc[F("type")]; 
        char output[1024];
        int keyIndex = doc[F("data")][F("index")];
        KeyPair keyPair;
        readKeyPair(keyIndex, &keyPair);
        JsonArray pk_array = doc[F("data")][F("pk")];
        bool empty = true;
        for(int i = 0; i < 64; i++) {
          empty &= (pk_array[i] == 255);
          if(pk_array[i] != keyPair.pk[i]) {
            setError(INVALID_PK);
            response[F("type")] = ERROR;
            response[F("data")][F("error")] = "Invalid public key";
            serializeJson(response, output);
            Serial.println(output);
            return { false, 0 };
          }
        }
        if (empty) {
          setError(INVALID_PK);
          response[F("type")] = ERROR;
          response[F("data")][F("error")] = "Account not initialized";
          serializeJson(response, output);
          Serial.println(output);
          return { false, 0 };
        }
        JsonArray data_array = doc[F("data")][F("msg")];
        for (int i = 0; i < 64; i++) {
          state.currentSignatureRequest.msg[i] = data_array[i];
        }

        state.currentSignatureRequest.index = keyIndex;
        state.status = SIGNING;
        break;
      } 
      case GET_ACCOUNT_REQUEST: {
        int index = doc[F("data")][F("index")];
        if(index == -1) {
          state.status = SELECTING_ACCOUNT;
        } else {
          sendAccount(index);
        }
        break;
      }
      case GET_ARTIFACT_REQUEST: {
        char output[1024];
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
      case GET_SENDER_REQUEST: {
        JsonDocument response;
        char output[1024];
        if(state.status != WAITING_FOR_SENDER_REQUEST) {
          setError(INVALID_SENDER_REQUEST);
          response[F("type")] = ERROR;
          response[F("data")][F("error")] = "Unexpected sender request";
          serializeJson(response, output);
          Serial.println(output);
          return { false, 0 };
        }
        response[F("data")][F("sender")] = String(state.currentSender);
        response[F("type")] = GET_SENDER_RESPONSE;
        serializeJson(response, output);
        Serial.println(output);
        state.status = IDLE;
        break;
      } 
      default:
        // Unknown command
        setError(UNKNOWN);
    }
    

  }
  return { true, 0 };
}

void sendAccount(int index) {
    JsonDocument response;
    if(index != -1) {
      response[F("type")] = GET_ACCOUNT_RESPONSE;
      response[F("data")][F("index")] = index;
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
    } else {
      response[F("type")] = GET_ACCOUNT_REJECTED;
    }
    char output[1024];
    serializeJson(response, output);
    Serial.println(output);
}

void sendSignatureResponse(bool approve) {
      JsonDocument response;
      if(approve) {
        KeyPair keyPair;
        readKeyPair(state.currentSignatureRequest.index, &keyPair);
        uint8_t signature[64];
        sign(&keyPair, state.currentSignatureRequest.msg, signature);
        response[F("type")] = SIGNATURE_ACCEPTED_RESPONSE;
        JsonArray jsonSignature = response[F("data")][F("signature")].to<JsonArray>();
        for(int i = 0; i < 64; i++) {
          jsonSignature[i] = signature[i];
        }
      } else {
        response[F("type")] = SIGNATURE_REJECTED_RESPONSE;
      }
      char output[1024];
      serializeJson(response, output);
      Serial.println(output);
}