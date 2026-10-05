/* The version shown in Settings must match the service worker's cache name,
   or the number on screen tells the user nothing useful. */
import fs from 'node:fs';

const sw = fs.readFileSync('sw.js', 'utf8');
const store = fs.readFileSync('js/store.js', 'utf8');

const cache = sw.match(/const CACHE = 'rental-utility-(v\d+)'/)?.[1];
const shown = store.match(/export const APP_VERSION = '(v\d+)'/)?.[1];

if (!cache) { console.log('FAIL could not read CACHE from sw.js'); process.exit(1); }
if (!shown) { console.log('FAIL could not read APP_VERSION from js/store.js'); process.exit(1); }
if (cache !== shown) {
  console.log(`FAIL sw.js is ${cache} but Settings shows ${shown} — bump both together`);
  process.exit(1);
}
console.log('  ok  sw.js and the displayed version agree (' + cache + ')');
