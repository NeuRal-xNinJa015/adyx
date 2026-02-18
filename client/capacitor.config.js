/** @type {import('@capacitor/cli').CapacitorConfig} */
const config = {
    appId: 'com.adyx.messenger',
    appName: 'Adyx',
    webDir: 'dist',
    android: {
        buildOptions: {
            signingType: 'apksigner',
        },
    },
};

module.exports = config;
