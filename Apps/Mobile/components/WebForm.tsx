import React from "react";
import { Platform, View } from "react-native";
import type { ReactNode } from "react";

interface WebFormProps {
  children: ReactNode;
  onSubmit: () => void;
}

export function WebForm({ children, onSubmit }: WebFormProps) {
  if (Platform.OS === "web") {
    return React.createElement(
      "form",
      {
        onSubmit: (event: { preventDefault: () => void }) => {
          event.preventDefault();
          onSubmit();
        },
        style: { width: "100%" },
      },
      children,
    );
  }

  return <View>{children}</View>;
}
