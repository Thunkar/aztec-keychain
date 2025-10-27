import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import type { AuthorizationItem } from "../../../wallet/types/authorization";

interface AuthorizeContractContentProps {
  request: AuthorizationItem;
  showAppId?: boolean;
}

// Reusable content component for displaying registerContract authorization details
export function AuthorizeContractContent({
  request,
  showAppId = true,
}: AuthorizeContractContentProps) {
  const contractAddress = request.params.contractAddress || request.params.address || "Unknown";
  const contractName = request.params.contractName;
  const verificationUrl = `https://verify.aztec.network/contracts/${contractAddress}`;

  return (
    <>
      {showAppId && (
        <Typography variant="body1" gutterBottom>
          App <strong>{request.appId}</strong> wants to register a contract for
          interaction.
        </Typography>
      )}
      <Box
        sx={{
          mt: 2,
          p: 2,
          bgcolor: "background.default",
          borderRadius: 1,
        }}
      >
        {contractName && (
          <>
            <Typography variant="caption" color="text.secondary">
              Contract Name:
            </Typography>
            <Typography
              variant="body2"
              sx={{
                fontWeight: "medium",
                mt: 0.5,
                mb: 2,
              }}
            >
              {contractName}
            </Typography>
          </>
        )}
        <Typography variant="caption" color="text.secondary">
          Contract Address:
        </Typography>
        <Typography
          variant="body2"
          sx={{
            wordBreak: "break-all",
            fontFamily: "monospace",
            mt: 0.5,
          }}
        >
          {contractAddress.toString()}
        </Typography>

        {/* Verification status placeholder */}
        <Box
          sx={{
            mt: 2,
            pt: 2,
            borderTop: "1px solid",
            borderColor: "divider",
            display: "flex",
            alignItems: "center",
            gap: 1,
          }}
        >
          <CheckCircleIcon
            sx={{ fontSize: 18, color: "success.main" }}
          />
          <Typography variant="caption" color="success.main">
            Contract Verified
          </Typography>
          <Typography variant="caption" color="text.secondary">
            •
          </Typography>
          <Link
            href={verificationUrl}
            target="_blank"
            rel="noopener noreferrer"
            variant="caption"
            sx={{ textDecoration: "none" }}
          >
            View on Aztec Verify
          </Link>
        </Box>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
        This will allow the app to interact with this contract. The contract
        will be registered in your wallet's PXE instance.
      </Typography>
    </>
  );
}
