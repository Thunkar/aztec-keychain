#include "curve.h"

uECC_Curve curve;

int RNG(uint8_t *dest, unsigned size) {
  // Use the least-significant bits from the ADC for an unconnected pin (or connected to a source of 
  // random noise). This can take a long time to generate random data if the result of analogRead(0) 
  // doesn't change very frequently.
  while (size) {
    uint8_t val = 0;
    for (unsigned i = 0; i < 8; ++i) {
      int init = analogRead(RNG_SOURCE);
      int count = 0;
      while (analogRead(RNG_SOURCE) == init) {
        ++count;
      }
      
      if (count == 0) {
         val = (val << 1) | (init & 0x01);
      } else {
         val = (val << 1) | (count & 0x01);
      }
    }
    *dest = val;
    ++dest;
    --size;
  }
  // NOTE: it would be a good idea to hash the resulting random data using SHA-256 or similar.
  return 1;
}

void setupCurve() {
  uECC_set_rng(&RNG);
  curve = uECC_secp256r1();
}

void generateKeyPair(KeyPair *keyPair) {
  uECC_make_key(keyPair->pk, keyPair->sk, curve);
}

void sign(KeyPair *keyPair, uint8_t *message, uint8_t *signature) {
  uECC_sign(keyPair->sk, message, 64, signature, curve);
  int result = uECC_verify(keyPair->pk, message, 64, signature, curve);
  if(!result) {
    setError(FAILED_VERIFICATION);
  }
}