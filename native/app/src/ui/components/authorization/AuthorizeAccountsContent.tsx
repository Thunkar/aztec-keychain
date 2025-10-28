import { useContext, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Checkbox from "@mui/material/Checkbox";
import TextField from "@mui/material/TextField";
import FormControlLabel from "@mui/material/FormControlLabel";
import { WalletContext } from "../../renderer";
import type { InternalAccount } from "../../../wallet/core/internal-wallet.ts";
import type { AuthorizationItem } from "../../../wallet/types/authorization";

type SelectedAccount = {
  address: string;
  alias: string;
  originalAlias: string;
  selected: boolean;
};

interface AuthorizeAccountsContentProps {
  request: AuthorizationItem;
  onAccountsChange?: (accounts: any[]) => void;
  showAppId?: boolean;
}

export function AuthorizeAccountsContent({
  request,
  onAccountsChange,
  showAppId = true,
}: AuthorizeAccountsContentProps) {
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

  // Notify parent when accounts change
  useEffect(() => {
    if (onAccountsChange) {
      const selectedAccounts = accounts
        .filter((acc) => acc.selected)
        .map((acc) => ({
          item: acc.address,
          alias: acc.alias,
        }));
      onAccountsChange(selectedAccounts);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts]); // Only depend on accounts, not onAccountsChange to avoid infinite loop

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

  return (
    <>
      {showAppId && (
        <>
          <Typography variant="body1" gutterBottom>
            App <strong>{request.appId}</strong> is requesting access to your
            accounts.
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Select which accounts to share. You can also customize the aliases
            that will be visible to the app.
          </Typography>
        </>
      )}

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
                ? "action.hover"
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

      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
        This authorization will be remembered. You can revoke it later from the
        Authorized Apps settings.
      </Typography>
    </>
  );
}
