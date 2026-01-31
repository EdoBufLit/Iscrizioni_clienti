import { MotionConfig } from "framer-motion";
import { defaultTransition } from "./motionPresets";

type Props = { children: React.ReactNode };

const MotionProvider = ({ children }: Props) => (
  <MotionConfig transition={defaultTransition}>{children}</MotionConfig>
);

export default MotionProvider;
