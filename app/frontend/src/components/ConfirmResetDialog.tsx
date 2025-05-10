import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";

interface ConfirmResetDialogProps {
  open: boolean;
  onClose: (result: boolean) => void;
}

export function ConfirmResetDialog({ open, onClose }: ConfirmResetDialogProps) {
  return (
    <Dialog open={open}>
      <DialogTitle>Confirm settings</DialogTitle>
      <DialogContent
        css={{
          display: "flex",
          flexDirection: "column",
          overflowY: "hidden",
          wordBreak: "break-word",
        }}
      >
        <Typography variant="subtitle1">
          The device will reset in order to apply the new settings. You will
          have to connect to it again!
        </Typography>
        <Typography
          css={{ marginTop: "1rem" }}
          variant="subtitle2"
          color="error"
        >
          If the WiFi password is lost, the only way of recovering is to
          completely erase the memory.
          <br />
          <strong>This will destroy all the keys stored in it.</strong>
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button
          variant="contained"
          color="warning"
          onClick={() => onClose(true)}
        >
          Update and reset
        </Button>
        <Button
          variant="contained"
          color="error"
          onClick={() => onClose(false)}
        >
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  );
}
