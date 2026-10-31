# Ten Band EQ

A browser graphic equalizer with a live spectrum, sibling to the Dudley Vocoder. No dependencies: open `index.html`.

- Layouts: **Studio** (low shelf 80 Hz, eight peaking bands 160 Hz to 6.3 kHz, high shelf 10 kHz) and **Bell 1940** (the ten vocoder band centers from Dudley's BSTJ 1940 paper, 0-250 Hz lowest then 300 Hz bands to 2950 Hz, as peaking filters).
- Drag the curve or use the faders (plus or minus 15 dB), presets, output trim, bypass.
- Sources: pink noise, a synthetic demo phrase, or your own audio file. `index.html` can also save the processed audio as WAV.

Build: `python3 build.py` (makes `index.html` and `artifact.html` from `template.html`). Test: `NODE_PATH=$(npm root -g) node test.cjs` (Playwright, Chromium).

## Verified / not verified
Measured in headless Chromium: flat is exactly flat; each peaking band lands within 1.5 dB of its set gain at its center; shelves give half gain at the corner and full gain past it; offline rendering of pink noise matches the curve (+11.7 dB measured for +12 dB at 1 kHz, far bands unchanged); bypass is transparent.
Not checked: how it sounds. The Bell 1940 layout reuses the band layout only; a vocoder's band-pass filters are not these peaking filters.

## Citations
- Dudley, H. (1940). The carrier nature of speech. Bell System Technical Journal, 19(4), 495-515.
- Bristow-Johnson, R. Cookbook formulae for audio EQ biquad filter coefficients (the W3C Audio EQ Cookbook, which the Web Audio biquad filter types follow).
