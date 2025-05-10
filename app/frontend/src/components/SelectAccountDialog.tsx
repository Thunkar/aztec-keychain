import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import Button from "@mui/material/Button";
import { useContext } from "react";
import { DataContext } from "../utils/context";
import { AccountBox } from "./AccountBox";

export function SelectAccountDialog() {
  const { accounts, selectAccount } = useContext(DataContext);

  return (
    <Dialog fullWidth open={true}>
      <DialogTitle>Connect account</DialogTitle>
      <DialogContent
        css={{
          display: "flex",
          flexDirection: "column",
          wordBreak: "break-word",
          padding: "0.5rem",
          margin: "0.5rem",
          overflowY: "auto",
          overflowX: "hidden",
        }}
      >
        {accounts.map((account) => (
          <AccountBox
            key={account.index}
            account={account}
            onClick={(index) => {
              selectAccount(index);
            }}
            disabled={account.initialized}
            buttonText={"Connect"}
          />
        ))}
      </DialogContent>
      <DialogActions>
        <Button
          variant="contained"
          color="error"
          onClick={() => selectAccount(-1)}
        >
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  );
}
