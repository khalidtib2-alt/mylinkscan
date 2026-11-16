export { scanUrl } from "../../chrome-extension/shared.js";

export type FileResult = { name: string; type: string; hash?: string; warning?: string; error?: string };
const executableExtensions = /\.(exe|dll|sys|scr|com|bat|cmd|ps1|js|mjs|cjs|vbs|vbe|wsf|sh|py|msi)$/i;

export async function scanFile(file: File): Promise<FileResult> {
  const name = file.webkitRelativePath || file.name;
  let type = "Unrecognized header";
  let warning: string | undefined;
  try {
    const bytes = new Uint8Array(await file.slice(0, 8192).arrayBuffer());
    const header = new TextDecoder().decode(bytes);
    const starts = (...signature: number[]) => signature.every((byte, index) => bytes[index] === byte);
    if (starts(0x4d, 0x5a)) {
      type = "Windows executable (MZ header)";
      warning = /\.(exe|dll|scr|sys|com)$/i.test(file.name) ? "Executable header detected." : "Possible disguise. The Windows executable header conflicts with the filename.";
    } else if (starts(0x7f, 0x45, 0x4c, 0x46)) {
      type = "ELF binary";
      warning = "Executable-format header detected.";
    } else if (/^\s*(#!|@echo\s+off\b|<\?php\b|<script[\s>]|(?:powershell|pwsh)(?:\.exe)?\s)/i.test(header)) {
      type = "Script marker";
      warning = executableExtensions.test(file.name) ? "Script marker detected." : "Possible disguise. Script marker found in a file with an unexpected extension.";
    } else if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) type = "PDF";
    else if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) type = "PNG";
    else if (starts(0xff, 0xd8, 0xff)) type = "JPEG";
    else if (starts(0x50, 0x4b, 0x03, 0x04)) type = "ZIP-based format";
    if (!warning && executableExtensions.test(file.name)) warning = "The filename has an executable or script extension.";

    if (file.size > 128 * 1024 * 1024) return { name, type, warning, error: "SHA-256 skipped. This file exceeds the 128 MB browser hashing limit." };
    if (!globalThis.crypto?.subtle) return { name, type, warning, error: "SHA-256 requires HTTPS or localhost." };
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    return { name, type, warning, hash };
  } catch {
    return { name, type, warning, error: "The browser could not finish reading or hashing this file." };
  }
}
