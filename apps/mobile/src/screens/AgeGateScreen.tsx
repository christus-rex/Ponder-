import React, { useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import {
  isAdultOnDate,
  type BirthDate
} from '../../../../packages/domain/src/onboarding';

export interface AgeGateScreenProps {
  onEligible: (birthDate: BirthDate) => void;
}

export function AgeGateScreen({ onEligible }: AgeGateScreenProps) {
  const [birthDateInput, setBirthDateInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  function continueFromAgeGate() {
    const birthDate = parseBirthDate(birthDateInput);
    if (!birthDate) {
      setError('Enter a valid date in MM/DD/YYYY format.');
      return;
    }

    const now = new Date();
    const today: BirthDate = {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate()
    };

    try {
      if (!isAdultOnDate(birthDate, today)) {
        setError('Ponder+ is available only to adults age 18 and older.');
        return;
      }
    } catch {
      setError('Enter a valid date in MM/DD/YYYY format.');
      return;
    }

    setError(null);
    onEligible(birthDate);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.eyebrow}>ADULTS 18+ ONLY</Text>
        <Text style={styles.title}>Before you enter Ponder+</Text>
        <Text style={styles.body}>
          Enter your date of birth. Your birth date is private account data and is not part of your public profile.
        </Text>

        <View style={styles.form}>
          <Text style={styles.label}>Date of birth</Text>
          <TextInput
            accessibilityLabel="Date of birth"
            autoComplete="birthdate-full"
            inputMode="numeric"
            keyboardType="number-pad"
            maxLength={10}
            onChangeText={(value) => {
              setBirthDateInput(formatBirthDateInput(value));
              if (error) setError(null);
            }}
            placeholder="MM/DD/YYYY"
            placeholderTextColor="#6f7385"
            style={styles.input}
            value={birthDateInput}
          />
          {error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          ) : null}
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={birthDateInput.length !== 10}
          onPress={continueFromAgeGate}
          style={({ pressed }) => [
            styles.button,
            birthDateInput.length !== 10 && styles.buttonDisabled,
            pressed && birthDateInput.length === 10 && styles.buttonPressed
          ]}
        >
          <Text style={styles.buttonText}>Continue</Text>
        </Pressable>

        <Text style={styles.footnote}>
          Age eligibility is checked again by the backend. Client-side checks never grant account privileges.
        </Text>
      </View>
    </SafeAreaView>
  );
}

function parseBirthDate(value: string): BirthDate | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return null;

  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (!Number.isInteger(month) || !Number.isInteger(day) || !Number.isInteger(year)) return null;

  return { year, month, day };
}

function formatBirthDateInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#08090f' },
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 18 },
  eyebrow: { color: '#7ce8df', fontSize: 12, fontWeight: '800', letterSpacing: 2 },
  title: { color: '#f7f7fb', fontSize: 36, lineHeight: 42, fontWeight: '800', letterSpacing: -1.2 },
  body: { color: '#b8b9c6', fontSize: 17, lineHeight: 25 },
  form: { gap: 8 },
  label: { color: '#e6e7ee', fontSize: 14, fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderColor: '#34374a',
    borderRadius: 16,
    backgroundColor: '#11131d',
    color: '#fff',
    fontSize: 20,
    letterSpacing: 1,
    paddingHorizontal: 16,
    paddingVertical: 16
  },
  error: { color: '#ff9b9b', fontSize: 14, lineHeight: 20 },
  button: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: '#5f5df7'
  },
  buttonDisabled: { opacity: 0.4 },
  buttonPressed: { opacity: 0.82 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  footnote: { color: '#7d8193', fontSize: 12, lineHeight: 18 }
});
