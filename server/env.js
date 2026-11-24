import { loadEnvFile } from 'node:process';

export function loadLocalEnv() {
  try {
    loadEnvFile();
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
