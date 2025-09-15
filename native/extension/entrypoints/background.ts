export default defineBackground(() => {
  let webSocket: WebSocket | null = null;

  browser.runtime.onMessage.addListener((message: any) => {
    if (webSocket) {
      webSocket.send(message.data);
    }
  });

  function connect() {
    return new Promise((resolve, reject) => {
      webSocket = new WebSocket("ws://localhost:8765");
      webSocket.onopen = (event) => {
        console.log("websocket open");
        keepAlive();
        resolve(true);
      };

      webSocket.onmessage = (event) => {
        console.log(`websocket received message: ${event.data}`);
        browser.runtime.sendMessage({ type: "ws-message", data: event.data });
      };

      webSocket.onclose = (event) => {
        console.log("websocket connection closed");
        webSocket = null;
        connect();
      };
    });
  }

  function disconnect() {
    if (webSocket == null) {
      return;
    }
    webSocket.close();
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
