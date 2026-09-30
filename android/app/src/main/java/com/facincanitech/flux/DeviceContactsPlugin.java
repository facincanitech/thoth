package com.facincanitech.flux;

import android.Manifest;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.app.Activity;
import android.net.Uri;
import android.provider.ContactsContract;
import android.provider.Settings;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.getcapacitor.annotation.ActivityCallback;
import androidx.activity.result.ActivityResult;

import java.util.LinkedHashMap;
import java.util.Map;

@CapacitorPlugin(
    name = "DeviceContacts",
    permissions = {
        @Permission(alias = "contacts", strings = { Manifest.permission.READ_CONTACTS }),
        @Permission(alias = "sendSms", strings = { Manifest.permission.SEND_SMS }),
        @Permission(alias = "readPhoneState", strings = { Manifest.permission.READ_PHONE_STATE })
    }
)
public class DeviceContactsPlugin extends Plugin {
    @PluginMethod
    public void selectOwnPhoneNumber(PluginCall call) {
        Intent intent = new Intent(getContext(), PhoneHintActivity.class);
        startActivityForResult(call, intent, "phoneHintResult");
    }

    @ActivityCallback
    private void phoneHintResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null) {
            JSObject response = new JSObject();
            response.put("phone", "");
            call.resolve(response);
            return;
        }
        JSObject response = new JSObject();
        response.put("phone", data.getStringExtra("phone"));
        call.resolve(response);
    }

    private static class ContactRow {
        final String id;
        String name;
        final JSArray phones = new JSArray();
        final JSArray emails = new JSArray();

        ContactRow(String id, String name) {
            this.id = id;
            this.name = name;
        }

        JSObject toJson() {
            JSObject result = new JSObject();
            result.put("id", id);
            result.put("name", name == null || name.trim().isEmpty() ? "Contato" : name);
            result.put("phones", phones);
            result.put("emails", emails);
            return result;
        }
    }

    @PluginMethod
    public void permissionStatus(PluginCall call) {
        JSObject result = new JSObject();
        result.put("state", permissionLabel(getPermissionState("contacts")));
        call.resolve(result);
    }

    @PluginMethod
    public void requestAccess(PluginCall call) {
        requestPermissionForAlias("contacts", call, "contactsPermissionCallback");
    }

    @PermissionCallback
    private void contactsPermissionCallback(PluginCall call) {
        JSObject result = new JSObject();
        result.put("state", permissionLabel(getPermissionState("contacts")));
        call.resolve(result);
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        intent.setData(Uri.parse("package:" + getContext().getPackageName()));
        getActivity().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void getContacts(PluginCall call) {
        if (getPermissionState("contacts") != PermissionState.GRANTED) {
            call.reject("contacts permission not granted");
            return;
        }

        Map<String, ContactRow> contacts = new LinkedHashMap<>();
        try (android.database.Cursor phones = getContext().getContentResolver().query(
            ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
            new String[] {
                ContactsContract.CommonDataKinds.Phone.CONTACT_ID,
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                ContactsContract.CommonDataKinds.Phone.NUMBER
            }, null, null, ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " COLLATE NOCASE ASC"
        )) {
            if (phones != null) while (phones.moveToNext()) {
                String id = phones.getString(0);
                ContactRow row = contacts.get(id);
                if (row == null) {
                    row = new ContactRow(id, phones.getString(1));
                    contacts.put(id, row);
                }
                String phone = phones.getString(2);
                if (phone != null && !phone.trim().isEmpty()) row.phones.put(phone.trim());
            }
        }

        try (android.database.Cursor emails = getContext().getContentResolver().query(
            ContactsContract.CommonDataKinds.Email.CONTENT_URI,
            new String[] {
                ContactsContract.CommonDataKinds.Email.CONTACT_ID,
                ContactsContract.CommonDataKinds.Email.DISPLAY_NAME,
                ContactsContract.CommonDataKinds.Email.ADDRESS
            }, null, null, ContactsContract.CommonDataKinds.Email.DISPLAY_NAME + " COLLATE NOCASE ASC"
        )) {
            if (emails != null) while (emails.moveToNext()) {
                String id = emails.getString(0);
                ContactRow row = contacts.get(id);
                if (row == null) {
                    row = new ContactRow(id, emails.getString(1));
                    contacts.put(id, row);
                }
                String email = emails.getString(2);
                if (email != null && !email.trim().isEmpty()) row.emails.put(email.trim().toLowerCase());
            }
        }

        JSArray list = new JSArray();
        for (ContactRow row : contacts.values()) list.put(row.toJson());
        JSObject result = new JSObject();
        result.put("contacts", list);
        call.resolve(result);
    }

    @PluginMethod
    public void shareInvite(PluginCall call) {
        String phone = call.getString("phone", "").replaceAll("[^0-9]", "");
        if (!phone.isEmpty()) {
            String directText = call.getString("text", "Conheca o Thoth Messenger: https://facincanitech.github.io/thoth/");
            // O esquema nativo abre a conversa do numero. O wa.me pode ser interpretado por
            // algumas versoes do WhatsApp como compartilhamento e cair na tela "Enviar para".
            Uri inviteUri = Uri.parse("whatsapp://send?phone=" + phone + "&text=" + Uri.encode(directText));
            Intent direct = new Intent(Intent.ACTION_VIEW, inviteUri);
            direct.setPackage("com.whatsapp");
            try {
                getActivity().startActivity(direct);
                call.resolve();
                return;
            } catch (ActivityNotFoundException missingWhatsApp) {
                direct.setPackage("com.whatsapp.w4b");
                try {
                    getActivity().startActivity(direct);
                    call.resolve();
                    return;
                } catch (ActivityNotFoundException missingWhatsAppBusiness) {
                    direct.setPackage(null);
                    try {
                        getActivity().startActivity(direct);
                        call.resolve();
                        return;
                    } catch (ActivityNotFoundException ignored) {
                        // Sem WhatsApp ou navegador compativel: usa o compartilhamento abaixo.
                    }
                }
            }
        }

        String text = call.getString("text", "Conheça o Thoth Messenger: https://facincanitech.github.io/thoth/");
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType("text/plain");
        send.putExtra(Intent.EXTRA_TEXT, text);
        send.setPackage("com.whatsapp");
        try {
            getActivity().startActivity(send);
        } catch (ActivityNotFoundException missingWhatsApp) {
            send.setPackage(null);
            getActivity().startActivity(Intent.createChooser(send, "Convidar para o Thoth"));
        }
        call.resolve();
    }

    // Manda o SMS de verificacao sozinho, sem abrir o app de Mensagens - so pede SEND_SMS na
    // hora que a pessoa usa esse recurso especifico (nunca no startup).
    @PluginMethod
    public void sendVerificationSms(PluginCall call) {
        if (getPermissionState("sendSms") != PermissionState.GRANTED) {
            requestPermissionForAlias("sendSms", call, "sendSmsPermissionCallback");
            return;
        }
        doSendVerificationSms(call);
    }

    @PermissionCallback
    private void sendSmsPermissionCallback(PluginCall call) {
        if (getPermissionState("sendSms") != PermissionState.GRANTED) {
            call.reject("permissao negada");
            return;
        }
        doSendVerificationSms(call);
    }

    private void doSendVerificationSms(PluginCall call) {
        String to = call.getString("to", "");
        String text = call.getString("text", "");
        Integer subscriptionId = call.getInt("subscriptionId");
        if (to.isEmpty() || text.isEmpty()) {
            call.reject("to e text sao obrigatorios");
            return;
        }
        try {
            android.telephony.SmsManager smsManager = (subscriptionId != null && subscriptionId >= 0)
                ? android.telephony.SmsManager.getSmsManagerForSubscriptionId(subscriptionId)
                : android.telephony.SmsManager.getDefault();
            java.util.ArrayList<String> parts = smsManager.divideMessage(text);
            smsManager.sendMultipartTextMessage(to, null, parts, null, null);
            call.resolve();
        } catch (Exception error) {
            call.reject("falha ao enviar sms: " + error.getMessage());
        }
    }

    // Celular com 2 chips nao tem como adivinhar sozinho qual numero a pessoa quer confirmar -
    // o Android manda pelo chip "padrao" de SMS do sistema, que pode nao ser o mesmo numero que
    // esta sendo vinculado. Lista os chips ativos (sem o numero em si, que a maioria das
    // operadoras/Android recentes bloqueia ler) pra pessoa escolher por qual enviar.
    @PluginMethod
    public void getSimOptions(PluginCall call) {
        if (getPermissionState("readPhoneState") != PermissionState.GRANTED) {
            requestPermissionForAlias("readPhoneState", call, "readPhoneStatePermissionCallback");
            return;
        }
        doGetSimOptions(call);
    }

    @PermissionCallback
    private void readPhoneStatePermissionCallback(PluginCall call) {
        if (getPermissionState("readPhoneState") != PermissionState.GRANTED) {
            call.reject("permissao negada");
            return;
        }
        doGetSimOptions(call);
    }

    private void doGetSimOptions(PluginCall call) {
        JSArray sims = new JSArray();
        try {
            android.telephony.SubscriptionManager subscriptionManager =
                (android.telephony.SubscriptionManager) getContext().getSystemService(android.content.Context.TELEPHONY_SUBSCRIPTION_SERVICE);
            java.util.List<android.telephony.SubscriptionInfo> list = subscriptionManager != null
                ? subscriptionManager.getActiveSubscriptionInfoList() : null;
            if (list != null) {
                for (android.telephony.SubscriptionInfo info : list) {
                    JSObject sim = new JSObject();
                    sim.put("subscriptionId", info.getSubscriptionId());
                    sim.put("simSlot", info.getSimSlotIndex() + 1);
                    CharSequence label = info.getDisplayName();
                    sim.put("label", label != null ? label.toString() : ("Chip " + (info.getSimSlotIndex() + 1)));
                    sims.put(sim);
                }
            }
        } catch (SecurityException ignored) {
            // sem permissao de verdade (raro chegar aqui, ja checamos antes) - devolve lista vazia
        }
        JSObject result = new JSObject();
        result.put("sims", sims);
        call.resolve(result);
    }

    private String permissionLabel(PermissionState state) {
        if (state == PermissionState.GRANTED) return "granted";
        if (state == PermissionState.DENIED) return "denied";
        if (state == PermissionState.PROMPT_WITH_RATIONALE) return "prompt-with-rationale";
        return "prompt";
    }
}
