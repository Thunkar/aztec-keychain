import { DataContext } from "../utils/context";
import { useEffect, useState, type ReactNode } from "react";
import useWebSocket, { ReadyState } from "react-use-websocket";
import {
  loadCurrentSignatureRequest,
  loadAccountData,
  requestNewAccount,
  loadSettings,
  writeSettings,
  finishSignatureRequest,
  confirmAccountSelection,
} from "../utils/requests";
import { sha1 } from "hash.js";
import { parse } from "buffer-json";
import { inflate } from "pako";
import { FunctionAbi } from "../utils/address/abi/types";
import { computeAddressForAccount } from "../utils/address";

const MAX_ACCOUNTS = 5;

export type Account = {
  address?: string;
  salt: number[];
  msk: number[];
  pk: number[];
  contractClassId: number[];
  index: number;
  initialized: boolean;
};

export type KeyChainStatusType =
  | "IDLE"
  | "GENERATING_KEY"
  | "SIGNING"
  | "SELECTING_ACCOUNT";
export const KeyChainStatus: KeyChainStatusType[] = [
  "IDLE",
  "GENERATING_KEY",
  "SIGNING",
  "SELECTING_ACCOUNT",
] as const;

export type CurrentSignatureRequest = {
  index: number;
  msg: number[];
};

export type Settings = {
  SSID: string;
  password: string;
};

export const DataContextContainer = function ({
  children,
}: {
  children: ReactNode;
}) {
  const [websocketStatus, setWebsocketStatus] =
    useState<string>("Uninstantiated");

  const [connectWebSocket, setConnectWebSocket] = useState<boolean>(false);
  const [keyChainStatus, setKeyChainStatus] =
    useState<KeyChainStatusType>("IDLE");
  const [accounts, setAccounts] = useState<Account[]>([]);

  const [currentSignatureRequest, setCurrentSignatureRequest] =
    useState<CurrentSignatureRequest | null>(null);

  const [lastKeyChainStatus, setLastKeyChainStatus] = useState(0);

  const [initialized, setInitialized] = useState(false);

  const [SSID, setSSID] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(true);

  const { lastMessage, readyState } = useWebSocket(
    import.meta.env.VITE_WS_URL ?? `ws://${window.location.hostname}`,
    {
      share: true,
      retryOnError: true,
      reconnectAttempts: 10e5,
      reconnectInterval: 1000,
      shouldReconnect: () => true,
    },
    connectWebSocket
  );

  useEffect(() => {
    const connectionStatus = {
      [ReadyState.CONNECTING]: "Connecting",
      [ReadyState.OPEN]: "Open",
      [ReadyState.CLOSING]: "Closing",
      [ReadyState.CLOSED]: "Closed",
      [ReadyState.UNINSTANTIATED]: "Uninstantiated",
    }[readyState];

    setWebsocketStatus(connectionStatus);
  }, [readyState]);

  useEffect(() => {
    const [status] = lastMessage?.data.split(",") ?? [];
    if (status !== undefined && parseInt(status) !== lastKeyChainStatus) {
      setLastKeyChainStatus(parseInt(status));
      switch (parseInt(status)) {
        case 0: {
          setKeyChainStatus("IDLE");
          break;
        }
        case 1: {
          setKeyChainStatus("GENERATING_KEY");
          break;
        }
        case 2: {
          setKeyChainStatus("SELECTING_ACCOUNT");
          break;
        }
        case 3: {
          if (
            accounts.some((account) => account.pk.some((byte) => byte !== 255))
          ) {
            setKeyChainStatus("SIGNING");
          } else {
            finishSignatureRequest(false);
          }
          break;
        }
      }
    }
  }, [lastMessage]);

  useEffect(() => {
    const refreshCurrentSignatureRequest = async () => {
      const currentSignatureRequest = await loadCurrentSignatureRequest();
      setCurrentSignatureRequest(currentSignatureRequest);
    };
    if (keyChainStatus === "SIGNING") {
      refreshCurrentSignatureRequest();
    }
  }, [keyChainStatus]);

  const loadAccount = async (index: number) => {
    const account = await loadAccountData(index);
    account.initialized = !account.pk.every((byte: number) => byte === 255);
    if (account.initialized) {
      const accountIdentifier = sha1()
        .update(
          new Uint8Array(
            [account.index]
              .concat(account.pk)
              .concat(account.salt)
              .concat(account.msk)
              .concat(account.contractClassId)
          )
        )
        .digest("hex");
      let address = localStorage.getItem(accountIdentifier);
      if (!address) {
        const accountContractRes = await fetch(
          import.meta.env.VITE_INIT_FN_URL
        );
        const accountContractCompressed =
          await accountContractRes.arrayBuffer();
        const accountContract = parse(
          await inflate(accountContractCompressed, { to: "string" })
        );
        const initFn = accountContract.functions
          .concat(accountContract.nonDispatchPublicFunctions || [])
          .find((fn: FunctionAbi) => fn.name === "constructor");
        address = await computeAddressForAccount(
          account.contractClassId,
          account.salt,
          account.msk,
          account.pk,
          initFn
        );
        localStorage.setItem(accountIdentifier, address);
      }
      account.address = address;
    }
    return account;
  };

  const loadAccounts = async () => {
    const accounts = [];
    for (let i = 0; i < MAX_ACCOUNTS; i++) {
      const account = await loadAccount(i);
      accounts.push(account);
    }
    setAccounts(accounts);
    setConnectWebSocket(true);
  };

  const reloadSettings = async () => {
    const { SSID, password } = await loadSettings();
    setSSID(SSID);
    setPassword(password);
    const isInitialized = password.length >= 8;
    setInitialized(isInitialized);
  };

  const storeSettings = async (SSID: string, password: string) => {
    await writeSettings({ SSID, password });
    await reloadSettings();
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await loadAccounts();
      await reloadSettings();
      setLoading(false);
    };
    load();
  }, []);

  const generateAccount = async (index: number) => {
    setLoading(true);
    await requestNewAccount(index);
    const account = await loadAccount(index);
    accounts.splice(index, 1, account);
    setAccounts(accounts);
    setLoading(false);
  };

  const selectAccount = async (index: number) => {
    await confirmAccountSelection(index);
  };

  const initialData = {
    websocketStatus,
    accounts,
    keyChainStatus,
    currentSignatureRequest,
    SSID,
    password,
    initialized,
    loading,
    storeSettings,
    generateAccount,
    selectAccount,
  };

  return (
    <DataContext.Provider value={initialData}>{children}</DataContext.Provider>
  );
};
