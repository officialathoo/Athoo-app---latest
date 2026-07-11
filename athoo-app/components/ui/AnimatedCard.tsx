import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, ViewStyle } from "react-native";

interface AnimatedCardProps {
  children: React.ReactNode;
  delay?: number;
  style?: ViewStyle;
  direction?: "up" | "down" | "left" | "right" | "fade";
}

export function AnimatedCard({ children, delay = 0, style, direction = "up" }: AnimatedCardProps) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: 1,
      tension: 60,
      friction: 10,
      delay,
      useNativeDriver: true,
    }).start();
  }, []);

  const getTransform = () => {
    const distance = 28;
    if (direction === "up") return [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }];
    if (direction === "down") return [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-distance, 0] }) }];
    if (direction === "left") return [{ translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }];
    if (direction === "right") return [{ translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [-distance, 0] }) }];
    return undefined;
  };

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: anim,
          transform: getTransform(),
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

