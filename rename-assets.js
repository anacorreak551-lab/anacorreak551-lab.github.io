import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, 'src', 'assets', 'games');

for (const platformDir of fs.readdirSync(root, { withFileTypes: true })) {
  if (!platformDir.isDirectory()) continue;

  const platformPath = path.join(root, platformDir.name);

  for (const gameDir of fs.readdirSync(platformPath, { withFileTypes: true })) {
    if (!gameDir.isDirectory()) continue;

    const gamePath = path.join(platformPath, gameDir.name);
    const files = fs.readdirSync(gamePath).filter((file) =>
      ['.png', '.jpg', '.jpeg', '.webp'].includes(path.extname(file).toLowerCase()),
    );

    if (!files.length) continue;

    const target = files.find((file) => path.basename(file, path.extname(file)) === gameDir.name) || files[0];
    const oldPath = path.join(gamePath, target);
    const newName = gameDir.name + path.extname(target);
    const newPath = path.join(gamePath, newName);

    if (oldPath !== newPath) {
      fs.renameSync(oldPath, newPath);
      console.log(`${oldPath} -> ${newPath}`);
    }
  }
}
