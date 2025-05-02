import { useContext } from "react";
import { DataContext } from "../utils/context";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import Typography from "@mui/material/Typography";
import { keyToShortStr } from "../utils/format";
import Button from "@mui/material/Button";
import { finishSignatureRequest } from "../utils/requests";

export function SignDialog() {
  const { currentSignatureRequest, keyChainStatus, accounts } =
    useContext(DataContext);
  return (
    <Dialog
      open={keyChainStatus === "SIGNING" && currentSignatureRequest !== null}
    >
      <DialogTitle>Sign</DialogTitle>
      <DialogContent
        css={{
          display: "flex",
          flexDirection: "column",
          overflowY: "hidden",
          wordBreak: "break-all",
        }}
      >
        <Typography variant="subtitle1">Message</Typography>
        <Typography variant="subtitle2">
          {currentSignatureRequest!.msg}
        </Typography>
        <Typography variant="subtitle1">Key:</Typography>
        <Typography variant="subtitle2">
          {keyToShortStr(accounts[currentSignatureRequest!.index].pk)}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button
          variant="contained"
          color="primary"
          onClick={() => finishSignatureRequest(true)}
        >
          Sign
        </Button>
        <Button
          variant="contained"
          color="error"
          onClick={() => finishSignatureRequest(false)}
        >
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  );
}
