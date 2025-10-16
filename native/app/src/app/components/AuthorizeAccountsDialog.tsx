import { useContext, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Checkbox from "@mui/material/Checkbox";
import TextField from "@mui/material/TextField";
import FormControlLabel from "@mui/material/FormControlLabel";
import { WalletContext } from "../../renderer.tsx";
import type { InternalAccount } from "../../wallet-utils/internal-wallet.ts";
import type { AuthorizationRequest } from "../../wallet-utils/authorization";

type SelectedAccount = {
  address: string;
  alias: string;
  originalAlias: string;
  selected: boolean;
};

interface AuthorizeAccountsDialogProps {
  request: AuthorizationRequest;
  onApprove: (data: any) => void;
  onDeny: () => void;
}

export function AuthorizeAccountsDialog({
  request,
  onApprove,
  onDeny,
}: AuthorizeAccountsDialogProps) {
  const [accounts, setAccounts] = useState<SelectedAccount[]>([]);
  const { walletAPI } = useContext(WalletContext);

  useEffect(() => {
    const loadAccounts = async () => {
      const allAccounts: InternalAccount[] = await walletAPI.getAccounts();
      setAccounts(
        allAccounts.map((acc) => ({
          address: acc.item.toString(),
          alias: acc.alias,
          originalAlias: acc.alias,
          selected: false,
        }))
      );
    };
    loadAccounts();
  }, []);

  const handleToggleAccount = (index: number) => {
    setAccounts((prev) =>
      prev.map((acc, i) =>
        i === index ? { ...acc, selected: !acc.selected } : acc
      )
    );
  };

  const handleAliasChange = (index: number, newAlias: string) => {
    setAccounts((prev) =>
      prev.map((acc, i) => (i === index ? { ...acc, alias: newAlias } : acc))
    );
  };

  const handleApprove = () => {
    const selectedAccounts = accounts
      .filter((acc) => acc.selected)
      .map((acc) => ({
        item: acc.address,
        alias: acc.alias,
      }));

    if (selectedAccounts.length === 0) {
      return; // Don't allow approving with no accounts selected
    }

    onApprove({
      accounts: selectedAccounts,
    });
  };

  const hasSelection = accounts.some((acc) => acc.selected);

  return (
    <Dialog open={true} maxWidth="md" fullWidth>
      <DialogTitle>Account Access Request</DialogTitle>
      <DialogContent>
        <Typography variant="body1" gutterBottom>
          App <strong>{request.appId}</strong> is requesting access to your
          accounts.
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Select which accounts to share. You can also customize the aliases
          that will be visible to the app.
        </Typography>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {accounts.map((account, index) => (
            <Box
              key={account.address}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 2,
                p: 2,
                border: 1,
                borderColor: account.selected ? "primary.main" : "divider",
                borderRadius: 1,
                bgcolor: account.selected
                  ? "action.selected"
                  : "background.paper",
              }}
            >
              <FormControlLabel
                control={
                  <Checkbox
                    checked={account.selected}
                    onChange={() => handleToggleAccount(index)}
                  />
                }
                label=""
                sx={{ m: 0 }}
              />
              <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    display: "block",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {account.address}
                </Typography>
                {account.selected ? (
                  <TextField
                    size="small"
                    value={account.alias}
                    onChange={(e) => handleAliasChange(index, e.target.value)}
                    label="Alias (visible to app)"
                    fullWidth
                    sx={{ mt: 1 }}
                  />
                ) : (
                  <Typography variant="body2" sx={{ mt: 0.5 }}>
                    {account.originalAlias}
                  </Typography>
                )}
              </Box>
            </Box>
          ))}
        </Box>

        {accounts.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            No accounts available. Please create an account first.
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onDeny} color="error">
          Deny
        </Button>
        <Button
          onClick={handleApprove}
          color="primary"
          variant="contained"
          disabled={!hasSelection}
        >
          Approve
        </Button>
      </DialogActions>
    </Dialog>
  );
}
