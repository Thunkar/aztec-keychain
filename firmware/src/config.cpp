#include "config.h"

Preferences preferences;

void writeKeyPair(int index, KeyPair *keyPair){ 
  for(int i = 0; i < 32; i++) {
    EEPROM.write(index * 32 + i, keyPair->sk[i] & 0xFF);
  }
  for(int i = 0; i < 64; i++) {
    EEPROM.write(PUBLIC_KEYS_OFFSET + index * 64 + i, keyPair->pk[i] & 0xFF);
  }
  EEPROM.commit();
}

void readKeyPair(int index, KeyPair *keyPair) {
  for(int i = 0; i < 32; i++) {
    keyPair->sk[i] = EEPROM.read(index * 32 + i);
  }
  for(int i = 0; i < 64; i++) {
    keyPair->pk[i] = EEPROM.read(PUBLIC_KEYS_OFFSET + index * 64 + i);
  }
}

void readSecretKey(int index, uint8_t *msk) {
  for(int i = 0; i < 32; i++) {
    msk[i] = EEPROM.read(SECRET_KEYS_OFFSET + index * 32 + i);
  }
}

void readSalt(int index, uint8_t *salt) {
  for(int i = 0; i < 32; i++) {
    salt[i] = EEPROM.read(SALT_OFFSET + index * 32 + i);
  }
}

bool readPassword(char *password) {
  String pass = preferences.getString("password", "");
  if(pass.length() == 0) {
    return false;
  } else {
    pass.toCharArray(password, 32);
    return true;
  }
}

void readContractClassId(uint8_t *contractClassId) {
  File artifact = SPIFFS.open("/EcdsaRAccount.txt", "r");
  ReadBufferingStream bufferedFile{artifact, 32};  
  while(bufferedFile.available()) {
    bufferedFile.readBytes((char*)contractClassId, sizeof(contractClassId));
  }
}

void readSSID(char *SSID) {
  String SSIDStr = preferences.getString("SSID", "Aztec keychain");
  SSIDStr.toCharArray(SSID, 32);
}

void writeSecretKey(int index, uint8_t *msk) {
  for(int i = 0; i < 32; i++) {
    EEPROM.write(SECRET_KEYS_OFFSET + index * 32 + i, msk[i] & 0xFF);
  }
  EEPROM.commit();
}

void writeSalt(int index, uint8_t *salt) {
  for(int i = 0; i < 32; i++) {
    EEPROM.write(SALT_OFFSET + index * 32 + i, salt[i] & 0xFF);
  }
  EEPROM.commit();
}

void writePassword(const char *password) {
  preferences.putString("password", password);
}

void writeSSID(const char *ssid) {
  preferences.putString("SSID", ssid);
}

void setupStorage() {
  EEPROM.begin(MAX_ACCOUNTS * (32+64+32+32));
  preferences.begin("keychain", false);
}

void closeStorage() {
  preferences.end();
  EEPROM.end();
}