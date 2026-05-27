import { Composition } from "remotion";
import { HeroTerminal } from "./hero-terminal";

export const RemotionRoot = () => {
  return (
    <Composition
      id="HeroTerminal"
      component={HeroTerminal}
      durationInFrames={180}
      fps={30}
      height={900}
      width={1440}
    />
  );
};
