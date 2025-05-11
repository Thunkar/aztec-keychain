import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import TabContext from "@mui/lab/TabContext";
import TabList from "@mui/lab/TabList";
import TabPanel from "@mui/lab/TabPanel";
import Tab from "@mui/material/Tab";
import { smallSlant, useAsciiText } from "react-ascii-text";
import { ReactNode, useContext, useEffect, useRef, useState } from "react";
import { DataContext } from "./utils/context";
import { css } from "@emotion/react";
import { colors } from "./styles";
import { SignDialog } from "./components/SignDialog";
import { RegenerateDialog } from "./components/RegenerateDialog";
import { Settings } from "./components/Settings";
import { AccountBox } from "./components/AccountBox";
import { SelectAccountDialog } from "./components/SelectAccountDialog";
import { CircularProgress } from "@mui/material";

const statusContainer = css({
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
});

function CustomTabPanel({
  children,
  value,
  currentTab,
}: {
  children: ReactNode;
  value: string;
  currentTab: string;
}) {
  return (
    <TabPanel
      sx={{
        flexGrow: currentTab === value ? 1 : 0,
        padding: "0.1rem",
        display: "flex",
        flexDirection: "column",
      }}
      value={value}
    >
      {children}
    </TabPanel>
  );
}

function App() {
  const asciiTextRef = useAsciiText({
    animationCharacters: "▒░█",
    animationCharacterSpacing: 1,
    animationDelay: 0,
    animationDirection: "down",
    animationInterval: 0,
    animationLoop: false,
    animationSpeed: 40,
    fadeInOnly: true,
    font: smallSlant,
    text: "Keychain",
  });

  const [regenerateDialogOpen, setRegenerateDialogOpen] = useState(false);
  const [accountIndexToRegenerate, setAccountIndexToRegenerate] = useState(0);

  const [tab, setTab] = useState("0");

  // Using a ref callback to bridge the type mismatch.
  const refCallback = (element: HTMLPreElement | null) => {
    if (asciiTextRef) {
      asciiTextRef.current = element ?? undefined;
    }
  };

  const {
    generateAccount,
    keyChainStatus,
    websocketStatus,
    accounts,
    currentSignatureRequest,
    initialized,
    loading,
  } = useContext(DataContext);

  useEffect(() => {
    console.log(`Loading: ${loading}`);
    console.log(`Initialized: ${initialized}`);
    if (!loading && !initialized) {
      setTab("1");
    }
  }, [initialized, loading]);

  return (
    <>
      <pre
        css={{
          color: colors.primary,
          padding: 0,
          marginTop: 0,
          marginBottom: "0.5rem",
        }}
        ref={refCallback}
      ></pre>
      <div css={statusContainer}>
        <Typography variant="subtitle1">Connection</Typography>
        <div
          css={[
            {
              marginLeft: "0.5rem",
              borderRadius: "50%",
              height: "1rem",
              width: "1rem",
            },
            websocketStatus === "Open"
              ? { backgroundColor: "green" }
              : { backgroundColor: "red" },
          ]}
        ></div>
      </div>
      <div css={statusContainer}>
        <Typography variant="subtitle1">Status&nbsp;</Typography>
        <Typography css={{ marginTop: "0.15rem" }} variant="subtitle2">
          {keyChainStatus}
        </Typography>
      </div>
      <Box
        sx={{
          width: "100%",
          flexGrow: 1,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <TabContext value={tab}>
          <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
            <TabList
              variant="fullWidth"
              onChange={(_event, tab) => setTab(tab)}
            >
              <Tab label="Accounts" value="0" disabled={!initialized} />
              <Tab label="Configuration" value="1" />
            </TabList>
          </Box>
          <CustomTabPanel value="0" currentTab={tab}>
            {accounts.map((account) => (
              <AccountBox
                key={account.index}
                account={account}
                onClick={(index) => {
                  setAccountIndexToRegenerate(index);
                  if (!account.initialized) {
                    generateAccount(index);
                  } else {
                    setRegenerateDialogOpen(true);
                  }
                }}
                disabled={loading || keyChainStatus !== "IDLE" || !initialized}
                buttonText={!account.initialized ? "Initialize" : "Regenerate"}
              />
            ))}
          </CustomTabPanel>
          <CustomTabPanel value="1" currentTab={tab}>
            <Settings />
          </CustomTabPanel>
        </TabContext>
      </Box>
      {initialized &&
        keyChainStatus === "SIGNING" &&
        currentSignatureRequest !== null && <SignDialog />}
      {regenerateDialogOpen && (
        <RegenerateDialog
          open={regenerateDialogOpen}
          onClose={(result) => {
            setRegenerateDialogOpen(false);
            if (result) {
              generateAccount(accountIndexToRegenerate);
            }
          }}
        />
      )}
      {keyChainStatus === "SELECTING_ACCOUNT" && <SelectAccountDialog />}
    </>
  );
}

export default App;
