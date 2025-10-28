import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import { ExecutionTraceDisplay } from "../shared/ExecutionTraceDisplay";
import type { DecodedExecutionTrace } from "../../../wallet/decoding/tx-callstack-decoder";

interface ExecutionTraceDialogProps {
  open: boolean;
  onClose: () => void;
  trace: DecodedExecutionTrace | null;
}

export function ExecutionTraceDialog({
  open,
  onClose,
  trace,
}: ExecutionTraceDialogProps) {
  if (!trace) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          maxHeight: "80vh",
        },
      }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        Execution Trace
        <IconButton
          aria-label="close"
          onClick={onClose}
          sx={{
            color: (theme) => theme.palette.grey[500],
          }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <ExecutionTraceDisplay
          trace={trace}
          accordionBgColor="background.default"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
