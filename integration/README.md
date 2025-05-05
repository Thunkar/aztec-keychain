# Aztec keychain accounts

Use this package with your keychain it to acquire a `Wallet` object that corresponds to an account, and use that together with `@aztec/aztec.js` to interact with the network.

## Installing

```
npm install @thunkar/aztec-keychain-accounts
```

## Account types

- **ECDSA**: Uses an ECDSA private key for authentication, and a Grumpkin private key for encryption.