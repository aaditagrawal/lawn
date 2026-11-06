import { createRoot } from "react-dom/client";
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "../../src/components/ui/avatar";
import { Button } from "../../src/components/ui/button";
import { Separator } from "../../src/components/ui/separator";
import "./styles.css";

function Harness() {
  const [src, setSrc] = useState<string>();
  const [loads, setLoads] = useState(0);
  const [errors, setErrors] = useState(0);
  const [clicks, setClicks] = useState(0);
  return (
    <main>
      <button onClick={() => setSrc("/avatar-a.svg")}>Source A</button>
      <button onClick={() => setSrc("/avatar-b.svg")}>Source B</button>
      <button onClick={() => setSrc("/broken.svg")}>Broken source</button>
      <button onClick={() => setSrc(undefined)}>No source</button>
      <Avatar
        data-testid="avatar"
        className="h-8 w-8"
        ref={(node) => {
          if (node) node.dataset.ref = node.tagName;
        }}
      >
        <AvatarFallback data-testid="fallback">AA</AvatarFallback>
        <AvatarImage
          src={src}
          alt="Ada"
          onLoad={() => setLoads((v) => v + 1)}
          onError={() => setErrors((v) => v + 1)}
          ref={(node) => {
            if (node) node.dataset.ref = node.tagName;
          }}
        />
      </Avatar>
      <output aria-label="Loads">{loads}</output>
      <output aria-label="Errors">{errors}</output>
      <Separator
        data-testid="separator"
        decorative={false}
        orientation="vertical"
        ref={(node) => {
          if (node) node.dataset.ref = node.tagName;
        }}
      />
      <Button onClick={() => setClicks((v) => v + 1)} className="h-8">
        Save
      </Button>
      <output aria-label="Clicks">{clicks}</output>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Harness />);
