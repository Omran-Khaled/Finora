import { Modal, Pressable, StyleSheet, View } from "react-native";
import { ReactNode } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Tokens } from "../tokens/theme";
import { AppText } from "./AppText";

interface ModalSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function ModalSheet({ isOpen, onClose, title, children }: ModalSheetProps) {
  if (!isOpen) return null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropPressable} onPress={onClose} accessibilityLabel="Close" />
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <View style={styles.header}>
            <AppText variant="title" weight="bold">
              {title}
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close sheet"
              onPress={onClose}
              style={styles.closeButton}
            >
              <Ionicons name="close" size={18} color={Tokens.colors.textSecondary} />
            </Pressable>
          </View>
          <View style={styles.content}>{children}</View>
        </View>
      </View>
    </Modal>
  );
}

const styles = Tokens.createStyles(() => ({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  backdropPressable: {
    ...StyleSheet.absoluteFill,
  },
  sheet: {
    backgroundColor: Tokens.colors.surface,
    borderTopLeftRadius: Tokens.radius.lg,
    borderTopRightRadius: Tokens.radius.lg,
    padding: Tokens.spacing.lg,
    maxHeight: "90%",
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: Tokens.radius.full,
    backgroundColor: Tokens.colors.border,
    marginBottom: Tokens.spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Tokens.spacing.md,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: Tokens.radius.full,
    backgroundColor: Tokens.colors.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    paddingBottom: Tokens.spacing.lg,
  },
}));