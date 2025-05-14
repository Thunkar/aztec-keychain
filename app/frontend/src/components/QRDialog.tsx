import QRCode from "react-qr-code";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import Button from "@mui/material/Button";

interface QRDialogProps {
  address: string;
  open: boolean;
  onClose: () => void;
}

export function QRDialog({ address, open, onClose }: QRDialogProps) {
  return (
    <Dialog open={open}>
      <DialogTitle>Add as sender</DialogTitle>
      <DialogContent>
        <div
          style={{
            height: "auto",
            margin: "0 auto",
            maxWidth: "80vw",
            width: "100%",
          }}
        >
          <QRCode
            size={512}
            style={{ height: "auto", maxWidth: "100%", width: "100%" }}
            value={`http://192.168.4.1/sender?address=${address}`}
            viewBox={`0 0 256 256`}
          />
        </div>
      </DialogContent>
      <DialogActions>
        <Button variant="contained" color="error" onClick={() => onClose()}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
