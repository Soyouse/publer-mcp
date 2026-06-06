import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // pool threads : workers = threads (pas de fork de process/fichier) → startup moins cher.
    // ⚠️ isolate reste TRUE (défaut) → registre de modules FRAIS par fichier = fiabilité préservée
    //    (l'état module-global comme le cache secrets de client.js ne fuit pas entre fichiers).
    //    NE JAMAIS passer isolate:false pour gagner de la vitesse : ça rendrait les tests non fiables.
    pool: "threads",
  },
});
