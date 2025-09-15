import { useState } from "react";
import "./App.css";

function App() {
  const [longLivedMessageList, setLongLivedMessageList] = useState<string[]>(
    []
  );

  browser.runtime.onMessage.addListener((message) => {
    setLongLivedMessageList(
      longLivedMessageList.concat([JSON.stringify(message)])
    );
  });

  return (
    <>
      <h1>Keychain</h1>
      <button
        onClick={async () => {
          browser.runtime.sendMessage({ type: "wohoo" });
        }}
      >
        Say hello
      </button>
      {longLivedMessageList.map((message, index) => (
        <p key={index}>{message}</p>
      ))}
    </>
  );
}

export default App;
