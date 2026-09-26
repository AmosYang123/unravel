// Builds every app icon from assets/logo-unravel.png. Run: node scripts/make-icons.js
// The default icon is Linen; each other theme gets its own, switched in Settings.
const Jimp = require("jimp-compact");
const { PNG } = require("pngjs");
const fs = require("fs");

// Theme background and accent colour, from theme/tokens.ts. The default keeps
// Linen's dark ink so the main icon matches the logo everywhere else.
const THEMES = {
  default: ["#f7f5f2", "#322e29"],
  blush: ["#faeff2", "#d77999"],
  mist: ["#ebf3f9", "#51a0c8"],
  lilac: ["#f5f0f9", "#a677cf"],
  sage: ["#eef7f1", "#49a281"],
  dusk: ["#181721", "#a08bc6"],
  ink: ["#161413", "#c5a177"],
};

// Ball centre in the logo is about (200, 192); the thread ends at y≈650.
const BALL = { x: 200, y: 192 };
const BOTTOM = 650;
// The ball is centred left to right; the whole drawing, ball and thread, is
// centred top to bottom so the space above and below it matches.
const SCALE = 1.15;
const TOP = (1024 - 651 * SCALE) / 2;
const BALL_Y = TOP + BALL.y * SCALE;

const hex = (h) => Jimp.cssColorToHex(h);

function tinted(logo, color) {
  const { r, g, b } = Jimp.intToRGBA(hex(color));
  const out = logo.clone();
  out.scan(0, 0, out.bitmap.width, out.bitmap.height, (x, y, i) => {
    out.bitmap.data[i] = r;
    out.bitmap.data[i + 1] = g;
    out.bitmap.data[i + 2] = b;
  });
  return out;
}

async function place(src, size, scale, ballY, bg, file) {
  const canvas = new Jimp(size, size, bg);
  const l = src.clone().resize(Math.round(459 * scale), Math.round(651 * scale));
  canvas.composite(l, Math.round(size / 2 - BALL.x * scale), Math.round(ballY - BALL.y * scale));
  await canvas.writeAsync(file);
}

// iOS rejects icons with an alpha channel.
function dropAlpha(file) {
  const png = PNG.sync.read(fs.readFileSync(file));
  fs.writeFileSync(file, PNG.sync.write(png, { colorType: 2, inputHasAlpha: true }));
}

(async () => {
  const logo = await Jimp.read("assets/logo-unravel.png");
  // Android keeps the drawing inside the adaptive icon's middle 66%.
  const aScale = (SCALE * 0.66) / 2;
  const aBallY = 256 + (BALL_Y - 512) * 0.33;
  for (const [name, [bg, fg]] of Object.entries(THEMES)) {
    const art = tinted(logo, fg);
    const ios = name === "default" ? "assets/icon.png" : `assets/icons/${name}.png`;
    const android = name === "default" ? "assets/android-icon-foreground.png" : `assets/icons/${name}-android.png`;
    await place(art, 1024, SCALE, BALL_Y, hex(bg), ios);
    dropAlpha(ios);
    await place(art, 512, aScale, aBallY, 0x00000000, android);
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
