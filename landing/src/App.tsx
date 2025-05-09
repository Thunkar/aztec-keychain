import { DetailedHTMLProps, HTMLAttributes } from "react";
import "esp-web-tools";
import { css, keyframes } from "@emotion/react";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import { colors } from "./styles";
import Typography from "@mui/material/Typography";
import BoltIcon from "@mui/icons-material/Bolt";
import { IconButton } from "@mui/material";
import GitHubIcon from "@mui/icons-material/GitHub";
import Article from "@mui/icons-material/Article";
import AztecLogo from "../assets/aztec_logo.svg";
import Wireframe from "../assets/wireframe.png?url";

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
  backgroundImage: `url(${Wireframe})`,
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
  background: "rgba(15, 15, 15, 0.2)",
  backdropFilter: "blur(10px)",
  height: "100vh",
  width: "100vw",
});

const linkBox = css({
  position: "absolute",
  bottom: "1.25rem",
  right: "0.5rem",
});

function App() {
  return (
    <>
      <Box css={container}></Box>
      <Box css={blurredContainer}>
        <Box css={linkBox}>
          <IconButton
            onClick={() => window.open(import.meta.env.VITE_GITHUB_URL)}
          >
            <GitHubIcon />
          </IconButton>
        </Box>
        <div css={infoBuble}>
          <Typography variant="h3">KeyChain</Typography>
          <Typography
            variant="h3"
            css={{ animation: `${blink} 1.25s steps(2) infinite` }}
          >
            _
          </Typography>
        </div>
        <div css={{ flexGrow: 0.7, margin: "auto" }} />
        <div
          css={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            margin: "2rem",
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
        <esp-web-install-button manifest="/manifest.json">
          <Button
            color="warning"
            css={{ margin: "auto", fontWeight: "bold", fontSize: "1.25rem" }}
            variant="contained"
            slot="activate"
            endIcon={<BoltIcon />}
          >
            Flash now!
          </Button>
          <Box
            slot="unsupported"
            css={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
            }}
          >
            <Typography variant="subtitle1" color="warning">
              Unfortunately this browser cannot be used as it doesn't support
              the WebSerial API. Please use a desktop Chromium derivative
              (Chrome, Edge, Brave, Opera...)
            </Typography>
          </Box>
        </esp-web-install-button>
        <Typography css={{ marginTop: "2rem" }} variant="caption">
          also
        </Typography>
        <Button
          color="secondary"
          css={{ marginTop: "2rem", fontWeight: "bold" }}
          variant="contained"
          slot="activate"
          endIcon={<Article />}
          onClick={() => window.open(import.meta.env.VITE_DOCS_URL)}
        >
          Read the docs
        </Button>
        <div css={{ flexGrow: 1, margin: "auto" }} />
        <div css={infoBuble}>
          <Typography variant="overline">Built for </Typography>
          <img
            css={{
              marginLeft: "0.5rem",
              marginTop: "-0.15rem",
              height: "1.5rem",
              filter: "brightness(100)",
            }}
            src={AztecLogo}
            alt="Aztec Logo"
            onClick={() => window.open("https://aztec.network/")}
          />
        </div>
      </Box>
    </>
  );
}

export default App;
