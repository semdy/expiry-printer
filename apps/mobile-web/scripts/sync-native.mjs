import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = resolve(root, 'dist');
const targets = [resolve(root, 'android/app/src/main/assets/public'), resolve(root, 'ios/App/App/public')];

for (const target of targets) {
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  await cp(source, target, { recursive: true });
}

console.log('Web dist synced to Android and iOS native projects.');
