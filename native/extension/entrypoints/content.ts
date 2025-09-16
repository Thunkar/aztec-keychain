export default defineContentScript({
  matches: ["*://*/*"],
  main() {
    window.addEventListener("message", (event) => {
      // We only accept messages from ourselves
      if (event.source !== window || event.data.result || event.data.error) {
        return;
      }
      const { data } = event;
      browser.runtime.sendMessage({ origin: "content", data });
    });
    browser.runtime.onMessage.addListener((event: any) => {
      console.log("content received message", event);
      const { data, origin } = event;
      if (origin !== "background") {
        return;
      }
      window.postMessage(data);
    });
  },
});
