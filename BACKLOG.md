# BACKLOG — publer-mcp

---

## 🔵 PRIORITE BASSE — filets structurels du parc absents de ce depot (inventorie le 29/08/2026)

**Rien n'est casse. C'est une absence de FILET, pas un defaut.** Point sorti du backlog de
`zenon-infra/infra-mcp` le 29/08/2026 (decision operateur) : un backlog de projet n'est pas un
backlog melange — un point qui ne casse pas CE depot n'y vit pas.

**LE FAIT MESURE (inventaire des 12 depots du parc, 29/08/2026)** : les garde-fous statiques
construits dans `infra-mcp` n'ont jamais ete propages. Etat du parc ce jour-la :
- `npm run ci` (la CI est UNE commande locale, le workflow ne porte AUCUNE logique) : **0 depot sur 12**
- cliquet du nombre de tests declares (un test ne peut plus disparaitre en silence) : **1 sur 12**
- fins de ligne CRLF · octet NUL brut · cross-OS · dette totale · hermeticite des tests : **0 sur 12**

**CE QUI VAUT LE COUP ICI, dans cet ordre, quand ce depot sera touche de toute facon :**
1. **`npm run ci`** — expose le MEME nom que tout le parc, et le workflow ne fait que l'APPELER.
   Sans ca, la CI locale et la CI distante divergent EN SILENCE, et un quota GitHub epuise rend
   ce depot invérifiable. Reference vivante : `zenon-infra/infra-mcp/tools/ci.mjs` +
   `helpers/ci-locale-pure.js` (source unique des etapes) + `tests/ci-locale-gate.test.js`
   (le gate qui assert LES DEUX cotes : le workflow n'appelle rien d'autre, et chaque groupe
   est bien invoque).
2. **Cliquet du nombre de tests** — perimetre DERIVE de git, donc portable tel quel. Reference :
   `zenon-infra/infra-mcp/helpers/tests-cliquet-pure.js` + `tests/tests-cliquet-gate.test.js`.
3. **Fins de ligne + octet NUL** — deux petits juges contre la corruption silencieuse d'un
   fichier destine a une machine. Reference : `fins-de-ligne-gate` / `nul-brut-gate` (memes dossiers).

⚠️ **NE PAS recopier un CHIFFRE d'un autre depot** (budget, cliquet, plancher) : toute ligne de
base se GENERE par la mesure de CE depot. Un cliquet importe est un cliquet invente, et il ne
protege de rien.
🛑 **NE PAS faire de ce point un chantier a part entiere** : il se traite quand ce depot est ouvert
pour une AUTRE raison. Priorite basse assumee — le vrai filtre reste les utilisateurs.
