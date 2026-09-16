// Mounted once per component test by @playwright/experimental-ct-react. The
// global stylesheet is what makes Tailwind's utilities and the theme tokens
// real inside the harness; without it every primitive renders unstyled.
import '../src/app/globals.css';

// The locale layout sets the brand font variables through `next/font`, which
// Vite never runs. An unset `var(--font-inter)` does not fall through to the
// next family in the list — it invalidates the whole declaration and the
// browser lands on its default serif. Pin the variables to fonts every Windows
// machine has, so baselines are sans-serif and deterministic.
document.documentElement.style.setProperty('--font-inter', "'Segoe UI'");
document.documentElement.style.setProperty('--font-barlow', "'Segoe UI'");
document.documentElement.style.setProperty('--font-bebas-neue', 'Impact');
document.documentElement.style.setProperty('--font-jetbrains-mono', 'Consolas');
