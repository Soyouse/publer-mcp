// ═══════════════════════════════════════════════════════════════════════
// GATE ANTI-FUITE (pre-commit) — dépôt PUBLIC : aucune donnée personnelle
// ne doit ENTRER dans l'historique (une donnée poussée ne se retire plus,
// elle survit dans `git log -p`). Propagé depuis ctxroute le 16/08/2026,
// après la purge de l'historique de CE dépôt (réécrit + force-push ce jour).
//
// ⚠️ ON EXÉCUTE LE JUGE, ON NE LE RECOPIE JAMAIS : le moteur (motifs, faux
//    positifs mesurés, liste privée dérivée) vit dans ctxroute — une copie
//    ici serait un jumeau, et un jumeau diverge en silence.
// ⚠️ ctxroute absent (contributeur externe) ⇒ on LAISSE PASSER en le DISANT :
//    les termes privés ne vivent que sur la machine du mainteneur, il n'y a
//    rien que ce gate saurait protéger ailleurs. Même posture que le
//    pre-commit de ctxroute sans node_modules.
// ⚠️ AUCUN chemin personnel en dur ici (ce fichier est PUBLIC) : la racine
//    se résout depuis le HOME, ou par CTXROUTE_DIR.
// ═══════════════════════════════════════════════════════════════════════
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const CTXROUTE = process.env.CTXROUTE_DIR || path.join(os.homedir(), 'Desktop', 'ctxroute');
const MOTEUR = path.join(CTXROUTE, 'src', 'leak-pure.js');
if (!fs.existsSync(MOTEUR)) {
  console.log('fuite-gate : moteur ctxroute introuvable — gate NON joué (machine sans liste privée).');
  process.exit(0);
}
const { forbiddenPatterns, scan } = createRequire(import.meta.url)(MOTEUR);
// ⚠️ SOURCE UNIQUE de la liste (termes + dérivation + exceptions) : fuite-liste.js
//    de ctxroute — la recopier ici serait un jumeau, et il a divergé le jour même
//    (l'exception « marque » n'existait pas dans la copie).
const { privateTerms } = createRequire(import.meta.url)(path.join(CTXROUTE, 'src', 'leak-list.js'));

const m = forbiddenPatterns(os.userInfo().username, os.homedir(), privateTerms());
// Périmètre = ce qui va ENTRER dans l'historique : les fichiers de l'index.
const fichiers = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACM'], { encoding: 'utf8' })
  .split('\n').map((s) => s.trim()).filter(Boolean);
const violations = [];
for (const rel of fichiers) {
  let texte;
  try {
    texte = execFileSync('git', ['show', ':' + rel], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch {
    continue; // binaire/illisible : hors périmètre texte
  }
  for (const v of scan(texte, m)) violations.push(`${rel} → ${v.name} (${v.excerpt})`);
}
if (violations.length > 0) {
  console.error('COMMIT REFUSÉ — une donnée personnelle atteindrait un dépôt PUBLIC :');
  for (const v of violations) console.error('  ' + v);
  console.error('Une donnée poussée ne se retire plus (git log -p). Corrige puis recommite.');
  process.exit(1);
}
