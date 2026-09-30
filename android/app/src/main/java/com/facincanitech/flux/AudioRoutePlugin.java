package com.facincanitech.flux;

import android.content.Context;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AudioRoute")
public class AudioRoutePlugin extends Plugin {

    private MediaPlayer ringtonePlayer;

    private AudioManager audioManager() {
        return (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
    }

    @PluginMethod
    public void startCallAudio(PluginCall call) {
        AudioManager am = audioManager();
        if (am != null) {
            am.setMode(AudioManager.MODE_IN_COMMUNICATION);
            am.requestAudioFocus(null, AudioManager.STREAM_VOICE_CALL, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT);
        }
        call.resolve();
    }

    @PluginMethod
    public void stopCallAudio(PluginCall call) {
        AudioManager am = audioManager();
        if (am != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                am.clearCommunicationDevice();
            } else {
                am.setSpeakerphoneOn(false);
            }
            am.setMode(AudioManager.MODE_NORMAL);
            am.abandonAudioFocus(null);
        }
        call.resolve();
    }

    @PluginMethod
    public void setMediaAudioMode(PluginCall call) {
        AudioManager am = audioManager();
        if (am != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                am.clearCommunicationDevice();
            } else {
                am.setSpeakerphoneOn(false);
            }
            // Canais do Play sao salas de voz persistentes, nao ligacoes telefonicas.
            // MODE_NORMAL preserva a qualidade dos outros apps e do audio de midia.
            am.setMode(AudioManager.MODE_NORMAL);
            am.abandonAudioFocus(null);
        }
        call.resolve();
    }

    @PluginMethod
    public void setSpeakerphoneOn(PluginCall call) {
        boolean on = call.getBoolean("on", false);
        AudioManager am = audioManager();
        if (am != null) {
            am.setMode(AudioManager.MODE_IN_COMMUNICATION);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                int wantType = on ? AudioDeviceInfo.TYPE_BUILTIN_SPEAKER : AudioDeviceInfo.TYPE_BUILTIN_EARPIECE;
                AudioDeviceInfo target = null;
                for (AudioDeviceInfo d : am.getAvailableCommunicationDevices()) {
                    if (d.getType() == wantType) {
                        target = d;
                        break;
                    }
                }
                boolean ok = target != null && am.setCommunicationDevice(target);
                if (!ok) {
                    // API nova falhou (device nao disponivel/dispositivo recusou) - cai pra API antiga
                    am.setSpeakerphoneOn(on);
                }
            } else {
                am.setSpeakerphoneOn(on);
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void startRingtone(PluginCall call) {
        stopRingtoneInternal();
        try {
            Uri uri = RingtoneManager.getActualDefaultRingtoneUri(getContext(), RingtoneManager.TYPE_RINGTONE);
            if (uri == null) uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            ringtonePlayer = new MediaPlayer();
            ringtonePlayer.setAudioStreamType(AudioManager.STREAM_RING);
            ringtonePlayer.setDataSource(getContext(), uri);
            ringtonePlayer.setLooping(true);
            ringtonePlayer.prepare();
            ringtonePlayer.start();
        } catch (Exception e) {
            stopRingtoneInternal();
        }
        call.resolve();
    }

    @PluginMethod
    public void stopRingtone(PluginCall call) {
        stopRingtoneInternal();
        call.resolve();
    }

    private void stopRingtoneInternal() {
        if (ringtonePlayer != null) {
            try {
                ringtonePlayer.stop();
            } catch (Exception ignored) {
            }
            ringtonePlayer.release();
            ringtonePlayer = null;
        }
    }

    @Override
    protected void handleOnDestroy() {
        stopRingtoneInternal();
        super.handleOnDestroy();
    }
}
