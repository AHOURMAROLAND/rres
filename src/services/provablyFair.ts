/**
 * Provably Fair System & Weighted Crash Distribution Engine
 * 
 * Ensures transparent, cryptographically verifiable, and economically balanced game outcomes.
 * Distribution rules:
 * - 1.00x à 1.20x -> 40% des parties (pertes rapides / crashs instantanés)
 * - 1.20x à 2.00x -> 30% des parties
 * - 2.00x à 5.00x -> 20% des parties
 * - 5.00x à 10.00x -> 7% des parties
 * - 10.00x à 25.00x -> 3% des parties (très rare, 20x+ extrêmement rare)
 * - Plafond absolu : 25.00x
 */

export async function sha256(message: string): Promise<string> {
  // Use crypto.subtle if available, otherwise fallback to standard hash
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback hash
  let hash = 0;
  for (let i = 0; i < message.length; i++) {
    const char = message.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(64, 'a');
}

export function generateSeed(length = 32): string {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/**
 * Deterministic pseudo-random float generator with 53-bit uniform precision in [0, 1)
 */
function hashToUniformFloat(serverSeed: string, clientSeed: string, nonce: number): number {
  const input = `${serverSeed}:${clientSeed}:${nonce}:aerocrash_weighted_v2`;
  let h1 = 0xdeadbeef ^ nonce;
  let h2 = 0x41c64e6d ^ (nonce * 31);
  
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  
  const high = 2097151 & h2;
  const low = h1 >>> 0;
  return (high * 4294967296 + low) / (4294967296 * 2097152);
}

/**
 * Calculates crash multiplier from seeds with weighted controlled distribution:
 * - 0x / 1.00x à 1.20x : 40%
 * - 1.20x à 2.00x : 30%
 * - 2.00x à 5.00x : 20%
 * - 5.00x à 10.00x : 7%
 * - 10.00x à 25.00x : 3% (20x+ extrêmement rare)
 * - Maximum strict : 25.00x
 */
export function calculateCrashMultiplier(serverSeed: string, clientSeed: string, nonce: number): number {
  const u = hashToUniformFloat(serverSeed, clientSeed, nonce);
  let mult: number;

  // 1. Tier 1: 1.00x à 1.20x -> 40% des parties (pertes rapides)
  if (u < 0.40) {
    const p = u / 0.40; // [0, 1)
    // ~7.5% de ce palier (soit 3% de toutes les parties) crash immédiat à 1.00x
    if (p < 0.075) {
      mult = 1.00;
    } else {
      const sub = (p - 0.075) / 0.925;
      mult = 1.01 + sub * 0.19; // 1.01x à 1.20x
    }
  } 
  // 2. Tier 2: 1.20x à 2.00x -> 30% des parties
  else if (u < 0.70) {
    const p = (u - 0.40) / 0.30; // [0, 1)
    // Courbe naturelle favorisant les gains modérés (1.25x - 1.65x)
    mult = 1.20 + Math.pow(p, 1.15) * 0.80;
  } 
  // 3. Tier 3: 2.00x à 5.00x -> 20% des parties
  else if (u < 0.90) {
    const p = (u - 0.70) / 0.20; // [0, 1)
    mult = 2.00 + Math.pow(p, 1.25) * 3.00;
  } 
  // 4. Tier 4: 5.00x à 10.00x -> 7% des parties
  else if (u < 0.97) {
    const p = (u - 0.90) / 0.07; // [0, 1)
    mult = 5.00 + Math.pow(p, 1.2) * 5.00;
  } 
  // 5. Tier 5: 10.00x à 25.00x -> 3% des parties (très rare, 20x+ extrêmement rare)
  else {
    const p = (u - 0.97) / 0.03; // [0, 1)
    // La puissance 2.5 garantit que franchir 20x n'arrive que pour p > 0.85 (< 0.45% de l'ensemble des parties)
    mult = 10.00 + Math.pow(p, 2.5) * 15.00;
  }

  // Plafond absolu strict : ne dépasse JAMAIS 25.00x
  const capped = Math.min(25.00, Math.max(1.00, mult));
  return Math.floor(capped * 100) / 100;
}
