import {
  CurrentSignatureRequest,
  Key,
} from "../components/DataContextContainer";

function buildUrl(path: string): URL {
  return new URL(
    import.meta.env.VITE_HTTP_URL
      ? `${import.meta.env.VITE_HTTP_URL}/${path}`
      : `http://${window.location.hostname}/${path}`
  );
}

export async function loadKey(index: number): Promise<Key> {
  const url = buildUrl("keys");
  url.searchParams.append("index", index.toString());

  const response = await fetch(url);
  const body = await response.json();
  return body;
}

export async function requestNewKey(index: number): Promise<void> {
  const url = buildUrl("keys");

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
