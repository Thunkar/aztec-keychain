#pragma once

#include <Arduino.h>
#include <EEPROM.h>
#include "curve.h"
#include "board.h"

#define MAX_ACCOUNTS 5

#define PUBLIC_KEYS_OFFSET (MAX_ACCOUNTS * 32)

struct Config {
    u_int8_t private_keys[MAX_ACCOUNTS][32];
    u_int8_t public_keys[MAX_ACCOUNTS][64];
};

extern Config config;

void readKeyPair(int index, KeyPair *keyPair);
void writeKeyPair(int index, KeyPair *keyPair);
void setupEEPROM();