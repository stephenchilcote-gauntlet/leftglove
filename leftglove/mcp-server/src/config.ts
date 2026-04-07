export interface Config {
  sieveUrl: string;
  slProjectDir: string;
  serverName: string;
  serverVersion: string;
}

export function loadConfig(): Config {
  return {
    sieveUrl: process.env.SIEVE_URL ?? "http://localhost:3333",
    slProjectDir: process.env.SL_PROJECT_DIR ?? process.cwd(),
    serverName: "leftglove",
    serverVersion: "0.1.0",
  };
}
