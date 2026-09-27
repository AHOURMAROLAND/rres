import { LivePlayerBet } from '../types';

export interface VirtualProfile {
  name: string;
  avatar: string;
  country: string;
}

export const VIRTUAL_PROFILES: VirtualProfile[] = [
  // Côte d'Ivoire (225)
  { name: 'Ibrahim_Abj', avatar: '👨🏾‍💼', country: 'CI' },
  { name: 'Fatou_CI', avatar: '👩🏾‍🦱', country: 'CI' },
  { name: 'Yao_Kouassi', avatar: '🦁', country: 'CI' },
  { name: 'Didier_CIV', avatar: '⚽', country: 'CI' },
  { name: 'Ange_Yop', avatar: '⚡', country: 'CI' },
  { name: 'Kouamé_225', avatar: '👑', country: 'CI' },
  { name: 'Bakayoko_CI', avatar: '🔥', country: 'CI' },
  { name: 'Marie_Abidjan', avatar: '🌟', country: 'CI' },
  { name: 'Stephane_CI', avatar: '🚀', country: 'CI' },
  { name: 'Bamba_Plateau', avatar: '🦅', country: 'CI' },
  { name: 'Estelle_Cocody', avatar: '💎', country: 'CI' },
  { name: 'Franck_CIV', avatar: '🎯', country: 'CI' },
  { name: 'Hermann_Bouake', avatar: '🌴', country: 'CI' },
  { name: 'Cynthia_Abj', avatar: '✨', country: 'CI' },
  { name: 'Koffi_SanPedro', avatar: '🌊', country: 'CI' },
  { name: 'Yves_225', avatar: '🎲', country: 'CI' },
  { name: 'Aicha_CI', avatar: '🌺', country: 'CI' },
  { name: 'Serge_Treich', avatar: '🏆', country: 'CI' },

  // Sénégal (221)
  { name: 'Amadou_DKR', avatar: '🛫', country: 'SN' },
  { name: 'Awa_221', avatar: '👑', country: 'SN' },
  { name: 'Cheikh_Ndiaye', avatar: '🎯', country: 'SN' },
  { name: 'Bamba_SN', avatar: '🦅', country: 'SN' },
  { name: 'Diallo_DKR', avatar: '⚡', country: 'SN' },
  { name: 'Assane_Goree', avatar: '🌊', country: 'SN' },
  { name: 'Khady_Thies', avatar: '💎', country: 'SN' },
  { name: 'Modou_Lo', avatar: '🦁', country: 'SN' },
  { name: 'Saliou_221', avatar: '🔥', country: 'SN' },
  { name: 'Coumba_SN', avatar: '🌟', country: 'SN' },
  { name: 'Lamine_Dakar', avatar: '🚀', country: 'SN' },
  { name: 'Papa_Sow', avatar: '🏆', country: 'SN' },
  { name: 'Ndeye_Fatou', avatar: '✨', country: 'SN' },
  { name: 'Babacar_Mermoz', avatar: '🎲', country: 'SN' },
  { name: 'Moussa_Almadies', avatar: '⛵', country: 'SN' },
  { name: 'Ousmane_221', avatar: '🎯', country: 'SN' },

  // Mali (223)
  { name: 'Moussa_BKO', avatar: '⚡', country: 'ML' },
  { name: 'Bakary_ML', avatar: '🦁', country: 'ML' },
  { name: 'Sékou_Bamako', avatar: '🔥', country: 'ML' },
  { name: 'Fousseyni_ML', avatar: '💎', country: 'ML' },
  { name: 'Adama_BKO', avatar: '🚀', country: 'ML' },
  { name: 'Aminata_ML', avatar: '👑', country: 'ML' },
  { name: 'Boubacar_Sikasso', avatar: '🎯', country: 'ML' },
  { name: 'Oumar_BKO', avatar: '🦅', country: 'ML' },
  { name: 'Mariatou_ML', avatar: '🌟', country: 'ML' },
  { name: 'Dramane_ML', avatar: '🎲', country: 'ML' },

  // Burkina Faso (226)
  { name: 'Ousmane_BF', avatar: '🔥', country: 'BF' },
  { name: 'Wendkouni_BF', avatar: '✨', country: 'BF' },
  { name: 'Wendyam_Ouaga', avatar: '🦁', country: 'BF' },
  { name: 'Rasmane_BF', avatar: '⚡', country: 'BF' },
  { name: 'Salam_Bobo', avatar: '💎', country: 'BF' },
  { name: 'Fatim_BF', avatar: '👑', country: 'BF' },
  { name: 'Inoussa_Ouaga', avatar: '🚀', country: 'BF' },
  { name: 'Karim_BF', avatar: '🎯', country: 'BF' },

  // Togo & Bénin (228 & 229)
  { name: 'Koffi_Lomé', avatar: '🚀', country: 'TG' },
  { name: 'Serge_Cotonou', avatar: '💎', country: 'BJ' },
  { name: 'Jean_Luc_TG', avatar: '🎯', country: 'TG' },
  { name: 'Brice_BJ', avatar: '🏆', country: 'BJ' },
  { name: 'Mawuli_Lomé', avatar: '⚡', country: 'TG' },
  { name: 'Akpéné_TG', avatar: '🌟', country: 'TG' },
  { name: 'Romaric_BJ', avatar: '🔥', country: 'BJ' },
  { name: 'Fiacre_Cotonou', avatar: '🦁', country: 'BJ' },
  { name: 'Espoir_TG', avatar: '👑', country: 'TG' },
  { name: 'Gloria_PortoNovo', avatar: '✨', country: 'BJ' },
  { name: 'Rodrigue_BJ', avatar: '🎲', country: 'BJ' },

  // Cameroun (237)
  { name: 'Nadège_DLA', avatar: '👩🏾‍🦱', country: 'CM' },
  { name: 'Yannick_Douala', avatar: '🦁', country: 'CM' },
  { name: 'Samuel_237', avatar: '⚽', country: 'CM' },
  { name: 'Vanessa_YDE', avatar: '✨', country: 'CM' },
  { name: 'Boris_CM', avatar: '🔥', country: 'CM' },
  { name: 'Junior_237', avatar: '🚀', country: 'CM' },
  { name: 'Brenda_Yaoundé', avatar: '💎', country: 'CM' },
  { name: 'Patrick_DLA', avatar: '🎯', country: 'CM' },

  // Guinée, Niger & Ghana
  { name: 'Diallo_Conakry', avatar: '⚡', country: 'GN' },
  { name: 'Mamadou_GN', avatar: '🦅', country: 'GN' },
  { name: 'Alima_Niamey', avatar: '👑', country: 'NE' },
  { name: 'Souleymane_GN', avatar: '🏆', country: 'GN' },
  { name: 'Abdoul_Niger', avatar: '🌟', country: 'NE' },
  { name: 'Idrissa_NE', avatar: '🔥', country: 'NE' },
  { name: 'Kwamé_Accra', avatar: '🚀', country: 'GH' },
  { name: 'Kofi_Ghana', avatar: '🦁', country: 'GH' },
  { name: 'Kaba_GN', avatar: '💎', country: 'GN' },
  { name: 'Fode_Conakry', avatar: '🎯', country: 'GN' },
];

