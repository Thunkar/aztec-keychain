export default defineContentScript({
  matches: ["*://*/*"],
  main() {
    window.addEventListener("message", (event) => {
      // We only accept messages from ourselves
      if (event.source !== window || event.data.result || event.data.error) {
        return;
      }
      const { data: content } = event;
      browser.runtime.sendMessage({ origin: "injected", content });
    });
    browser.runtime.onMessage.addListener((event: any) => {
      console.log("content received message", event);
      const { content, origin } = event;
      if (origin !== "background") {
        return;
      }
      window.postMessage(content);
    });
  },
});
