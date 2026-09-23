package com.facincanitech.flux;

import android.Manifest;
import android.content.ActivityNotFoundException;
import android.content.Intent;
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

import java.util.LinkedHashMap;
import java.util.Map;

@CapacitorPlugin(
    name = "DeviceContacts",
    permissions = @Permission(alias = "contacts", strings = { Manifest.permission.READ_CONTACTS })
)
public class DeviceContactsPlugin extends Plugin {
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

    private String permissionLabel(PermissionState state) {
        if (state == PermissionState.GRANTED) return "granted";
        if (state == PermissionState.DENIED) return "denied";
        if (state == PermissionState.PROMPT_WITH_RATIONALE) return "prompt-with-rationale";
        return "prompt";
    }
}
