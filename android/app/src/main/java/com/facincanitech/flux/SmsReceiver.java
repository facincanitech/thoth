package com.facincanitech.flux;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.AsyncTask;
import android.provider.Telephony;
import android.telephony.SmsMessage;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

// So faz alguma coisa se esse aparelho foi explicitamente ativado como celular-gateway
// (SmsGatewayPlugin.enable). Pra qualquer outro usuario do Thoth isso fica completamente inerte -
// nao tem custo nem risco nenhum ficar registrado no manifest.
public class SmsReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (!Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction())) return;

        SharedPreferences prefs = context.getSharedPreferences(SmsGatewayPlugin.PREFS, 0);
        if (!prefs.getBoolean(SmsGatewayPlugin.KEY_ENABLED, false)) return;
        String token = prefs.getString(SmsGatewayPlugin.KEY_TOKEN, "");
        String webhookUrl = prefs.getString(SmsGatewayPlugin.KEY_WEBHOOK_URL, "");
        if (token.isEmpty() || webhookUrl.isEmpty()) return;

        SmsMessage[] messages = Telephony.Sms.Intents.getMessagesFromIntent(intent);
        if (messages == null || messages.length == 0) return;

        StringBuilder body = new StringBuilder();
        String from = messages[0].getOriginatingAddress();
        for (SmsMessage part : messages) {
            if (part.getMessageBody() != null) body.append(part.getMessageBody());
        }

        new PostSmsTask(webhookUrl, token, from, body.toString()).execute();
    }

    private static class PostSmsTask extends AsyncTask<Void, Void, Void> {
        private final String webhookUrl;
        private final String token;
        private final String from;
        private final String text;

        PostSmsTask(String webhookUrl, String token, String from, String text) {
            this.webhookUrl = webhookUrl;
            this.token = token;
            this.from = from;
            this.text = text;
        }

        @Override
        protected Void doInBackground(Void... voids) {
            try {
                JSONObject payload = new JSONObject();
                payload.put("from", from);
                payload.put("text", text);

                URL url = new URL(webhookUrl);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setRequestProperty("Authorization", "Bearer " + token);
                conn.setDoOutput(true);
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(15000);
                try (OutputStream os = conn.getOutputStream()) {
                    os.write(payload.toString().getBytes(StandardCharsets.UTF_8));
                }
                conn.getResponseCode();
                conn.disconnect();
            } catch (Exception ignored) {
                // Sem rede/erro pontual - o app so tenta de novo no proximo SMS que chegar,
                // nao tem fila de retry (uso interno, nao critico pra escalar).
            }
            return null;
        }
    }
}
