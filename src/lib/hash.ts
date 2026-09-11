export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const data = new Uint8Array(bytes.length);
  data.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const view = new Uint8Array(digest);
  let hex = "";
  for (const byte of view) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}
