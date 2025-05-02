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

  useEffect(() => {
    const isDirty = SSID !== currentSSID || password !== currentPassword;
    setDirty(isDirty);
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
      <OutlinedInput
        value={currentPassword}
        onChange={(event) => setCurrentPassword(event.target.value)}
        fullWidth
        type={showPassword ? "text" : "password"}
        label="Password"
        endAdornment={
          <InputAdornment position="end">
            <IconButton
              aria-label={
                showPassword ? "hide the password" : "display the password"
              }
              onClick={() => setShowPassword(!showPassword)}
              edge="end"
            >
              {showPassword ? <VisibilityOff /> : <Visibility />}
            </IconButton>
          </InputAdornment>
        }
      />
      <Typography css={{ marginTop: "0.5rem" }} variant="subtitle2">
        Reset the device for changes to take effect
      </Typography>
      <div css={{ flexGrow: 1 }}></div>
      <Button
        variant="outlined"
        sx={{ mt: "auto" }}
        disabled={!dirty}
        onClick={() => handleChange()}
      >
        Update
      </Button>
    </Box>
  );
}
