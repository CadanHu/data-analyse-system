package com.cadanhu.datapulse;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import com.cadanhu.datapulse.PdfExportPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PdfExportPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
