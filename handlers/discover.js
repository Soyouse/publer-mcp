/**
 * Outil `publer_discover` — catalogue des endpoints Publer (rechargé À CHAUD).
 *
 * ⚠️ Sans filtre : résumé compact (catégories + count) pour économiser les tokens.
 * Avec {category} : détail des endpoints. Le catalogue est dans lib/core/catalog.json
 * (éditable à chaud, relu sur changement mtime, sans restart MCP).
 */
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = join(here, "..", "lib", "core", "catalog.json");

let catalog = null;
let mtime = 0;

async function loadCatalog() {
  const { mtimeMs } = await stat(CATALOG_PATH);
  if (mtimeMs !== mtime) {
    catalog = JSON.parse(await readFile(CATALOG_PATH, "utf8"));
    mtime = mtimeMs;
  }
  return catalog;
}

// Stryker disable all : métadonnée déclarative (description/schema) — aucun contrat comportemental.
export const tool = {
  name: "publer_discover",
  description:
    "Liste les endpoints de l'API Publer, groupés par domaine. Sans argument : résumé des " +
    "catégories. Avec {category} : détail des endpoints de la catégorie.",
  inputSchema: {
    type: "object",
    properties: {
      category: {
        type: "string",
        description: "Filtre : users, workspaces, accounts, posts, media, analytics",
      },
    },
  },
  // Stryker restore all
  async handle(args) {
    const cat = await loadCatalog();
    // Les clés méta (préfixe "_", ex: _note) ne sont pas des catégories d'endpoints.
    const categories = Object.keys(cat).filter((k) => !k.startsWith("_"));
    if (args.category) {
      const key = String(args.category).toLowerCase();
      if (!categories.includes(key)) return `Catégorie inconnue. Disponibles : ${categories.join(", ")}`;
      return JSON.stringify({ [key]: cat[key] }, null, 2);
    }
    const summary = Object.fromEntries(
      categories.map((k) => [k, `${cat[k].length} endpoints`])
    );
    return JSON.stringify(
      { categories: summary, hint: "Rappeler avec {category} pour le détail" },
      null,
      2
    );
  },
};
