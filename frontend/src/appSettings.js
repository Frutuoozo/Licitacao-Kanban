import { createContext, useContext } from "react";

// Configurações administrativas carregadas do backend (/api/settings) e compartilhadas pelo app.
export const DEFAULT_SETTINGS = {
  sessionTimeoutEnabled: true,
  sessionTimeoutMinutes: 30,
  confirmBeforeDelete: true,
  lockoutEnabled: true,
  lockoutAttempts: 5,
  lockoutMinutes: 15,
  passwordExpiryEnabled: false,
  passwordExpiryDays: 90,
};

export const AppSettingsContext = createContext({ settings: DEFAULT_SETTINGS, setSettings: () => {} });

export const useAppSettings = () => useContext(AppSettingsContext);
