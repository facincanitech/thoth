package com.facincanitech.flux;

import android.app.Activity;
import android.content.Intent;
import android.content.IntentSender;
import android.os.Bundle;

import com.google.android.gms.auth.api.identity.GetPhoneNumberHintIntentRequest;
import com.google.android.gms.auth.api.identity.Identity;

public class PhoneHintActivity extends Activity {
    private static final int REQUEST_PHONE_HINT = 7012;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        if (state != null) return;

        GetPhoneNumberHintIntentRequest request = GetPhoneNumberHintIntentRequest.builder().build();
        Identity.getSignInClient(this).getPhoneNumberHintIntent(request)
            .addOnSuccessListener(result -> {
                try {
                    startIntentSenderForResult(result.getIntentSender(), REQUEST_PHONE_HINT, null, 0, 0, 0);
                } catch (IntentSender.SendIntentException error) {
                    finishCanceled();
                }
            })
            .addOnFailureListener(error -> finishCanceled());
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQUEST_PHONE_HINT) return;
        if (resultCode != RESULT_OK || data == null) {
            finishCanceled();
            return;
        }
        try {
            String phone = Identity.getSignInClient(this).getPhoneNumberFromIntent(data);
            Intent result = new Intent();
            result.putExtra("phone", phone);
            setResult(RESULT_OK, result);
        } catch (Exception error) {
            setResult(RESULT_CANCELED);
        }
        finish();
    }

    private void finishCanceled() {
        setResult(RESULT_CANCELED);
        finish();
    }
}
