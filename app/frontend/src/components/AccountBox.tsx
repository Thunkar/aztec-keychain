import { Account } from "./DataContextContainer";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import ArrowDropDown from "@mui/icons-material/ArrowDropDown";

import { addressToShortStr, keyToShortStr } from "../utils/format";

interface AccountBoxProps {
  account: Account;
  disabled: boolean;
  buttonText: string;
  onClick: (index: number) => void;
}

export function AccountBox({
  account,
  onClick,
  buttonText,
  disabled,
}: AccountBoxProps) {
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
          }}
        >
          {account.address
            ? addressToShortStr(account.address)
            : "Uninitialized"}
        </Typography>
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
      </AccordionDetails>
    </Accordion>
  );
}
