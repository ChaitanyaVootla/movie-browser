// Loaded lazily by MotionProvider (a separate chunk). domAnimation covers
// everything the app uses: animate/initial/exit, variants, AnimatePresence,
// hover/tap/focus gestures and whileInView. Switch to domMax ONLY if a
// component starts using `layout`/`layoutId` or `drag` — and LazyMotion `strict`
// will not warn about that, the animation just silently won't run.
import { domAnimation } from "framer-motion";

export default domAnimation;
