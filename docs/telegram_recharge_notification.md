# Telegram notification for nuove tessere

La sostituzione e stata fatta nel punto esatto:

- `app/services/whatsapp_bot.py`, funzione `_handle_order_notes(...)`
- prima: `send_admin_sms_notification(sms_message)`
- adesso: `send_telegram_message(notification_message)`

Il contenuto del messaggio inviato all'admin resta identico:

```text
Nuovo ordine tessere: {association_name}, {requested_cards} tessere, richiedente {wa_from}.
```

## Env richieste

```env
TG_BOT_TOKEN=123456:telegram-bot-token
TG_CHAT_ID=-1001234567890
```

## Payload manuale di esempio

Il flusso e conversazionale, quindi il test manuale minimo sono 4 chiamate in sequenza verso `POST /api/whatsapp/bot`.

```powershell
$payloads = @(
  @{ from = "whatsapp:+393331112233"; body = "ordino tessere"; profile_name = "Mario Rossi" },
  @{ from = "whatsapp:+393331112233"; body = "associazione-demo"; profile_name = "Mario Rossi" },
  @{ from = "whatsapp:+393331112233"; body = "120"; profile_name = "Mario Rossi" },
  @{ from = "whatsapp:+393331112233"; body = "no"; profile_name = "Mario Rossi" }
)

foreach ($payload in $payloads) {
  Invoke-RestMethod -Method POST `
    -Uri "http://localhost:8000/api/whatsapp/bot" `
    -ContentType "application/json" `
    -Body ($payload | ConvertTo-Json -Compress)
}
```

Esito atteso:

- risposta API finale: `Richiesta registrata: 120 tessere per associazione-demo...`
- nuovo record in `recharge_requests`
- messaggio Telegram nel `TG_CHAT_ID` configurato con lo stesso testo che prima andava via SMS

## Note errore

Se Telegram fallisce, il bot continua a registrare la richiesta e logga errori espliciti:

- `telegram_notification_request_failed`
- `telegram_notification_http_failed`
- `telegram_notification_invalid_json`
- `telegram_notification_api_failed`
- `whatsapp_recharge_request_admin_telegram_failed`
