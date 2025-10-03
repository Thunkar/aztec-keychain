import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import ArrowDropDown from "@mui/icons-material/ArrowDropDown";

import { addressToShortStr, keyToShortStr } from "../utils/format";
import IconButton from "@mui/material/IconButton";
import { useState } from "react";
import QrCode from "@mui/icons-material/QrCode";
import { QRDialog } from "./QRDialog";
import type { Aliased, AztecAddress } from "@aztec/aztec.js";

interface AccountBoxProps {
  account: Aliased<AztecAddress>;
  QRButton?: boolean;
}

export function AccountBox({ account, QRButton = false }: AccountBoxProps) {
  const [openQR, setOpenQR] = useState(false);
  return (
    <Box sx={{ width: "100%", margin: 0 }}>
      <Box
        sx={{
          display: "flex",
          padding: "0.1rem 0.5rem",
        }}
      >
        <Typography
          variant="overline"
          sx={{
            fontSize: "0.8rem",
            textTransform: "unset",
            marginLeft: "0.5rem",
            marginRight: "0.5rem",
            lineHeight: "3.5rem",
          }}
        >
          {account.item ? addressToShortStr(account.item) : "Uninitialized"}
        </Typography>
        {QRButton && account.item && (
          <IconButton onClick={() => setOpenQR(true)}>
            <QrCode />
          </IconButton>
        )}
        <div css={{ flexGrow: 1 }}></div>
      </Box>
      {openQR && account.item && (
        <QRDialog
          open={openQR}
          onClose={() => setOpenQR(false)}
          address={account.item!}
        />
      )}
    </Box>
  );
}
