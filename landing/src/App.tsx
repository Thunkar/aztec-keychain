import { DetailedHTMLProps, HTMLAttributes } from "react";
import "esp-web-tools";
import { css, keyframes } from "@emotion/react";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import { colors } from "./styles";
import Typography from "@mui/material/Typography";
import BoltIcon from "@mui/icons-material/Bolt";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "esp-web-install-button": DetailedHTMLProps<
        HTMLAttributes<HTMLElement> & { manifest: string },
        HTMLElement
      >;
    }
  }
}

const container = css({
  width: "100%",
  height: "100%",
  backgroundImage: `url(assets/wireframe.png)`,
  backgroundSize: "cover",
  backgroundPosition: "center",
});

const infoBuble = css({
  display: "flex",
  borderRadius: "5rem",
  backgroundColor: colors.primary,
  alignItems: "center",
  justifyContent: "center",
  padding: "0.5rem 2rem",
});

const blink = keyframes`
  0% {
    opacity: 0;
  }
`;

const blurredContainer = css({
  position: "absolute",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  padding: "1rem",
  background: "rgba(255, 255, 255, 0.1)",
  backdropFilter: "blur(4px)",
  height: "100vh",
  width: "100vw",
});

function App() {
  return (
    <>
      <Box css={container}></Box>
      <Box css={blurredContainer}>
        <div css={infoBuble}>
          <Typography variant="h2">Keychain</Typography>
          <Typography
            variant="h2"
            css={{ animation: `${blink} 1.25s steps(2) infinite` }}
          >
            _
          </Typography>
        </div>
        <div css={{ flexGrow: 0.6, margin: "auto" }} />
        <div
          css={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            margin: "0.5rem",
          }}
        >
          {["Lost funds", "Account redeployments", "No portability"].map(
            (message, i) => (
              <Typography
                key={i}
                variant="caption"
                css={{ textDecoration: "line-through" }}
              >
                {message}
              </Typography>
            )
          )}
        </div>
        <esp-web-install-button manifest="/assets/manifest.json">
          <Button
            color="warning"
            css={{ margin: "auto", fontWeight: "bold" }}
            variant="contained"
            slot="activate"
            endIcon={<BoltIcon />}
          >
            Flash now!
          </Button>
        </esp-web-install-button>
        <div css={{ flexGrow: 1, margin: "auto" }} />
        <div css={infoBuble}>
          <Typography variant="overline">Built for </Typography>
          <img
            css={{
              marginLeft: "0.5rem",
              marginTop: "-0.2rem",
              height: "1.5rem",
              filter: "brightness(100)",
            }}
            src="assets/aztec_logo.svg"
            alt="Aztec Logo"
          />
        </div>
      </Box>
    </>
  );
}

export default App;
