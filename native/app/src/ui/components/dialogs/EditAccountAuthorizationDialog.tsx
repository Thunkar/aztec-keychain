import { useContext, useEffect, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Checkbox,
  FormControlLabel,
  TextField,
  List,
  ListItem,
  Alert,
} from "@mui/material";
import { WalletContext } from "../../renderer";

interface EditAccountAuthorizationDialogProps {
  open: boolean;
  appId: string;
  currentAccounts: Array<{ alias: string; item: string }>;
  onClose: () => void;
  onSave: () => Promise<void>;
}

interface AccountWithSelection {
  address: string;
  originalAlias: string;
  displayAlias: string;
  selected: boolean;
}

export function EditAccountAuthorizationDialog({
  open,
  appId,
  currentAccounts,
  onClose,
  onSave,
}: EditAccountAuthorizationDialogProps) {
  const { walletAPI } = useContext(WalletContext);
  const [allAccounts, setAllAccounts] = useState<AccountWithSelection[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      loadAccounts();
    }
  }, [open, currentAccounts]);

  const loadAccounts = async () => {
    try {
      setError(null);
      const accounts = await walletAPI.getAccounts();
      const currentAddresses = new Set(currentAccounts.map((a) => a.item));

      const accountsWithSelection = accounts.map((acc) => {
        const isSelected = currentAddresses.has(acc.item.toString());
        const currentAccount = currentAccounts.find(
          (ca) => ca.item === acc.item.toString()
        );

        return {
          address: acc.item.toString(),
          originalAlias: acc.alias,
          displayAlias: isSelected
            ? currentAccount?.alias || acc.alias
            : acc.alias,
          selected: isSelected,
        };
      });

      setAllAccounts(accountsWithSelection);
    } catch (err) {
      console.error("Failed to load accounts:", err);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleToggleAccount = (address: string) => {
    setAllAccounts((prev) =>
      prev.map((acc) =>
        acc.address === address ? { ...acc, selected: !acc.selected } : acc
      )
    );
  };

  const handleAliasChange = (address: string, newAlias: string) => {
    setAllAccounts((prev) =>
      prev.map((acc) =>
        acc.address === address ? { ...acc, displayAlias: newAlias } : acc
      )
    );
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      const selectedAccounts = allAccounts
        .filter((acc) => acc.selected)
        .map((acc) => ({
          alias: acc.displayAlias,
          item: acc.address,
        }));

      await walletAPI.updateAccountAuthorization(appId, selectedAccounts);
      await onSave();
      onClose();
    } catch (err) {
      console.error("Failed to update authorization:", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const selectedCount = allAccounts.filter((a) => a.selected).length;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Edit Account Authorization for {appId}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Select which accounts this app can access and customize the aliases
          shown to the app.
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Selected Accounts: {selectedCount}
        </Typography>

        <List>
          {allAccounts.map((account) => (
            <ListItem
              key={account.address}
              sx={{
                flexDirection: "column",
                alignItems: "stretch",
                border: 1,
                borderColor: "divider",
                borderRadius: 1,
                mb: 1,
                p: 2,
              }}
            >
              <FormControlLabel
                control={
                  <Checkbox
                    checked={account.selected}
                    onChange={() => handleToggleAccount(account.address)}
                  />
                }
                label={
                  <Box>
                    <Typography variant="body2">
                      {account.originalAlias}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontFamily: "monospace" }}
                    >
                      {account.address.slice(0, 10)}...
                      {account.address.slice(-8)}
                    </Typography>
                  </Box>
                }
              />
              {account.selected && (
                <TextField
                  fullWidth
                  size="small"
                  label="Alias shown to app"
                  value={account.displayAlias}
                  onChange={(e) =>
                    handleAliasChange(account.address, e.target.value)
                  }
                  sx={{
                    mt: 1,
                    ml: 4,
                    '& .MuiInputBase-input': {
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }
                  }}
                  helperText="The app will see this account under this alias"
                />
              )}
            </ListItem>
          ))}
        </List>

        {allAccounts.length === 0 && (
          <Alert severity="info">
            No accounts available. Create an account first.
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={saving || selectedCount === 0}
        >
          {saving ? "Saving..." : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
