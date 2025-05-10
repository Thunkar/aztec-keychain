import TextField from "@mui/material/TextField";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import IconButton from "@mui/material/IconButton";

import { useContext, useEffect, useState } from "react";
import { Button } from "@mui/material";
import { DataContext } from "../utils/context";
import { ConfirmResetDialog } from "./ConfirmResetDialog";

export function Settings() {
  const { storeSettings, SSID, password } = useContext(DataContext);

  const [currentSSID, setCurrentSSID] = useState(SSID);
  const [currentPassword, setCurrentPassword] = useState(password);
  const [currentRepeatPassword, setCurrentRepeatPassword] = useState(password);

  const [openConfirmResetDialog, setOpenConfirmResetDialog] = useState(false);

  const [dirty, setDirty] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [passwordError, setPasswordError] = useState("");
  const [SSIDError, setSSIDError] = useState("");

  useEffect(() => {
    if (SSID && !currentSSID) {
      setCurrentSSID(SSID);
    }
    if (password && !currentPassword) {
      setCurrentPassword(password);
      setCurrentRepeatPassword(password);
    }
  }, [password, SSID]);

  useEffect(() => {
    const isDirty = SSID !== currentSSID || password !== currentPassword;
    setDirty(isDirty);
    if (currentPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters long");
    } else if (currentPassword !== currentRepeatPassword) {
      setPasswordError("Passwords do not match");
    } else {
      setPasswordError("");
    }
    if (currentSSID.length === 0 || currentSSID.length > 31) {
      setSSIDError("SSID must be between 1 and 32 characters long");
    } else {
      setSSIDError("");
    }
  }, [currentPassword, currentSSID, currentRepeatPassword]);

  const handleChange = async () => {
    await storeSettings(currentSSID, currentPassword);
  };

  return (
    <Box
      sx={{
        padding: "0.5rem",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: "1rem",
        height: "100%",
        justifySelf: "flex-start",
      }}
    >
      <TextField
        value={currentSSID}
        onChange={(event) => setCurrentSSID(event.target.value)}
        fullWidth
        label="SSID"
        error={SSIDError !== ""}
        helperText={SSIDError}
      />
      <div css={{ display: "flex", alignItems: "center" }}>
        <TextField
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          fullWidth
          type={showPassword ? "text" : "password"}
          label="Password"
          error={passwordError != ""}
        />
        <IconButton onClick={() => setShowPassword(!showPassword)}>
          {showPassword ? <VisibilityOff /> : <Visibility />}
        </IconButton>
      </div>
      <TextField
        value={currentRepeatPassword}
        fullWidth
        onChange={(event) => setCurrentRepeatPassword(event.target.value)}
        type={showPassword ? "text" : "password"}
        label="Repeat password"
        error={passwordError != ""}
        helperText={passwordError}
      />
      <Typography css={{ marginTop: "0.5rem" }} variant="subtitle2">
        For security reasons, the device cannot be used without setting a
        password
      </Typography>
      <div css={{ flexGrow: 1 }}></div>
      <Button
        variant="outlined"
        sx={{ mt: "auto" }}
        disabled={!dirty || passwordError != ""}
        onClick={() => setOpenConfirmResetDialog(true)}
      >
        Update
      </Button>
      {openConfirmResetDialog && (
        <ConfirmResetDialog
          open={openConfirmResetDialog}
          onClose={(result) => {
            setOpenConfirmResetDialog(false);
            if (result) {
              handleChange();
            }
          }}
        />
      )}
    </Box>
  );
}
