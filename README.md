# Clair — budget 50/30/20

Une petite application de budget personnel en HTML, CSS et JavaScript. Elle permet de suivre les besoins, les envies et l’épargne par mois. Supabase gère les comptes et la sauvegarde des données. L’application ne se connecte pas aux banques.

## Fichiers

- `index.html` : les pages de connexion et de l’application.
- `css/style.css` : l’interface responsive.
- `js/app.js` : la logique du site et la connexion Supabase.
- `database_schema.sql` : les tables et règles de confidentialité Supabase.
- `assets/icon.svg` : l’icône du site.

## Relier le site à Supabase

1. Dans le projet Supabase, ouvre **SQL Editor → New query**.
2. Copie tout le contenu de `database_schema.sql`, colle-le dans l’éditeur et clique **Run**.
3. Dans Supabase, récupère l’URL du projet et sa clé **Publishable** (`sb_publishable_…`) ou l’ancienne clé publique **anon**. Ne prends jamais la clé `secret` ou `service_role`.
4. Ouvre `js/app.js`. En haut du fichier, remplace `COLLE_ICI_URL_SUPABASE` et `COLLE_ICI_CLE_PUBLIQUE_SUPABASE` par les valeurs de ton projet.

Pour un projet Supabase déjà configuré, exécute aussi `supabase_migration_income_entries.sql` dans **SQL Editor → New query** afin d'activer l'historique des virements et entrées d'argent. Pour un nouveau projet, `database_schema.sql` inclut déjà cette table.

Pour un projet déjà configuré, exécute également `supabase_migration_profile_avatar.sql` dans **SQL Editor → New query**. Cette migration ajoute les champs du profil, l’étape de personnalisation à la première connexion et le stockage privé des photos. Si tu avais déjà exécuté une ancienne version de cette migration, relance ce fichier mis à jour. Pour un nouveau projet, `database_schema.sql` inclut déjà ces éléments.

L’URL et la clé publique sont visibles dans le code du site. C’est normal pour une application statique : les politiques RLS du fichier SQL limitent chaque compte à ses propres données. Une clé secrète ne doit jamais être publiée.

Si l’ancien schéma SQL de la version précédente a déjà été exécuté dans ce projet Supabase, ne relance pas ce nouveau schéma tel quel : les tables homonymes ne seront pas remplacées. Il faudra supprimer ou migrer ces anciennes tables avant de continuer.

## Ouvrir le site sur ton ordinateur

Dans le dossier du projet, lance un petit serveur local, par exemple avec Python :

```bash
python3 -m http.server 8000
```

Puis ouvre `http://localhost:8000` dans ton navigateur. Tu peux aussi utiliser une extension de serveur local dans ton éditeur.

## Publier avec GitHub Pages

1. Crée un dépôt GitHub pour ce projet et ajoute les fichiers du dossier (pas de clés secrètes).
2. Dans le dépôt, ouvre **Settings → Pages**.
3. Choisis **Deploy from a branch**, sélectionne la branche principale et le dossier `/ (root)`, puis enregistre.
4. GitHub affichera l’adresse publique du site, généralement `https://TON-NOM.github.io/NOM-DU-DEPOT/`.
5. Dans Supabase, ouvre les réglages d’authentification puis la configuration des URL. Mets cette adresse comme **Site URL** et ajoute-la à la liste **Redirect URLs**. Pour la confirmation d’e-mail, utilise exactement l’adresse affichée par GitHub Pages.

## Utilisation

Crée un compte avec ton adresse e-mail et un mot de passe. Juste après la création, l’application affiche un écran blanc dédié pour choisir le nom et la photo de profil, puis ouvre le budget. Si la confirmation d’adresse est activée dans Supabase, confirme le message reçu puis connecte-toi pour terminer ce profil. Renseigne ton revenu dans **Réglages**, puis ajoute tes dépenses ou les sommes mises de côté.

Les enveloppes sont calculées à partir du revenu mensuel de base plus les entrées ponctuelles du mois : 50 % pour les besoins, 30 % pour les envies et 20 % pour l’épargne. Les opérations sont attribuées au mois de leur date. Si une enveloppe dépasse son objectif, le dépassement est réparti proportionnellement entre les montants encore disponibles dans les autres enveloppes.

## Activer la connexion Google

Le bouton Google utilise Supabase Auth : une première connexion crée le compte, les suivantes ouvrent la session. Le fournisseur doit être configuré avant utilisation.

1. Dans Supabase, ouvre **Authentication → URL Configuration** et ajoute l’adresse locale du site (par exemple `http://localhost:8000/`) dans **Redirect URLs**. Après publication, ajoute aussi l’adresse GitHub Pages exacte, avec le chemin du dépôt si nécessaire.
2. Dans **Authentication → Providers**, active Google. Supabase affiche l’URL de rappel OAuth, généralement `https://<référence-du-projet>.supabase.co/auth/v1/callback`.
3. Pour Google, crée un client OAuth de type **Web application** dans Google Cloud. Ajoute l’adresse du site dans les origines JavaScript autorisées et l’URL de rappel Supabase dans les URI de redirection autorisés. Copie l’identifiant et le secret du client dans les champs du fournisseur Google dans Supabase.
4. Enregistre les réglages dans Supabase. Les identifiants OAuth restent dans Supabase : ne les ajoute pas à `js/app.js` ni à GitHub.

La redirection après connexion revient à l’adresse de la page du site. Pour le site publié, cette adresse doit également être autorisée dans la liste **Redirect URLs** de Supabase.

La photo de profil est enregistrée dans un bucket privé `avatars`. Les règles de stockage fournies par le schéma limitent l’accès aux fichiers de chaque compte.
