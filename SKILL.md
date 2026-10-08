---
name: saspay-integration
description: Intégrer SasPay (encaissement mobile money et carte, retraits vers bénéficiaires mobile money, wallet, webhooks) dans une application, un site ou un SaaS, quelle que soit la stack. Utiliser dès qu'on demande d'ajouter SasPay, d'encaisser en mobile money, de payer un bénéficiaire, de vérifier un paiement SasPay, ou de traiter un webhook SasPay (« sk_test », « sk_live », « checkout_url », « X-Webhook-Signature »).
---

# Intégration SasPay — toute stack

SasPay est une API REST unique. Sa spécification fait foi : `https://api.saspay.me/api/v1`, décrite par `/api-reference/openapi.json`. N'inventez aucun endpoint, champ, statut ou événement absent de cette spécification.

Documentation : `/llms.txt` à la racine du site de documentation.

---

## 1. Faits qui conditionnent la conception

1. **Clé API côté serveur uniquement.** `Authorization: Bearer sk_test_...` (sandbox) ou `sk_live_...` (production). Jamais dans le navigateur, une app mobile, les logs ou une réponse renvoyée au client.
2. **Montants en chaînes décimales** : `"2500.00"`, pas `2500`. Ne jamais passer un flottant.
3. **Vérifier avant de livrer.** Un délai, un retour de redirection ou un callback ne prouvent rien. Le statut réel vient de `GET /payments/{payment_id}/verify/` (ou d'un webhook vérifié), et seul `SUCCESS` autorise la livraison.
4. **Idempotence sur les routes qui déplacent de l'argent.** `Idempotency-Key` est optionnel côté API mais obligatoire en pratique sur `POST /payments/softpay/`, `POST /payouts/initialize/`, `POST /wallet-transfers/` et `POST /payments/{payment_id}/retry/`. Une clé par intention, réutilisée à l'identique pour chaque retry réseau. Même clé + même corps = réponse d'origine ; même clé + corps différent, ou appel encore en cours = `409`.
5. **Frais.** `fee_charge_mode` vaut `ADD_ON` (le payeur paie les frais en plus) ou `DEDUCTED` (prélevés sur le montant). Pour la comptabilité : `charged` = ce que le payeur débourse, `net_amount` = ce qui vous revient. Jamais `amount` seul.
6. **Retrait : IP whitelistée.** Un appel à `POST /payouts/initialize/` avec une clé API depuis une IP non whitelistée renvoie `403 ip_not_whitelisted`, quelle que soit la validité de la clé. Ajouter l'IP du serveur depuis le tableau de bord avant le premier appel.
7. **Retrait : pas de conversion automatique.** Une devise différente du pays (`currency` vs `country`) renvoie `422 currency_country_mismatch`. L'encaissement, lui, convertit.
8. **Webhooks : création et modification uniquement dans le tableau de bord.** Par API on peut seulement lister et lire (`/merchant-webhooks/`, `/merchant-webhook-subscriptions/`, `/webhook-logs/`). Le `signing_secret` n'est affiché qu'une fois, à la création ou à la rotation.
9. **Limite de débit.** 300 requêtes par minute et par compte (appels authentifiés). Un `429` impose d'espacer les appels ; ne pas boucler dessus.
10. **Pas de statut `CANCELLED` sur le flux de paiement** actuellement : traitez-le comme un état terminal non réussi, sans le supposer atteignable.

---

## 2. Ce que fait l'humain, ce que fait l'agent

**L'humain (tableau de bord `app.saspay.me`, section Développeur) :**
1. Créer le compte, vérifier l'email, compléter le KYC, créer le marchand.
2. Générer une clé `sk_test_...` pour développer, puis `sk_live_...` pour la production.
3. Whitelister l'IP du serveur si des retraits sont prévus.
4. Créer le webhook (URL publique, événements voulus) et copier le `signing_secret` immédiatement.

**L'agent, dans le code :** routes serveur, appels API, vérification de statut, traitement du webhook avec vérification de signature, configuration par variables d'environnement, et une commande de vérification de configuration.

Variables d'environnement à demander, sans jamais les écrire dans le dépôt :

```other
# Clé API SasPay (sk_test_... en développement)
SASPAY_API_KEY=

# Secret de signature du webhook (affiché une seule fois à la création)
SASPAY_WEBHOOK_SECRET=

# URL publique exacte de l'application (https://, sans / final)
APP_URL=
```

---

## 3. Choisir le bon flux d'encaissement

| Besoin | Route | Réponse à traiter |
|---|---|---|
| Pousser une demande sur le téléphone du client (MTN Bénin, etc.) | `POST /payments/softpay/` | `id`, `status: PENDING`, `checkout_url` |
| Rediriger le client vers une page de paiement hébergée | `POST /checkout-sessions/` | `id`, `slug`, `checkout_url` à ouvrir |

**Attention :** `checkout_url` peut être vide en softpay (push direct) et **non vide** sur Wave, Orange Money, Djamo ou carte. Si elle est non vide, il faut rediriger le client vers cette URL, sinon aucun paiement n'a lieu.

### Softpay

```bash
curl -X POST https://api.saspay.me/api/v1/payments/softpay/ \
  -H "Authorization: Bearer $SASPAY_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: <uuid généré pour cette intention>" \
  -d '{
    "amount": "2500.00",
    "currency": "XOF",
    "country": "BJ",
    "network": "mtn_bj",
    "description": "Abonnement mensuel",
    "customer": {"email": "client@example.com", "first_name": "Awa", "last_name": "Sossou", "phone": "+22997505050"}
  }'
```

Champs requis : `amount`, `currency`, `country`, `network`, `customer`. Optionnels : `description`, `fee_charge_mode`, `preferred_gateway`, `metadata`, `merchant`, et `otp` pour les réseaux qui exigent un code généré par le client avant le paiement (`otp_required` dans `GET /pricing/my-rates/`). Pour un réseau qui demande une confirmation après le push, utiliser `POST /payments/{payment_id}/confirm-otp/`.

### Checkout hébergé

```bash
curl -X POST https://api.saspay.me/api/v1/checkout-sessions/ \
  -H "Authorization: Bearer $SASPAY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": "5000.00",
    "currency": "XOF",
    "description": "Facture #1042",
    "customer_email": "client@example.com",
    "customer_name": "Awa Sossou",
    "return_url": "https://votre-site.com/merci"
  }'
```

Requis : `amount`, `currency`, `customer_email`, `customer_name`. Optionnels : `description`, `country`, `customer_phone`, `return_url`, `metadata`, `fee_charge_mode`, `expires_at`. Suivre le statut avec `GET /checkout-sessions/{id}/status/` ; annuler avec `POST /checkout-sessions/{id}/cancel/`.

`return_url` ramène le client sur votre site après un paiement réussi, mais pas après un échec : sur un échec, le client doit fermer l'onglet lui-même. Ne jamais se fier à la seule redirection pour livrer.

---

## 4. Vérifier et livrer

```bash
curl https://api.saspay.me/api/v1/payments/<payment_id>/verify/ \
  -H "Authorization: Bearer $SASPAY_API_KEY"
```

Réponse utile : `status` (`PENDING`, `SUCCESS`, `FAILED`), `net_amount`, `currency`.

- `SUCCESS` : livrer, une seule fois (contrôle d'unicité côté base, pas seulement en mémoire).
- `PENDING` : ne rien livrer. Revérifier plus tard ou attendre le webhook.
- `FAILED` : ne rien livrer. Proposer `POST /payments/{payment_id}/retry/` (sans créer de nouvelle transaction) ou un nouveau paiement.

Préférer le webhook `transaction.success` pour être notifié, en gardant la vérification active en secours.

---

## 5. Retraits

```bash
curl -X POST https://api.saspay.me/api/v1/payouts/initialize/ \
  -H "Authorization: Bearer $SASPAY_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: <uuid pour cette intention>" \
  -d '{ ... }'
```

Requis selon la spécification : `amount`, `currency`, `country`, `customer`, `method`, `recipient`. Optionnels : `merchant`, `description`, `metadata`, `fee_charge_mode`, `preferred_gateway`. Le format du numéro `recipient.msisdn` et les codes `method` valides par pays sont dans `/api-reference/reference/formats`. Vérifier ensuite avec `GET /payouts/{payout_id}/verify/`.

Un retry réseau sans `Idempotency-Key` envoie un second paiement au bénéficiaire. Ne jamais réessayer un retrait sans la même clé.

---

## 6. Webhooks

Chaque requête contient : `X-Webhook-Signature` (HMAC SHA-256 hexadécimal, minuscules), `X-Webhook-Timestamp` (secondes Unix), `X-Webhook-Event` (ex. `transaction.success`), et le corps JSON `{"event": "...", "data": {...}}`.

Vérification, dans cet ordre :
1. Rejeter si `X-Webhook-Timestamp` s'écarte de plus de 300 secondes de l'horloge du serveur.
2. Recalculer la signature sur le **corps brut reçu**, avec `f"{timestamp}.{body}"` comme message et `signing_secret` comme clé, puis comparer en temps constant.

```python
import hashlib, hmac, time

def webhook_is_valid(raw_body: bytes, signature: str, timestamp: str, secret: str) -> bool:
    if abs(time.time() - int(timestamp)) > 300:
        return False
    signed = f"{timestamp}.".encode() + raw_body
    expected = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)
```

Événements du catalogue : `transaction.created`, `transaction.success`, `transaction.failed`, `transaction.cancelled`, `settlement.requested`, `settlement.approved`, `settlement.success`, `settlement.failed`, `settlement.cancelled`, `wallet_transfer.requested`, `wallet_transfer.completed`, `wallet_transfer.rejected`, `webhook.test`. Le contenu de `data` des événements `settlement.*` n'est pas encore garanti : ne pas dépendre de sa forme exacte.

Répondre rapidement (2xx) puis traiter en tâche de fond ; rendre le traitement idempotent, car un événement peut être livré plusieurs fois.

---

## 7. Erreurs

Enveloppe de réponse :
- Succès : `{"success": true, "data": {...}, "code": 200}`
- Erreur métier : `{"success": false, "error": {"message": "...", "code": "insufficient_balance"}, "code": 422}`
- Erreur de validation : `{"champ": ["message"]}`, une entrée par champ.

Classer d'abord par code HTTP :

| Code | Traitement |
|---|---|
| `400` | Corriger la requête (champ manquant ou mal formé) |
| `401` | Clé absente, invalide ou expirée : ne pas réessayer |
| `403` | Compte suspendu, ressource non rattachée au compte, ou IP non whitelistée (`ip_not_whitelisted`) |
| `404` | Ressource introuvable |
| `409` | Conflit d'idempotence ou état : ne pas réexécuter sans vérifier |
| `410` | Lien ou session expiré |
| `422` | Impossible en l'état (ex. `insufficient_balance`, `currency_country_mismatch`, `prepayment_otp_missing`) |
| `429` | Attendre avant de réessayer, espacer les appels |

---

## 8. Ce qu'il ne faut pas faire

- Mettre la clé API dans le navigateur, une app mobile, un dépôt Git ou un log.
- Livrer sur la seule base d'une redirection, d'un délai ou d'un statut `PENDING`.
- Utiliser un montant flottant ou un montant sans décimales pour un paiement en devise décimale.
- Réessayer un débit ou un retrait sans `Idempotency-Key`.
- Inventer une route. Ne pas utiliser `POST /payments/softpay/initialize/` ni `POST /settlements/` : elles sont citées dans certaines pages mais absentes de la spécification OpenAPI. Utiliser `POST /payments/softpay/` et `POST /payouts/initialize/`.
- Recalculer la signature d'un webhook sur un corps re-sérialisé : toujours le corps brut.
- Tester avec une clé `sk_live_...` : utiliser `sk_test_...`.

---

## 9. Tester

1. Clé `sk_test_...` uniquement pendant le développement.
2. Vérifier la configuration : `GET /countries/` (public), `GET /pricing/my-rates/` (authentifié) pour les réseaux et les exigences OTP.
3. Un paiement softpay et un checkout de test, puis `verify` jusqu'à un statut final.
4. Déclencher l'événement `webhook.test` depuis le tableau de bord pour valider la vérification de signature.
5. Passer en `sk_live_...` seulement après ces étapes, avec un petit montant pour le premier paiement réel.

Si un test n'a pas pu être exécuté, le marquer comme non vérifié dans la documentation de l'intégration.

---

## 10. Définition de terminé

- La clé est lue depuis l'environnement, jamais écrite dans le dépôt.
- Chaque route qui déplace de l'argent envoie une `Idempotency-Key`.
- La livraison n'a lieu que sur `SUCCESS`, une seule fois.
- Les webhooks vérifient l'âge et la signature sur le corps brut, et le traitement est idempotent.
- Les erreurs `401`, `403`, `422` et `429` ont un comportement défini.
- Les montants sont des chaînes décimales, et `charged` / `net_amount` sont utilisés pour la comptabilité.
