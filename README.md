# Ogust MCP

Serveur MCP local pour l’API Ogust V2. Il couvre les 62 objets de la documentation avec des outils de recherche, de lecture, de création, de mise à jour et de suppression. Les opérations disponibles pour chaque objet dépendent de l’API et des droits du compte Ogust.

## Installation

Prérequis : Node.js 22.9 ou ultérieur et deux clés API depuis la fiche société du compte Ogust.

```sh
git clone https://github.com/hugofrely/ogust-mcp.git
cd ogust-mcp
npm ci
npm run build
cp .env.example .env
chmod 600 .env
```

Renseigner `OGUST_PUBLIC_KEY` et `OGUST_PRIVATE_KEY` dans `.env`. Le mode `OGUST_ACCESS=read` expose les outils de consultation. Pour autoriser la création, la modification et la suppression, définir `OGUST_ACCESS=full` dans ce fichier.

### Brancher un client MCP

Le serveur parle MCP sur **stdio**. Voici une configuration pour un client qui accepte `mcpServers`. Remplacer les deux chemins par les chemins absolus du dépôt cloné. Si le client ne trouve pas Node.js, remplacer `node` par le chemin renvoyé par `command -v node`.

```json
{
  "mcpServers": {
    "ogust": {
      "command": "node",
      "args": [
        "--env-file-if-exists=/chemin/vers/ogust-mcp/.env",
        "/chemin/vers/ogust-mcp/dist/index.js"
      ]
    }
  }
}
```

Avec la CLI Codex, depuis le dépôt :

```sh
codex mcp add ogust -- "$(command -v node)" "--env-file-if-exists=$PWD/.env" "$PWD/dist/index.js"
```

Redémarrer le client, puis appeler `ogust_verify_auth` pour vérifier les clés.

## Outils

| Outil | Entrée et comportement |
| --- | --- |
| `ogust_catalog` | Sans argument, liste les objets. Avec `resource`, affiche les champs, les champs marqués requis à la création et les méthodes routées par le MCP. |
| `ogust_verify_auth` | Vérifie l’obtention d’un jeton. Retourne uniquement un indicateur d’authentification. |
| `ogust_search` | `resource`, `filters`, `pagenum` (1 par défaut) et `nbperpage` (20 par défaut). Conserve les métadonnées de pagination Ogust. |
| `ogust_get` | `resource` et `params` contenant l’identifiant ou la clé composite de l’objet. |
| `ogust_get_list` | `key` au format `objet.champ`. Renvoie les valeurs autorisées pour ce champ. |
| `ogust_set` | En mode `full`, crée ou modifie l’objet. Fournir `resource` et les champs Ogust dans `params`. |
| `ogust_remove` | En mode `full`, supprime l’objet identifié dans `params`. |

`list` passe par `ogust_get_list`. `historyLog` et `communication` sont accessibles en consultation. Pour les autres objets, Ogust décide quelles opérations sont acceptées. L’activation et la configuration des webhooks se font dans Ogust.

### Exemples de paramètres

- Rechercher les clients dont le nom commence par Dup avec `ogust_search` et `{"resource":"customer","filters":{"last_name":"Dup%"},"nbperpage":10}`.
- Consulter la fiche du client 123456 avec `ogust_get` et `{"resource":"customer","params":{"id_customer":"123456"}}`.
- Rechercher les factures du client 123456 avec `ogust_search` et `{"resource":"invoice","filters":{"id_customer":"123456"}}`.
- Récupérer les moyens de paiement autorisés avec `ogust_get_list` et `{"key":"customer.method_of_payment"}`.
- Mettre à jour le commentaire d’une fiche avec `ogust_set` et `{"resource":"customer","params":{"id_customer":"123456","comment":"À rappeler"}}`.

Les filtres avancés Ogust comme `@in|A|B` passent tels quels. Pour les champs imbriqués, passer des objets ou tableaux JSON. Le serveur les encode au format de formulaire PHP. Les valeurs `null` sont omises. Pour les grands identifiants, préférer des chaînes de caractères.

## Authentification et tests

Les clés sont lues depuis l’environnement du processus. Le serveur signe `getToken` en HMAC-SHA1, garde le jeton en mémoire et le renouvelle avant son expiration. Si Ogust rejette un jeton pendant une lecture, le serveur renouvelle le jeton et rejoue la lecture une seule fois. Une écriture ou une suppression est envoyée une seule fois par appel MCP.

`.env` est exclu du dépôt Git. Les outils en mode `full` utilisent les droits associés aux clés configurées. Restreindre l’accès à ces clés et vérifier la cible avant de lancer une suppression.

```sh
npm test
```

Les tests lancent le serveur via stdio et simulent les réponses Ogust pour vérifier la signature, le cache, le renouvellement du jeton, la pagination et le routage des mutations.

[Documentation de l’API Ogust V2](https://login.ogust.app/api/v2/documentation.php)
