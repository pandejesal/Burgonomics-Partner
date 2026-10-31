package com.burgonomics.partner;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.google.firebase.FirebaseApp;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Initialize Firebase BEFORE Capacitor loads plugins
        // This must happen before super.onCreate() so Firebase is ready when plugins initialize
        FirebaseApp.initializeApp(this);
        super.onCreate(savedInstanceState);
    }
}