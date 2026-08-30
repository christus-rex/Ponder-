import React, { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AgeGateScreen } from "./src/screens/AgeGateScreen";
import { AuthScreen } from "./src/screens/AuthScreen";
import { isSupabaseConfigured, supabase } from "./src/lib/supabase";

type AccessContext = {
  account_status?: string;
  restriction_reason?: string | null;
  role?: string | null;
  can_enter?: boolean;
};

type FeatureCardProps = { title: string; description: string };
function FeatureCard({ title, description }: FeatureCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardBody}>{description}</Text>
    </View>
  );
}

function GateMessage({
  title,
  body,
  onRetry,
}: {
  title: string;
  body: string;
  onRetry?: () => void;
}) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.gateContainer}>
        <Text style={styles.eyebrow}>PONDER+ ACCESS</Text>
        <Text style={styles.gateTitle}>{title}</Text>
        <Text style={styles.noticeBody}>{body}</Text>
        {onRetry ? (
          <Pressable style={styles.secondaryButton} onPress={onRetry}>
            <Text style={styles.secondaryButtonText}>Check access again</Text>
          </Pressable>
        ) : null}
        {supabase ? (
          <Pressable
            style={styles.secondaryButton}
            onPress={() => void supabase.auth.signOut()}
          >
            <Text style={styles.secondaryButtonText}>Sign out</Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  const [ageGatePassed, setAgeGatePassed] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [access, setAccess] = useState<AccessContext | null>(null);
  const [accessReady, setAccessReady] = useState(false);

  async function refreshAccess() {
    if (!supabase || !session) {
      setAccess(null);
      setAccessReady(true);
      return;
    }

    setAccessReady(false);
    const { data, error } = await supabase.rpc("current_access_context");
    setAccess(error ? null : (data as AccessContext));
    setAccessReady(true);
  }

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      return;
    }

    const client = supabase;
    void client.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAccess(null);
      setAccessReady(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    void refreshAccess();
  }, [session]);

  if (!isSupabaseConfigured || !supabase) {
    return (
      <GateMessage
        title="Identity service not configured."
        body="Set the Ponder+ Supabase URL and publishable key in the Expo environment before starting the mobile app."
      />
    );
  }

  if (!authReady) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loading}>
          <ActivityIndicator />
          <Text style={styles.noticeBody}>Restoring your Ponder+ identity…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!session) {
    if (!ageGatePassed) {
      return <AgeGateScreen onEligible={() => setAgeGatePassed(true)} />;
    }
    return <AuthScreen client={supabase} />;
  }

  if (!accessReady) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loading}>
          <ActivityIndicator />
          <Text style={styles.noticeBody}>Checking account authorization…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!access || access.account_status !== "active") {
    return (
      <GateMessage
        title="Account access restricted."
        body={
          access?.restriction_reason ??
          "Your session is valid, but the central authorization service has not granted app access."
        }
        onRetry={() => void refreshAccess()}
      />
    );
  }

  if (!access.can_enter) {
    return (
      <GateMessage
        title="Finish setting up your identity."
        body="Your account is authenticated, but Ponder+ requires completed onboarding and Terms acceptance before rooms, messaging, connections, or wallet features unlock."
        onRetry={() => void refreshAccess()}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.eyebrow}>18+ LIVE SOCIAL</Text>
        <Text style={styles.title}>Ponder+</Text>
        <Text style={styles.subtitle}>Live social for grown-ups.</Text>
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>Identity connected</Text>
          <Text style={styles.noticeBody}>
            This session is authorized by the same central Ponder+ identity
            service used by the web app.
          </Text>
        </View>
        <FeatureCard
          title="Discover"
          description="Find creator-led rooms by topic, community, and intent."
        />
        <FeatureCard
          title="Live Rooms"
          description="Join conversations, react, request a seat, and connect in real time."
        />
        <FeatureCard
          title="Worlds"
          description="Persistent communities that stay active before and after a stream."
        />
        <FeatureCard
          title="Safety by default"
          description="18+ gating, block/report controls, moderation, and auditable actions."
        />
        <Pressable
          accessibilityRole="button"
          style={styles.primaryButton}
          onPress={() => undefined}
        >
          <Text style={styles.primaryButtonText}>Enter Ponder+</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          style={styles.secondaryButton}
          onPress={() => void supabase.auth.signOut()}
        >
          <Text style={styles.secondaryButtonText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#0b0710" },
  container: { padding: 24, gap: 16 },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    padding: 24,
  },
  gateContainer: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    gap: 16,
  },
  gateTitle: {
    color: "#fff8fb",
    fontSize: 36,
    fontWeight: "700",
    letterSpacing: -1,
  },
  eyebrow: {
    color: "#f3a9c6",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 2,
  },
  title: {
    color: "#fff8fb",
    fontSize: 52,
    fontWeight: "700",
    letterSpacing: -2,
  },
  subtitle: { color: "#c7b8c3", fontSize: 20, marginBottom: 8 },
  notice: {
    borderWidth: 1,
    borderColor: "#4b3142",
    borderRadius: 24,
    padding: 18,
    backgroundColor: "#171019",
  },
  noticeTitle: {
    color: "#f4d9b2",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 6,
  },
  noticeBody: { color: "#e1d4dc", fontSize: 15, lineHeight: 22 },
  card: {
    borderWidth: 1,
    borderColor: "#352435",
    borderRadius: 22,
    padding: 18,
    backgroundColor: "#130d16",
  },
  cardTitle: {
    color: "#fff8fb",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 6,
  },
  cardBody: { color: "#beaeb9", fontSize: 15, lineHeight: 21 },
  primaryButton: {
    marginTop: 8,
    borderRadius: 20,
    paddingVertical: 16,
    alignItems: "center",
    backgroundColor: "#f3a9c6",
  },
  primaryButtonText: { color: "#2b1420", fontSize: 16, fontWeight: "800" },
  secondaryButton: {
    borderRadius: 20,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#4b3142",
  },
  secondaryButtonText: { color: "#f0d8e3", fontSize: 15, fontWeight: "700" },
});
