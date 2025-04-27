import { DataContext } from "../utils/context";
import { useEffect, useState, type ReactNode } from "react";
import useWebSocket, { ReadyState } from "react-use-websocket";
import {
  loadCurrentSignatureRequest,
  loadKey,
  requestNewKey,
} from "../utils/requests";

const MAX_KEYS = 5;

export type Key = {
  pk: number[];
  index: number;
};

export type KeyChainStatusType = "IDLE" | "GENERATING_KEY" | "SIGNING";
export const KeyChainStatus: KeyChainStatusType[] = [
  "IDLE",
  "GENERATING_KEY",
  "SIGNING",
] as const;

export type CurrentSignatureRequest = {
  index: number;
  msg: number[];
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
  const [keys, setKeys] = useState<Key[]>([]);

  const [currentSignatureRequest, setCurrentSignatureRequest] =
    useState<CurrentSignatureRequest | null>(null);

  const [lastKeyChainStatus, setLastKeyChainStatus] = useState(0);

  const { lastMessage, readyState } = useWebSocket(
    import.meta.env.VITE_WS_URL ?? `ws://${window.location.hostname}`,
    {
      reconnectAttempts: 10,
      reconnectInterval: 3000,
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
          setKeyChainStatus("SIGNING");
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

  const loadKeys = async () => {
    let keys = [];
    for (let i = 0; i < MAX_KEYS; i++) {
      const key = await loadKey(i);
      keys.push(key);
    }
    setKeys(keys);
    setConnectWebSocket(true);
  };

  useEffect(() => {
    loadKeys();
  }, []);

  const generateKeyPair = async (index: number) => {
    await requestNewKey(index);
    const key = await loadKey(index);
    keys.splice(index, 1, key);
    setKeys(keys);
  };

  const initialData = {
    websocketStatus,
    keys,
    keyChainStatus,
    currentSignatureRequest,
    generateKeyPair,
  };

  return (
    <DataContext.Provider value={initialData}>{children}</DataContext.Provider>
  );
};
