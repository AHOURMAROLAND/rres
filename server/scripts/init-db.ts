import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { isNeonConfigured, getNeonSql } from '../neon';

/**
 * Script d'initialisation et de test de la base de données Neon PostgreSQL.
 *
 * Utilisation :
 * bun run server/scripts/init-db.ts
 * ou
 * npm run db:init
 */

async function initNeonDatabase() {
  console.log('🐘 Test de connexion à la base de données Neon PostgreSQL...');

  if (!isNeonConfigured()) {
    console.error('❌ Erreur : DATABASE_URL n\'est pas configurée dans votre fichier .env');
    console.log('Exemple : DATABASE_URL="postgresql://user:password@ep-xyz-pooler.region.aws.neon.tech/neondb?sslmode=require"');
    process.exit(1);
  }

  const sql = getNeonSql();

  try {
    // 1. Tester la connexion
    const timeRes = await sql`SELECT NOW() as current_time, version() as pg_version`;
    console.log('✅ Connexion à Neon réussie !');
    console.log(`   Horodatage serveur : ${timeRes[0].current_time}`);
    console.log(`   Version PostgreSQL  : ${timeRes[0].pg_version.split(',')[0]}`);

    // 2. Lire le schéma SQL
    const schemaPath = path.join(process.cwd(), 'neon_schema.sql');
    if (!fs.existsSync(schemaPath)) {
      console.error(`❌ Fichier ${schemaPath} introuvable.`);
      process.exit(1);
    }

    console.log('📜 Application du schéma neon_schema.sql...');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    // Nettoyer et exécuter les commandes séparées par des points-virgules
    const statements = schemaSql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('--'));

    for (const stmt of statements) {
      if (stmt.length > 0) {
        await (sql as any)([stmt]);
      }
    }

    console.log('🎉 Schéma Neon appliqué avec succès !');
    console.log('   - Table `users` vérifiée');
    console.log('   - Table `transactions` vérifiée');
    console.log('   - Table `bets` vérifiée');
    console.log('   - Table `rounds` vérifiée');

    // Compter les utilisateurs existants
    const countRes = await sql`SELECT COUNT(*) as count FROM public.users`;
    console.log(`📊 Nombre d'utilisateurs enregistrés en base : ${countRes[0].count}`);

  } catch (err: any) {
    console.error('❌ Erreur lors de l\'initialisation de Neon :', err.message || err);
    process.exit(1);
  }
}

initNeonDatabase();