/**
 * Generate a realistic crowd of 38 to 65 active live bets with realistic
 * stake distributions and pre-planned exit targets.
 */
export function generateRealisticLiveBets(): LivePlayerBet[] {
  // Shuffle available profiles
  const pool = [...VIRTUAL_PROFILES].sort(() => 0.5 - Math.random());
  // Crowd size: 40 to 65 players
  const count = 42 + Math.floor(Math.random() * 22);
  const selected = pool.slice(0, Math.min(count, pool.length));

  const stakeTiers = [
    { weight: 25, amounts: [200, 300, 500] },
    { weight: 35, amounts: [1000, 1500, 2000, 2500] },
    { weight: 25, amounts: [3000, 5000, 7500] },
    { weight: 12, amounts: [10000, 15000, 20000, 25000] },
    { weight: 3, amounts: [50000, 75000, 100000] },
  ];

  return selected.map((profile, idx) => {
    // Pick stake by weighted tier
    const roll = Math.random() * 100;
    let tier = stakeTiers[0];
    let cumulative = 0;
    for (const t of stakeTiers) {
      cumulative += t.weight;
      if (roll <= cumulative) {
        tier = t;
        break;
      }
    }
    const betAmount = tier.amounts[Math.floor(Math.random() * tier.amounts.length)];

    // Target multiplier distribution
    // 40% safe: 1.12x - 1.55x
    // 35% balanced: 1.55x - 2.50x
    // 17% ambitious: 2.50x - 5.00x
    // 6% high-risk: 5.00x - 10.00x
    // 2% moon: 10.00x - 23.50x (max cap 25x)
    const stratRoll = Math.random();
    let targetMultiplier: number;
    if (stratRoll < 0.40) {
      targetMultiplier = 1.12 + Math.random() * 0.43; // 1.12 - 1.55
    } else if (stratRoll < 0.75) {
      targetMultiplier = 1.55 + Math.random() * 0.95; // 1.55 - 2.50
    } else if (stratRoll < 0.92) {
      targetMultiplier = 2.50 + Math.random() * 2.50; // 2.50 - 5.00
    } else if (stratRoll < 0.98) {
      targetMultiplier = 5.00 + Math.random() * 5.00; // 5.00 - 10.00
    } else {
      targetMultiplier = 10.00 + Math.random() * 13.50; // 10.00 - 23.50
    }
    targetMultiplier = Math.round(targetMultiplier * 100) / 100;

    return {
      id: `bot_${profile.country}_${idx}_${Date.now()}`,
      username: profile.name,
      avatar: profile.avatar,
      betAmount,
      cashoutMultiplier: null,
      winAmount: null,
      status: 'betting',
      targetMultiplier,
    };
  });
}
