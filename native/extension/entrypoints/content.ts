export default defineContentScript({
  matches: ["*://*/*"],
  main() {
    const port = browser.runtime.connect();
    window.addEventListener(
      "message",
      (event) => {
        // We only accept messages from ourselves
        if (event.source !== window) {
          return;
        }
        browser.runtime.sendMessage(event.data);
      },
      false
    );
  },
});
