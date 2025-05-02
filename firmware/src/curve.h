#pragma once

#include <Arduino.h>
#include <uECC.h>
#include "board.h"
#include "stats.h"

struct KeyPair {
    uint8_t sk[32];
    uint8_t pk[64];
};

int RNG(uint8_t *dest, unsigned size);
void setupCurve(); 
void generateKeyPair(KeyPair *keyPair);
void sign(KeyPair *keyPair, uint8_t *message, uint8_t *signature);
