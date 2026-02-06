"use client";

import { withInteractable } from "@tambo-ai/react";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";

const settingsSchema = z.object({
  name: z.string(),
  email: z.string().email(),
  notifications: z.object({
    email: z.boolean(),
    push: z.boolean(),
    sms: z.boolean(),
  }),
  theme: z.enum(["light", "dark", "system"]),
  language: z.enum(["en", "es", "fr", "de"]),
  privacy: z.object({
    shareAnalytics: z.boolean(),
    personalizationEnabled: z.boolean(),
  }),
});

type SettingsProps = z.infer<typeof settingsSchema>;

function SettingsPanelBase(props: SettingsProps) {
  const [draftSettings, setDraftSettings] = useState<SettingsProps | null>(null);
  const [emailError, setEmailError] = useState<string>("");
  const [updatedFields, setUpdatedFields] = useState<Set<string>>(new Set());
  const clearUpdatedFieldsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const settings = draftSettings ?? props;

  useEffect(() => {
    return () => {
      if (clearUpdatedFieldsTimeoutRef.current != null) {
        clearTimeout(clearUpdatedFieldsTimeoutRef.current);
      }
    };
  }, []);

  const markUpdatedFields = (fields: string[]) => {
    setUpdatedFields(new Set(fields));
    if (clearUpdatedFieldsTimeoutRef.current != null) {
      clearTimeout(clearUpdatedFieldsTimeoutRef.current);
      clearUpdatedFieldsTimeoutRef.current = null;
    }
    clearUpdatedFieldsTimeoutRef.current = setTimeout(() => {
      setUpdatedFields(new Set());
      clearUpdatedFieldsTimeoutRef.current = null;
    }, 1000);
  };

  const handleChange = (updates: Partial<SettingsProps>, fields: string[]) => {
    setDraftSettings((prev) => ({ ...(prev ?? props), ...updates }));
    if (fields.length > 0) {
      markUpdatedFields(fields);
    }

    // Validate email if it's being updated
    if ("email" in updates) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(updates.email as string)) {
        setEmailError("Please enter a valid email address");
      } else {
        setEmailError("");
      }
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 max-w-2xl">
      <h2 className="text-2xl font-semibold text-gray-900 mb-6">Settings</h2>

      {/* Personal Information */}
      <div className="space-y-6">
        <div className="border-b border-gray-200 pb-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Personal Information
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name
              </label>
              <input
                type="text"
                value={settings.name}
                onChange={(e) => handleChange({ name: e.target.value }, ["name"])}
                className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  updatedFields.has("name") ? "animate-pulse" : ""
                }`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                value={settings.email}
                onChange={(e) =>
                  handleChange({ email: e.target.value }, ["email"])
                }
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  emailError ? "border-red-500" : "border-gray-300"
                } ${updatedFields.has("email") ? "animate-pulse" : ""}`}
              />
              {emailError && (
                <p className="mt-1 text-sm text-red-600">{emailError}</p>
              )}
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div className="border-b border-gray-200 pb-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Notifications
          </h3>
          <div className="space-y-3">
            <label
              className={`flex items-center ${
                updatedFields.has("notifications.email") ? "animate-pulse" : ""
              }`}
            >
              <input
                type="checkbox"
                checked={settings.notifications.email}
                onChange={(e) =>
                  handleChange({
                    notifications: {
                      ...settings.notifications,
                      email: e.target.checked,
                    },
                  }, ["notifications.email"])
                }
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-700">
                Email notifications
              </span>
            </label>
            <label
              className={`flex items-center ${
                updatedFields.has("notifications.push") ? "animate-pulse" : ""
              }`}
            >
              <input
                type="checkbox"
                checked={settings.notifications.push}
                onChange={(e) =>
                  handleChange({
                    notifications: {
                      ...settings.notifications,
                      push: e.target.checked,
                    },
                  }, ["notifications.push"])
                }
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-700">
                Push notifications
              </span>
            </label>
            <label
              className={`flex items-center ${
                updatedFields.has("notifications.sms") ? "animate-pulse" : ""
              }`}
            >
              <input
                type="checkbox"
                checked={settings.notifications.sms}
                onChange={(e) =>
                  handleChange({
                    notifications: {
                      ...settings.notifications,
                      sms: e.target.checked,
                    },
                  }, ["notifications.sms"])
                }
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-700">
                SMS notifications
              </span>
            </label>
          </div>
        </div>

        {/* Appearance */}
        <div className="border-b border-gray-200 pb-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Appearance</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Theme
              </label>
              <select
                value={settings.theme}
                onChange={(e) =>
                  handleChange({
                    theme: e.target.value as "light" | "dark" | "system",
                  }, ["theme"])
                }
                className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  updatedFields.has("theme") ? "animate-pulse" : ""
                }`}
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="system">System</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Language
              </label>
              <select
                value={settings.language}
                onChange={(e) =>
                  handleChange({
                    language: e.target.value as "en" | "es" | "fr" | "de",
                  }, ["language"])
                }
                className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  updatedFields.has("language") ? "animate-pulse" : ""
                }`}
              >
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
                <option value="de">German</option>
              </select>
            </div>
          </div>
        </div>

        {/* Privacy */}
        <div>
          <h3 className="text-lg font-medium text-gray-900 mb-4">Privacy</h3>
          <div className="space-y-3">
            <label
              className={`flex items-center ${
                updatedFields.has("privacy.shareAnalytics")
                  ? "animate-pulse"
                  : ""
              }`}
            >
              <input
                type="checkbox"
                checked={settings.privacy.shareAnalytics}
                onChange={(e) =>
                  handleChange({
                    privacy: {
                      ...settings.privacy,
                      shareAnalytics: e.target.checked,
                    },
                  }, ["privacy.shareAnalytics"])
                }
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-700">
                Share usage analytics
              </span>
            </label>
            <label
              className={`flex items-center ${
                updatedFields.has("privacy.personalizationEnabled")
                  ? "animate-pulse"
                  : ""
              }`}
            >
              <input
                type="checkbox"
                checked={settings.privacy.personalizationEnabled}
                onChange={(e) =>
                  handleChange({
                    privacy: {
                      ...settings.privacy,
                      personalizationEnabled: e.target.checked,
                    },
                  }, ["privacy.personalizationEnabled"])
                }
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-700">
                Enable personalization
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* Current Settings Display */}
      <div className="mt-8 p-4 bg-gray-50 rounded-md">
        <h4 className="text-sm font-medium text-gray-700 mb-2">
          Current Settings (JSON)
        </h4>
        <pre className="text-xs text-gray-600 overflow-auto">
          {JSON.stringify(settings, null, 2)}
        </pre>
      </div>
    </div>
  );
}

// Create the interactable component
const InteractableSettingsPanel = withInteractable(SettingsPanelBase, {
  componentName: "SettingsForm",
  description:
    "User settings form with personal info, notifications, and preferences",
  propsSchema: settingsSchema,
});

// Export a wrapper that provides default props and handles state
export function SettingsPanel() {
  return (
    <InteractableSettingsPanel
      name="Alice Johnson"
      email="alice@example.com"
      notifications={{
        email: true,
        push: false,
        sms: true,
      }}
      theme="light"
      language="en"
      privacy={{
        shareAnalytics: false,
        personalizationEnabled: true,
      }}
      onPropsUpdate={(newProps) => {
        console.log("Settings updated from Tambo:", newProps);
      }}
    />
  );
}
