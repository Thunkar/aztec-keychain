import {
  Select,
  MenuItem,
  Box,
  CircularProgress,
  Chip,
  Tooltip,
  type SelectChangeEvent,
} from "@mui/material";
import { useNetwork } from "../contexts/NetworkContext";

export function NetworkSelector() {
  const {
    currentNetwork,
    availableNetworks,
    switchNetwork,
    isNetworkSwitching,
  } = useNetwork();

  const handleNetworkChange = (event: SelectChangeEvent) => {
    switchNetwork(event.target.value);
  };

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
      <Select
        value={currentNetwork.id}
        onChange={handleNetworkChange}
        disabled={isNetworkSwitching}
        size="small"
        sx={{
          minWidth: 150,
          "& .MuiSelect-select": {
            display: "flex",
            alignItems: "center",
            gap: 1,
          },
        }}
      >
        {availableNetworks.map((network) => (
          <MenuItem key={network.id} value={network.id}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Box
                sx={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  bgcolor: network.color,
                  flexShrink: 0,
                }}
              />
              <span>{network.name}</span>
            </Box>
          </MenuItem>
        ))}
      </Select>
      {isNetworkSwitching && (
        <CircularProgress size={20} sx={{ color: "primary.main" }} />
      )}
    </Box>
  );
}
