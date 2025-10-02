import { useState } from "react";
import "./App.css";

function App() {
  const [longLivedMessageList, setLongLivedMessageList] = useState<string[]>(
    []
  );

  browser.runtime.onMessage.addListener((message) => {
    const newList = [JSON.stringify(message), ...longLivedMessageList];
    if (newList.length > 10) {
      newList.splice(0, newList.length - 10);
    }
    setLongLivedMessageList(newList);
  });

  return (
    <>
      <h1>Keychain</h1>
      {longLivedMessageList.map((message, index) => (
        <p key={index}>{message}</p>
      ))}
    </>
  );
}

export default App;
