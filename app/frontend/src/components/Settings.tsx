import TextField from "@mui/material/TextField";
import OutlinedInput from "@mui/material/OutlinedInput";
import InputAdornment from "@mui/material/InputAdornment";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import IconButton from "@mui/material/IconButton";

import { useContext, useEffect, useState } from "react";
import { Button } from "@mui/material";
import { DataContext } from "../utils/context";

interface SettingsProps {
  SSID: string;
  password: string;
}

export function Settings({ SSID, password }: SettingsProps) {
  const { storeSettings } = useContext(DataContext);

  const [currentSSID, setCurrentSSID] = useState(SSID);
  const [currentPassword, setCurrentPassword] = useState(password);

  const [dirty, setDirty] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [error, setError] = useState(false);

  useEffect(() => {
    const isDirty = SSID !== currentSSID || password !== currentPassword;
    setDirty(isDirty);
    setError(currentPassword.length < 8);
  }, [currentPassword, currentSSID, SSID, password]);

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
      />
      <div css={{ display: "flex", alignItems: "center" }}>
        <TextField
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          fullWidth
          type={showPassword ? "text" : "password"}
          label="Password"
          error={error}
          helperText={error ? "Password must be at least 8 characters" : ""}
        />
        <IconButton
          css={{ marginLeft: "0.5rem", marginTop: error ? "-1.25rem" : "0" }}
          onClick={() => setShowPassword(!showPassword)}
        >
          {showPassword ? <VisibilityOff /> : <Visibility />}
        </IconButton>
      </div>
      <Typography css={{ marginTop: "0.5rem" }} variant="subtitle2">
        Reset the device for changes to take effect
      </Typography>
      <div css={{ flexGrow: 1 }}></div>
      <Button
        variant="outlined"
        sx={{ mt: "auto" }}
        disabled={!dirty || error}
        onClick={() => handleChange()}
      >
        Update
      </Button>
    </Box>
  );
}
