import { DetailedHTMLProps, HTMLAttributes } from "react";
import "esp-web-tools";
import { css } from "@emotion/react";

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

const espFlasher = css({
  fontFamily: "monospace",
});

function App() {
  return (
    <>
      <esp-web-install-button
        manifest="/assets/manifest.json"
        css
      ></esp-web-install-button>
    </>
  );
}

export default App;
