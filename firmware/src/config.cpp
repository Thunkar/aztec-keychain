#include "config.h"

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

void setupEEPROM() {
  EEPROM.begin(MAX_ACCOUNTS * (32+64+32+32));
}