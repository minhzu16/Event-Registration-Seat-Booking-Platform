// Inlined at build time (Next.js "Bundling Environment Variables for the Browser"), so the
// variable must be referenced literally. On by default only under `next dev`; production
// builds show the demo role switcher and the concurrency lab only with NEXT_PUBLIC_DEMO_MODE=true.
const demoFlag = process.env.NEXT_PUBLIC_DEMO_MODE?.trim().toLowerCase();

export const DEMO_MODE = demoFlag
  ? ['true', '1', 'yes', 'on'].includes(demoFlag)
  : process.env.NODE_ENV === 'development';
