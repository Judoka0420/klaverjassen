package hu.shareline.klaverjassen;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(UpdaterPlugin.class);   // self-update helper (see UpdaterPlugin.java)
        super.onCreate(savedInstanceState);
    }
}
