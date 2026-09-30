import 'dotenv/config';

/**
 * Script utilitaire pour détecter et enregistrer automatiquement l'adresse IP publique
 * du serveur dans la Whitelist IP de SasPay (obligatoire pour autoriser les retraits).
 *
 * Utilisation :
 * bun run server/scripts/whitelist-ip.ts
 * ou
 * npm run whitelist-ip
 */

async function getPublicIp(): Promise<string> {
  const res = await fetch('https://api.ipify.org?format=json');
  const data = await res.json();
  return data.ip;
}

async function whitelistIpOnSaspay() {
  const apiKey = process.env.SASPAY_API_KEY;
  const apiUrl = process.env.SASPAY_API_URL || 'https://api.saspay.me/api/v1';

  if (!apiKey) {
    console.error('❌ Erreur : SASPAY_API_KEY n\'est pas définie dans votre fichier .env');
    process.exit(1);
  }

  console.log('🔍 Détection de l\'adresse IP publique du serveur...');
  let ip: string;
  try {
    ip = await getPublicIp();
    console.log(`✅ Adresse IP détectée : ${ip}`);
  } catch (err: any) {
    console.error('❌ Impossible de détecter l\'IP publique automatiquement :', err.message);
    process.exit(1);
  }

  console.log(`🚀 Enregistrement de l'IP ${ip} sur SasPay (${apiUrl}/merchant-ip-whitelist-entries/)...`);

  try {
    const res = await fetch(`${apiUrl}/merchant-ip-whitelist-entries/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        ip_address: ip,
        label: 'Serveur Production AeroCrash',
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok || res.status === 201) {
      console.log('🎉 Succès ! L\'IP a été ajoutée à la Whitelist SasPay.');
      console.log('Les retraits automatiques (payouts) sont maintenant autorisés pour ce serveur.');
    } else if (res.status === 409 || data?.message?.includes('already')) {
      console.log('ℹ️ Cette adresse IP est déjà autorisée dans la Whitelist SasPay.');
    } else {
      console.warn(`⚠️ Réponse de SasPay (${res.status}) :`, data);
      console.log('💡 Note : Vous pouvez également ajouter cette IP manuellement dans votre tableau de bord SasPay -> Paramètres -> Whitelist IP.');
    }
  } catch (err: any) {
    console.error('❌ Erreur réseau lors de l\'appel à SasPay :', err.message);
  }
}

whitelistIpOnSaspay();
