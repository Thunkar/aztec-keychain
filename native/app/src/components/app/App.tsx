import { AztecAddress, type Aliased } from "@aztec/aztec.js";
import { useEffect, useState } from "react";

export function App() {
  const [accounts, setAccounts] = useState<Aliased<AztecAddress>>([]);
  useEffect(() => {
    const loadAccounts = async () => {
      const accounts = await window.walletAPI.getAccounts();
      console.log("it works??");
      setAccounts(accounts);
    };
    loadAccounts();
  }, []);
  return <h1>App</h1>;
}
