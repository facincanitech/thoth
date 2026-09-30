package com.facincanitech.flux;

import android.Manifest;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

// So pra virar o "celular-gateway" do Thoth: esse celular especifico escuta os SMS que chegam
// nele de verdade (numero definitivo inserido) e repassa o conteudo pra nossa Edge Function
// sms-webhook, que confere o codigo e vincula o numero de quem pediu a verificacao. Desligado
// por padrao pra qualquer usuario normal - so ativa quem entrar manualmente nessa tela e
// colar o token que combina com o secret SMS_GATEWAY_TOKEN do Supabase.
@CapacitorPlugin(
    name = "SmsGateway",
    permissions = @Permission(alias = "sms", strings = { Manifest.permission.RECEIVE_SMS })
)
public class SmsGatewayPlugin extends Plugin {
    static final String PREFS = "sms_gateway_prefs";
    static final String KEY_ENABLED = "enabled";
    static final String KEY_TOKEN = "token";
    static final String KEY_WEBHOOK_URL = "webhook_url";

    @PluginMethod
    public void getStatus(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, 0);
        JSObject result = new JSObject();
        result.put("enabled", prefs.getBoolean(KEY_ENABLED, false));
        result.put("hasPermission", getPermissionState("sms") == com.getcapacitor.PermissionState.GRANTED);
        result.put("token", prefs.getString(KEY_TOKEN, ""));
        result.put("webhookUrl", prefs.getString(KEY_WEBHOOK_URL, ""));
        call.resolve(result);
    }

    @PluginMethod
    public void enable(PluginCall call) {
        String token = call.getString("token", "");
        String webhookUrl = call.getString("webhookUrl", "");
        if (token.isEmpty() || webhookUrl.isEmpty()) {
            call.reject("token e webhookUrl sao obrigatorios");
            return;
        }
        saveConfig(call);
        if (getPermissionState("sms") == com.getcapacitor.PermissionState.GRANTED) {
            setEnabled(true);
            call.resolve(statusObject());
        } else {
            requestPermissionForAlias("sms", call, "smsPermissionCallback");
        }
    }

    @PermissionCallback
    private void smsPermissionCallback(PluginCall call) {
        boolean granted = getPermissionState("sms") == com.getcapacitor.PermissionState.GRANTED;
        setEnabled(granted);
        JSObject result = statusObject();
        result.put("hasPermission", granted);
        call.resolve(result);
    }

    @PluginMethod
    public void disable(PluginCall call) {
        setEnabled(false);
        call.resolve(statusObject());
    }

    private void saveConfig(PluginCall call) {
        SharedPreferences.Editor editor = getContext().getSharedPreferences(PREFS, 0).edit();
        editor.putString(KEY_TOKEN, call.getString("token", ""));
        editor.putString(KEY_WEBHOOK_URL, call.getString("webhookUrl", ""));
        editor.apply();
    }

    private void setEnabled(boolean enabled) {
        getContext().getSharedPreferences(PREFS, 0).edit().putBoolean(KEY_ENABLED, enabled).apply();
        Intent serviceIntent = new Intent(getContext(), SmsGatewayService.class);
        if (enabled) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getContext().startForegroundService(serviceIntent);
            } else {
                getContext().startService(serviceIntent);
            }
        } else {
            getContext().stopService(serviceIntent);
        }
    }

    private JSObject statusObject() {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, 0);
        JSObject result = new JSObject();
        result.put("enabled", prefs.getBoolean(KEY_ENABLED, false));
        return result;
    }
}
