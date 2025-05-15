import { Account } from "./DataContextContainer";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import ArrowDropDown from "@mui/icons-material/ArrowDropDown";

import { addressToShortStr, keyToShortStr } from "../utils/format";
import IconButton from "@mui/material/IconButton";
import { useState } from "react";
import QrCode from "@mui/icons-material/QrCode";
import { QRDialog } from "./QRDialog";

interface AccountBoxProps {
  account: Account;
  disabled: boolean;
  buttonText: string;
  QRButton?: boolean;
  onClick: (index: number) => void;
}

export function AccountBox({
  account,
  onClick,
  buttonText,
  QRButton = false,
  disabled,
}: AccountBoxProps) {
  const [openQR, setOpenQR] = useState(false);
  return (
    <Accordion sx={{ margin: 0 }}>
      <AccordionSummary
        sx={{
          display: "flex",
          flexDirection: "row-reverse",
          padding: "0.1rem 0.5rem",
        }}
        expandIcon={<ArrowDropDown />}
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
          {account.address
            ? addressToShortStr(account.address)
            : "Uninitialized"}
        </Typography>
        {QRButton && account.address && (
          <IconButton onClick={() => setOpenQR(true)}>
            <QrCode />
          </IconButton>
        )}
        <div css={{ flexGrow: 1 }}></div>
        <Button
          variant="contained"
          color="secondary"
          sx={{ marginLeft: "1rem", borderRadius: "1rem" }}
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation();
            onClick(account.index);
          }}
        >
          {buttonText}
        </Button>
      </AccordionSummary>
      <AccordionDetails>
        <Typography variant="subtitle2">
          Public key: {keyToShortStr(account.pk)}
        </Typography>
        <Typography variant="subtitle2">
          Salt: {keyToShortStr(account.salt)}
        </Typography>
        <Typography variant="subtitle2">
          Contract class id: {keyToShortStr(account.contractClassId)}
        </Typography>
        <Typography variant="subtitle2">
          Version: {import.meta.env.VITE_ACCOUNT_VERSION}
        </Typography>
      </AccordionDetails>
      {openQR && account.address && (
        <QRDialog
          open={openQR}
          onClose={() => setOpenQR(false)}
          address={account.address!}
        />
      )}
    </Accordion>
  );
}
