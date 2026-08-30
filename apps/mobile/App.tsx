import React from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

type FeatureCardProps = { title: string; description: string };
function FeatureCard({ title, description }: FeatureCardProps) {
  return <View style={styles.card}><Text style={styles.cardTitle}>{title}</Text><Text style={styles.cardBody}>{description}</Text></View>;
}

export default function App() {
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
  safeArea: { flex: 1, backgroundColor: '#08090f' }, container: { padding: 24, gap: 16 },
  eyebrow: { color: '#7ce8df', fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  title: { color: '#f7f7fb', fontSize: 52, fontWeight: '800', letterSpacing: -2 },
  subtitle: { color: '#b8b9c6', fontSize: 20, marginBottom: 8 },
  notice: { borderWidth: 1, borderColor: '#393b50', borderRadius: 20, padding: 18, backgroundColor: '#11131d' },
  noticeTitle: { color: '#f1c86b', fontSize: 16, fontWeight: '700', marginBottom: 6 },
  noticeBody: { color: '#d3d4dd', fontSize: 15, lineHeight: 22 },
  card: { borderWidth: 1, borderColor: '#25283a', borderRadius: 18, padding: 18, backgroundColor: '#0e1018' },
  cardTitle: { color: '#f7f7fb', fontSize: 18, fontWeight: '700', marginBottom: 6 },
  cardBody: { color: '#aaaebe', fontSize: 15, lineHeight: 21 },
  primaryButton: { marginTop: 8, borderRadius: 16, paddingVertical: 16, alignItems: 'center', backgroundColor: '#5f5df7' },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '800' }
});
