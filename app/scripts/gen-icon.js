#!/usr/bin/env node
/* Generates the source icon/splash art (gold clubs on felt green) into assets/,
   then those are expanded to all Android densities by @capacitor/assets. */
'use strict';
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const dir = path.resolve(__dirname, '..', 'assets');
fs.mkdirSync(dir, { recursive: true });

const GOLD = '#e8c766', GOLD_ED = '#b9973f', GREEN = '#0b6b3a', GREEN2 = '#0a5730', GREEN_DK = '#06301c';

// A clubs (♣) drawn as three lobes + a flared stem, centred in a 1024 viewBox.
function clubs(color) {
  return `
    <g fill="${color}" stroke="${GOLD_ED}" stroke-width="5" stroke-linejoin="round">
      <circle cx="512" cy="360" r="150"/>
      <circle cx="388" cy="512" r="150"/>
      <circle cx="636" cy="512" r="150"/>
      <path d="M512 512 Q 466 690 400 812 L 624 812 Q 558 690 512 512 Z"/>
    </g>`;
}
const bgGrad = `<defs><radialGradient id="g" cx="50%" cy="42%" r="72%">
  <stop offset="0%" stop-color="${GREEN}"/><stop offset="100%" stop-color="${GREEN2}"/></radialGradient></defs>`;

const iconOnly = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${bgGrad}<rect width="1024" height="1024" fill="url(#g)"/>${clubs(GOLD)}</svg>`;
const iconFg   = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${clubs(GOLD)}</svg>`;
const iconBg   = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${bgGrad}<rect width="1024" height="1024" fill="url(#g)"/></svg>`;
const splash = bg => `<svg xmlns="http://www.w3.org/2000/svg" width="2732" height="2732" viewBox="0 0 2732 2732"><rect width="2732" height="2732" fill="${bg}"/><g transform="translate(1366,1366) scale(1.7) translate(-512,-512)">${clubs(GOLD)}</g></svg>`;

(async () => {
  const jobs = [
    ['icon-only.png', iconOnly, 1024],
    ['icon-foreground.png', iconFg, 1024],
    ['icon-background.png', iconBg, 1024],
    ['splash.png', splash(GREEN2), 2732],
    ['splash-dark.png', splash(GREEN_DK), 2732],
  ];
  for (const [name, svg, size] of jobs) {
    await sharp(Buffer.from(svg)).resize(size, size).png().toFile(path.join(dir, name));
    console.log('  ✓ ' + name);
  }
})().catch(e => { console.error(e); process.exit(1); });
