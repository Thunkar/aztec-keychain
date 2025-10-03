export default defineBackground(() => {
  let webSocket: WebSocket | null = null;

  browser.runtime.onMessage.addListener((event: any) => {
    const { content, origin } = event;
    if (webSocket && origin === "injected") {
      webSocket.send(content);
    }
  });

  function connect() {
    return new Promise((resolve, reject) => {
      webSocket = new WebSocket("ws://localhost:8765");
      webSocket.onopen = () => {
        console.log("websocket open");
        keepAlive();
        resolve(true);
      };

      webSocket.onmessage = async (event) => {
        console.log("websocket message", event);
        const [tab] = await browser.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (!tab?.id) {
          console.error("No active tab found");
          return;
        }
        browser.tabs.sendMessage(tab.id, {
          origin: "background",
          content: JSON.parse(event.data),
        });
      };

      webSocket.onclose = (event) => {
        console.log("websocket connection closed");
        webSocket = null;
        connect();
      };
    });
  }

  function keepAlive() {
    const keepAliveIntervalId = setInterval(
      () => {
        if (webSocket) {
          webSocket.send("keepalive");
        } else {
          clearInterval(keepAliveIntervalId);
        }
      },
      // Set the interval to 20 seconds to prevent the service worker from becoming inactive.
      20 * 1000
    );
  }
  connect();
});
