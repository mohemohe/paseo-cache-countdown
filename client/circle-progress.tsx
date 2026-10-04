import { View } from "react-native";

export interface CircleProgressProps {
  size: number;
  fraction: number;
  color: string;
  trackColor: string;
}

/** Two clipped semicircles keep the ring portable without SVG or browser APIs. */
export function CircleProgress({ size, fraction, color, trackColor }: CircleProgressProps) {
  const progress = Math.max(0, Math.min(1, fraction));
  const circle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    borderWidth: Math.max(2, size / 8),
  };
  const arc = {
    ...circle,
    position: "absolute" as const,
    borderColor: "transparent",
    borderTopColor: color,
    borderRightColor: color,
  };
  return (
    <View accessible={false} style={{ width: size, height: size }}>
      <View style={{ ...circle, borderColor: trackColor, position: "absolute" }} />
      {progress > 0 ? (
        <View style={{ position: "absolute", left: size / 2, width: size / 2, height: size, overflow: "hidden" }}>
          <View style={{ ...arc, left: -size / 2, transform: [{ rotate: `${45 + Math.min(progress, 0.5) * 360 - 180}deg` }] }} />
        </View>
      ) : null}
      {progress > 0.5 ? (
        <View style={{ position: "absolute", width: size / 2, height: size, overflow: "hidden" }}>
          <View style={{ ...arc, transform: [{ rotate: `${45 + (progress - 0.5) * 360}deg` }] }} />
        </View>
      ) : null}
      {progress === 0 ? <View style={{ ...circle, position: "absolute", borderColor: color, opacity: 0.35 }} /> : null}
    </View>
  );
}
