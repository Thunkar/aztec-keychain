import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import { smallSlant, useAsciiText } from "react-ascii-text";
import { useContext } from "react";
import { DataContext } from "./utils/context";
import Button from "@mui/material/Button";
import { keyToShortStr } from "./utils/format";
import { css } from "@emotion/react";
import { colors } from "./styles";

const keyBox = css({
  display: "flex",
  borderRadius: "1rem",
  background: colors.primary,
  fontsize: "1.5rem",
  padding: "0.5rem",
  margin: "0.5rem 1rem",
});

function App() {
  const asciiTextRef = useAsciiText({
    animationCharacters: "▒░█",
    animationCharacterSpacing: 1,
    animationDelay: 0,
    animationDirection: "down",
    animationInterval: 0,
    animationLoop: false,
    animationSpeed: 40,
    fadeInOnly: true,
    font: smallSlant,
    text: "Aztec",
  });

  // Using a ref callback to bridge the type mismatch.
  const refCallback = (element: HTMLPreElement | null) => {
    if (asciiTextRef) {
      asciiTextRef.current = element ?? undefined;
    }
  };

  const { generateKeyPair, keyChainStatus, websocketStatus, keys } =
    useContext(DataContext);

  return (
    <>
      <pre
        css={{ color: colors.primary, padding: 0, margin: 0 }}
        ref={refCallback}
      ></pre>
      <Typography variant="subtitle1">
        Websocket status: {websocketStatus}
      </Typography>
      <Box
        sx={{
          width: "100%",
          flexGrow: 1,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {keys.map((key, index) => (
          <Box css={keyBox} key={index}>
            <Typography variant="overline" sx={{ fontSize: "1rem" }}>
              {index}. {keyToShortStr(key)}
            </Typography>
            <Button
              variant="contained"
              color="secondary"
              sx={{ marginLeft: "auto", borderRadius: "1rem" }}
              onClick={() => generateKeyPair(index)}
            >
              Regenerate
            </Button>
          </Box>
        ))}
      </Box>
    </>
  );
}

export default App;
