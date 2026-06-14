import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";

/**
 * Load an Ed25519 keypair from SUI_PRIVATE_KEY (bech32 `suiprivkey1...`, the
 * format `sui keytool export` produces). Throws with a helpful message if unset.
 */
export function loadKeypair(secret = process.env.SUI_PRIVATE_KEY): Ed25519Keypair {
  if (!secret) {
    throw new Error(
      "SUI_PRIVATE_KEY is not set. Export one with `sui keytool export --key-identity <addr>` " +
        "or generate via `sui client new-address ed25519`, then set it in your environment.",
    );
  }
  if (secret.startsWith("suiprivkey")) {
    const { secretKey } = decodeSuiPrivateKey(secret);
    return Ed25519Keypair.fromSecretKey(secretKey);
  }
  // Fallback: 32-byte base64 secret key.
  return Ed25519Keypair.fromSecretKey(secret);
}

export function tryLoadAddress(): string | undefined {
  try {
    return loadKeypair().toSuiAddress();
  } catch {
    return undefined;
  }
}
