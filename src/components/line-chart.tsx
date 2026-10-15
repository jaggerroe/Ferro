import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

type LineChartProps = {
  values: number[];
  height: number;
  /** Small version for cards: no labels, no grid. */
  compact?: boolean;
  /** Text for the top and bottom gridlines (full version only). */
  formatValue?: (n: number) => string;
  /** Labels under the first and last points, e.g. dates (full version only). */
  startLabel?: string;
  endLabel?: string;
};

/**
 * A simple line chart drawn with react-native-svg. The y-axis zooms to your
 * range (it doesn't start at 0), so going from 200 to 210 lb is visible.
 */
export function LineChart({ values, height, compact = false, formatValue, startLabel, endLabel }: LineChartProps) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const padX = compact ? 3 : 8;
  // Room on the right for the axis labels in the full version.
  const padRight = compact ? 3 : 56;
  const padY = compact ? 4 : 10;
  const dotR = compact ? 2.5 : 4;

  let min = Math.min(...values);
  let max = Math.max(...values);
  if (values.length === 0) {
    min = 0;
    max = 1;
  } else if (max === min) {
    // Flat line: give it some room so it sits in the middle.
    const pad = Math.abs(max) * 0.1 || 1;
    min -= pad;
    max += pad;
  } else {
    const pad = (max - min) * 0.12;
    min -= pad;
    max += pad;
  }

  const innerW = Math.max(0, width - padX - padRight);
  const innerH = height - padY * 2;
  const x = (i: number) => padX + (values.length === 1 ? innerW / 2 : (i / (values.length - 1)) * innerW);
  const y = (v: number) => padY + (1 - (v - min) / (max - min)) * innerH;

  const path = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const bestIndex = values.indexOf(Math.max(...values));
  const last = values.length - 1;

  return (
    <View>
      <View onLayout={onLayout} style={{ height }}>
        {width > 0 && values.length > 0 ? (
          <Svg width={width} height={height}>
            {!compact ? (
              <>
                <Line x1={padX} x2={width - padRight} y1={padY} y2={padY} stroke={theme.backgroundSelected} strokeWidth={1} />
                <Line
                  x1={padX}
                  x2={width - padRight}
                  y1={height - padY}
                  y2={height - padY}
                  stroke={theme.backgroundSelected}
                  strokeWidth={1}
                />
              </>
            ) : null}
            {values.length > 1 ? (
              <Path d={path} stroke={theme.accent} strokeWidth={compact ? 2 : 3} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            ) : null}
            {values.map((v, i) =>
              // Compact: only mark the latest point. Full: every point, with the best one filled.
              compact && i !== last ? null : (
                <Circle
                  key={i}
                  cx={x(i)}
                  cy={y(v)}
                  r={i === bestIndex && !compact ? dotR + 1.5 : dotR}
                  fill={i === bestIndex || compact || i === last ? theme.accent : theme.backgroundElement}
                  stroke={theme.accent}
                  strokeWidth={2}
                />
              ),
            )}
          </Svg>
        ) : null}

        {!compact && formatValue ? (
          <>
            <ThemedText type="small" themeColor="textSecondary" style={[styles.axisLabel, { top: 0 }]}>
              {formatValue(max)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={[styles.axisLabel, { bottom: 0 }]}>
              {formatValue(min)}
            </ThemedText>
          </>
        ) : null}
      </View>

      {!compact && (startLabel || endLabel) ? (
        <View style={styles.xLabels}>
          <ThemedText type="small" themeColor="textSecondary">
            {startLabel}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {endLabel}
          </ThemedText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  axisLabel: { position: 'absolute', right: 0, width: 52, textAlign: 'right', fontSize: 11, lineHeight: 14 },
  xLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, marginRight: 56 },
});
