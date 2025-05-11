import { DataContext } from "../utils/context";
import { useEffect, useState, type ReactNode } from "react";
import useWebSocket, { ReadyState } from "react-use-websocket";
import {
  loadCurrentSignatureRequest,
  loadAccount,
  requestNewAccount,
  loadSettings,
  writeSettings,
  finishSignatureRequest,
  confirmAccountSelection,
} from "../utils/requests";

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
      await loadAccounts();
      await reloadSettings();
    };
    load();
  }, []);

  const generateAccount = async (index: number) => {
    await requestNewAccount(index);
    const account = await loadAccount(index);
    accounts.splice(index, 1, account);
    setAccounts(accounts);
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
    storeSettings,
    generateAccount,
    selectAccount,
  };

  return (
    <DataContext.Provider value={initialData}>{children}</DataContext.Provider>
  );
};
