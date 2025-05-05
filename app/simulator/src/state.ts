export const MAX_KEYS = 5;
export const PK_LENGTH = 64;
export const SK_LENGTH = 32;
export const MSK_LENGTH = 32;
export const SALT_LENGTH = 32;

export const MESSAGE_TO_SIGN = "amessagewith32charactersforsure1"
  .split("")
  .map((char) => char.charCodeAt(0));

export type AccountIndex = { index: number };
export type Account = {
  salt: number[];
  msk: number[];
  sk: number[];
  pk: number[];
  index: number;
};
export type CurrentSignatureRequest = { index: number; msg: number[] };

export type State = {
  accounts: Account[];
  status: 0 | 1 | 2; // 0 -> IDLE, 1 -> GENERATING_ACCOUNT, 2 -> SIGNING
  currentSignatureRequest: CurrentSignatureRequest;
};

export const state: State = {
  accounts: Array(MAX_KEYS)
    .fill(0)
    .map((_, i) => ({
      salt: Array(SALT_LENGTH).fill(255),
      msk: Array(MSK_LENGTH).fill(255),
      pk: Array(PK_LENGTH).fill(255),
      sk: Array(SK_LENGTH).fill(255),
      index: i,
    })),
  status: 2,
  currentSignatureRequest: { index: 0, msg: MESSAGE_TO_SIGN },
};

export type Settings = {
  SSID: string;
  password: string;
};

export const settings: Settings = {
  SSID: "Aztec keychain",
  password: "",
};
