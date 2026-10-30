import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.iericris.fibulaonline',
  appName: 'Fíbula Online',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
