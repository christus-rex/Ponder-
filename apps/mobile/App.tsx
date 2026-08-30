import React, { useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AgeGateScreen } from './src/screens/AgeGateScreen';

type FeatureCardProps = { title: string; description: string };
function FeatureCard({ title, description }: FeatureCardProps) {
  return <View style={styles.card}><Text style={styles.cardTitle}>{title}</Text><Text style={styles.cardBody}>{description}</Text></View>;
}

export default function App() {
  const [ageGatePassed, setAgeGatePassed] = useState(false);

  if (!ageGatePassed) {
    return <AgeGateScreen onEligible={() => setAgeGatePassed(true)} />;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.eyebrow}>18+ LIVE SOCIAL</Text>
        <Text style={styles.title}>Ponder+</Text>
        <Text style={styles.subtitle}>Live social for grown-ups.</Text>
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>Foundation build</Text>
          <Text style={styles.noticeBody}>Profiles, Worlds, live rooms, moderation, and a demo gift economy form the first product loop.</Text>
        </View>
        <FeatureCard title="Discover" description="Find creator-led rooms by topic, community, and intent." />
        <FeatureCard title="Live Rooms" description="Join conversations, react, request a seat, and connect in real time." />
        <FeatureCard title="Worlds" description="Persistent communities that stay active before and after a stream." />
        <FeatureCard title="Safety by default" description="18+ gating, block/report controls, moderation, and auditable actions." />
        <Pressable accessibilityRole="button" style={styles.primaryButton} onPress={() => undefined}>
          <Text style={styles.primaryButtonText}>Enter Ponder+</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0b0710' }, container: { padding: 24, gap: 16 },
  eyebrow: { color: '#f3a9c6', fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  title: { color: '#fff8fb', fontSize: 52, fontWeight: '700', letterSpacing: -2 },
  subtitle: { color: '#c7b8c3', fontSize: 20, marginBottom: 8 },
  notice: { borderWidth: 1, borderColor: '#4b3142', borderRadius: 24, padding: 18, backgroundColor: '#171019' },
  noticeTitle: { color: '#f4d9b2', fontSize: 16, fontWeight: '700', marginBottom: 6 },
  noticeBody: { color: '#e1d4dc', fontSize: 15, lineHeight: 22 },
  card: { borderWidth: 1, borderColor: '#352435', borderRadius: 22, padding: 18, backgroundColor: '#130d16' },
  cardTitle: { color: '#fff8fb', fontSize: 18, fontWeight: '700', marginBottom: 6 },
  cardBody: { color: '#beaeb9', fontSize: 15, lineHeight: 21 },
  primaryButton: { marginTop: 8, borderRadius: 20, paddingVertical: 16, alignItems: 'center', backgroundColor: '#f3a9c6' },
  primaryButtonText: { color: '#2b1420', fontSize: 16, fontWeight: '800' }
});
