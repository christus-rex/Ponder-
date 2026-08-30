import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { SupabaseClient } from "@supabase/supabase-js";

type Props = {
  client: SupabaseClient;
};

export function AuthScreen({ client }: Props) {
  const [mode, setMode] = useState<"sign_in" | "sign_up">("sign_in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setMessage(null);

    try {
      if (mode === "sign_up") {
        const { error } = await client.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              date_of_birth: dateOfBirth.trim(),
              age_attestation: "self_attested",
            },
          },
        });

        if (error) throw error;
        setMessage(
          "Account created. If email confirmation is enabled, check your inbox before signing in.",
        );
      } else {
        const { error } = await client.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.brandRow}>
        <View style={styles.brandMark}>
          <Text style={styles.brandMarkText}>P+</Text>
        </View>
        <Text style={styles.brandName}>Ponder+</Text>
        <Text style={styles.ageBadge}>18+</Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.eyebrow}>SECURE CREDENTIAL LOGIN</Text>
        <Text style={styles.title}>
          {mode === "sign_in" ? "Welcome back." : "Create your identity."}
        </Text>
        <Text style={styles.body}>
          One Ponder+ account connects your profile, rooms, connections, and
          future wallet identity across web and mobile.
        </Text>

        <TextInput
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor="#8f7e89"
          style={styles.input}
          value={email}
        />
        <TextInput
          autoCapitalize="none"
          autoComplete={mode === "sign_in" ? "current-password" : "new-password"}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor="#8f7e89"
          secureTextEntry
          style={styles.input}
          value={password}
        />

        {mode === "sign_up" ? (
          <TextInput
            autoCapitalize="none"
            onChangeText={setDateOfBirth}
            placeholder="Date of birth · YYYY-MM-DD"
            placeholderTextColor="#8f7e89"
            style={styles.input}
            value={dateOfBirth}
          />
        ) : null}

        {message ? <Text style={styles.message}>{message}</Text> : null}

        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={submit}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && !busy ? styles.primaryButtonPressed : null,
            busy ? styles.buttonDisabled : null,
          ]}
        >
          {busy ? (
            <ActivityIndicator />
          ) : (
            <Text style={styles.primaryButtonText}>
              {mode === "sign_in" ? "Log in to Ponder+" : "Create account"}
            </Text>
          )}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() =>
            setMode((current) =>
              current === "sign_in" ? "sign_up" : "sign_in",
            )
          }
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryButtonText}>
            {mode === "sign_in"
              ? "New here? Create an account"
              : "Already have an account? Log in"}
          </Text>
        </Pressable>

        <Text style={styles.identityNote}>
          Protected by the central Ponder+ identity service.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0b0710",
    padding: 22,
    justifyContent: "center",
    gap: 20,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  brandMark: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f3a9c6",
  },
  brandMarkText: {
    color: "#2b1420",
    fontSize: 15,
    fontWeight: "900",
  },
  brandName: {
    color: "#fff8fb",
    fontSize: 18,
    fontWeight: "800",
    flex: 1,
  },
  ageBadge: {
    color: "#f3a9c6",
    borderWidth: 1,
    borderColor: "#5c384d",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 11,
    fontWeight: "800",
  },
  panel: {
    borderWidth: 1,
    borderColor: "#4b3142",
    borderRadius: 30,
    padding: 22,
    backgroundColor: "#171019",
    gap: 14,
  },
  eyebrow: {
    color: "#f3a9c6",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.8,
  },
  title: {
    color: "#fff8fb",
    fontSize: 38,
    fontWeight: "700",
    letterSpacing: -1,
  },
  body: {
    color: "#c7b8c3",
    fontSize: 16,
    lineHeight: 23,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: "#4b3142",
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#100b12",
    color: "#fff8fb",
    fontSize: 16,
  },
  message: {
    color: "#f4d9b2",
    lineHeight: 20,
  },
  primaryButton: {
    borderRadius: 20,
    paddingVertical: 16,
    alignItems: "center",
    backgroundColor: "#f3a9c6",
    marginTop: 4,
  },
  primaryButtonPressed: {
    transform: [{ scale: 0.99 }],
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  primaryButtonText: {
    color: "#2b1420",
    fontSize: 16,
    fontWeight: "800",
  },
  secondaryButton: {
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#e7cad8",
    fontWeight: "700",
  },
  identityNote: {
    color: "#8f7e89",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
  },
});
