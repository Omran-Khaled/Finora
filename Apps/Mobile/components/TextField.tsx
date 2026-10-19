import { TextInput, TextInputProps, View, Text } from "react-native";
import { useState } from "react";
import { Tokens } from "../tokens/theme";

interface TextFieldProps extends TextInputProps {
  label?: string;
  error?: string;
}

export function TextField({ label, error, style, onFocus, onBlur, ...rest }: TextFieldProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.wrapper}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        {...rest}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        placeholderTextColor={Tokens.colors.textMuted}
        style={[
          styles.input,
          focused ? styles.inputFocused : null,
          error ? styles.inputError : null,
          style,
        ]}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = Tokens.createStyles(() => ({
  wrapper: {
    marginBottom: Tokens.spacing.md,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: Tokens.colors.textSecondary,
    marginBottom: 6,
  },
  input: {
    borderRadius: Tokens.radius.md,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    backgroundColor: Tokens.colors.surface,
    color: Tokens.colors.textPrimary,
    paddingHorizontal: Tokens.spacing.md,
    paddingVertical: Tokens.spacing.lg,
    fontSize: Tokens.typography.body,
    minHeight: 54,
  },
  inputError: {
    borderColor: Tokens.colors.danger,
  },
  inputFocused: {
    borderColor: Tokens.colors.ring,
  },
  errorText: {
    color: Tokens.colors.dangerText,
    fontSize: 12,
    marginTop: 4,
  },
}));