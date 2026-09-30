package com.facincanitech.flux;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;

// Servico em primeiro plano so pra manter o processo do Thoth vivo neste celular especifico
// quando ele foi ativado como "celular-gateway" de SMS (ver SmsGatewayPlugin/SmsReceiver) - sem
// isso o Android (principalmente Samsung/Xiaomi) pode matar o app depois de fechado e o
// BroadcastReceiver do SMS para de disparar ate a pessoa abrir o app de novo na mao.
public class SmsGatewayService extends Service {
    private static final String CHANNEL_ID = "sms_gateway_v1";
    private static final int NOTIF_ID = 9101;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startForeground(NOTIF_ID, buildNotification());
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private Notification buildNotification() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = getSystemService(NotificationManager.class);
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "Celular-servidor de SMS", NotificationManager.IMPORTANCE_MIN
            );
            channel.setDescription("Mantém o Thoth escutando SMS de verificação neste aparelho.");
            if (manager != null) manager.createNotificationChannel(channel);
        }

        Intent openApp = new Intent(this, MainActivity.class);
        openApp.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
            ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            : PendingIntent.FLAG_UPDATE_CURRENT;
        PendingIntent pendingIntent = PendingIntent.getActivity(this, 0, openApp, flags);

        return new Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("Thoth - celular-servidor de SMS")
            .setContentText("Escutando SMS de verificação neste aparelho.")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build();
    }
}
