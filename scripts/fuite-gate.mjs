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
const MOTEUR = path.join(CTXROUTE, 'fuite-pure.js');
if (!fs.existsSync(MOTEUR)) {
  console.log('fuite-gate : moteur ctxroute introuvable — gate NON joué (machine sans liste privée).');
  process.exit(0);
}
const { motifsInterdits, scanner } = createRequire(import.meta.url)(MOTEUR);

function termesPrives() {
  let decl;
  try {
    decl = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude', 'secrets', 'ctxroute-fuite.json'), 'utf8'));
  } catch {
    return []; // pas de liste : mode générique, jamais une panne
  }
  const termes = Array.isArray(decl.termes) ? [...decl.termes] : [];
  for (const src of Array.isArray(decl.dossiersDerives) ? decl.dossiersDerives : []) {
    try {
      for (const e of fs.readdirSync(src.racine, { withFileTypes: true })) {
        if (e.isDirectory() && fs.existsSync(path.join(src.racine, e.name, src.marqueur))) termes.push(e.name);
      }
    } catch { /* source absente ici : on n'invente rien */ }
  }
  return termes;
}

const m = motifsInterdits(os.userInfo().username, os.homedir(), termesPrives());
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
  for (const v of scanner(texte, m)) violations.push(`${rel} → ${v.nom} (${v.extrait})`);
}
if (violations.length > 0) {
  console.error('COMMIT REFUSÉ — une donnée personnelle atteindrait un dépôt PUBLIC :');
  for (const v of violations) console.error('  ' + v);
  console.error('Une donnée poussée ne se retire plus (git log -p). Corrige puis recommite.');
  process.exit(1);
}
