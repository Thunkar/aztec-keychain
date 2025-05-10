import {
  CurrentSignatureRequest,
  Account,
  Settings,
} from "../components/DataContextContainer";

function buildUrl(path: string): URL {
  return new URL(
    import.meta.env.VITE_HTTP_URL
      ? `${import.meta.env.VITE_HTTP_URL}/${path}`
      : `http://${window.location.hostname}/${path}`
  );
}

export async function loadAccount(index: number): Promise<Account> {
  const url = buildUrl("accounts");
  url.searchParams.append("index", index.toString());

  const response = await fetch(url);
  const body = await response.json();
  body.initialized = !body.pk.every((byte: number) => byte === 255);
  return body;
}

export async function requestNewAccount(index: number): Promise<void> {
  const url = buildUrl("accounts");

  await fetch(url, {
    method: "POST",
    body: JSON.stringify({ index }),
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export async function loadCurrentSignatureRequest(): Promise<CurrentSignatureRequest> {
  const url = buildUrl("signature");

  const response = await fetch(url);
  const body = await response.json();
  return body;
}

export async function finishSignatureRequest(approve: boolean) {
  const url = buildUrl("signature");

  await fetch(url, {
    method: "POST",
    body: JSON.stringify({ approve }),
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export async function loadSettings(): Promise<Settings> {
  const url = buildUrl("settings");

  const response = await fetch(url);
  const body = await response.json();
  return body;
}

export async function writeSettings(settings: Settings) {
  const url = buildUrl("settings");

  await fetch(url, {
    method: "POST",
    body: JSON.stringify(settings),
    headers: {
      "Content-Type": "application/json",
    },
  });
}
