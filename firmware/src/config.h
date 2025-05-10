#pragma once

#include <Arduino.h>
#include <EEPROM.h>
#include <Preferences.h>
#include <SPIFFS.h>
#include <StreamUtils.h>
#include "curve.h"
#include "board.h"

#define MAX_ACCOUNTS 5

#define PUBLIC_KEYS_OFFSET (MAX_ACCOUNTS * 32)
#define SECRET_KEYS_OFFSET ((PUBLIC_KEYS_OFFSET) + MAX_ACCOUNTS * 64)
#define SALT_OFFSET ((SECRET_KEYS_OFFSET) + MAX_ACCOUNTS * 32)

struct Config {
    u_int8_t private_keys[MAX_ACCOUNTS][32];
    u_int8_t public_keys[MAX_ACCOUNTS][64];
};

extern Config config;

void readKeyPair(int index, KeyPair *keyPair);
void readSecretKey(int index, uint8_t *msk);
void readSalt(int index, uint8_t *salt);
bool readPassword(char *password);
void readSSID(char *ssid);
void readContractClassId(uint8_t *contractClassId);

void writeKeyPair(int index, KeyPair *keyPair);
void writeSecretKey(int index, uint8_t *msk);
void writeSalt(int index, uint8_t *salt);
void writePassword(const char *password);
void writeSSID(const char *ssid);

void setupStorage();
void closeStorage();