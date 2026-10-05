/* The cache name, the version shown in Settings and the published version file
   must all agree, or the update check compares the wrong things. */
import fs from 'node:fs';

const sw = fs.readFileSync('sw.js', 'utf8');
const store = fs.readFileSync('js/store.js', 'utf8');
const pub = JSON.parse(fs.readFileSync('version.json', 'utf8'));

const cache = sw.match(/const CACHE = 'rental-utility-(v\d+)'/)?.[1];
const shown = store.match(/export const APP_VERSION = '(v\d+)'/)?.[1];

const fail = msg => { console.log('FAIL ' + msg); process.exit(1); };

if (!cache) fail('could not read CACHE from sw.js');
if (!shown) fail('could not read APP_VERSION from js/store.js');
if (!pub.version) fail('version.json has no version');

if (cache !== shown) fail(`sw.js is ${cache} but Settings shows ${shown}`);
if (cache !== pub.version) fail(`sw.js is ${cache} but version.json says ${pub.version}`);

// The install must bypass the HTTP cache, or a new cache fills with old files.
if (!/new Request\(path, \{ cache: 'reload' \}\)/.test(sw))
  fail("sw.js install does not fetch with cache: 'reload'");

// Neither file that decides whether an update exists may be served from cache.
if (!/version\.json'\)\) return;/.test(sw.replace(/\s+/g, ' ')) && !/version\.json/.test(sw))
  fail('sw.js does not bypass version.json');

console.log('  ok  cache, Settings and version.json all agree (' + cache + ')');
