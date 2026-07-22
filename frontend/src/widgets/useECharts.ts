import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import type { EChartsOption } from "echarts";

export function useECharts(
  containerRef: React.RefObject<HTMLDivElement | null>,
  option: EChartsOption | null,
  onDataPointClick?: (categoryValue: string) => void,
) {
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const chart = echarts.init(containerRef.current);
    chartRef.current = chart;

    return () => {
      chart.dispose();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef]);

  useEffect(() => {
    if (chartRef.current && option) {
      // notMerge: replace the option wholesale. Cross-filtering re-shapes the same
      // chart with a varying number of series (e.g. Scatter grouped by Details), and
      // merge-mode setOption would leave orphaned series from a previous render.
      chartRef.current.setOption(option, { notMerge: true });
    }
  }, [option]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !onDataPointClick) {
      return;
    }

    const handler = (params: { name?: string }) => {
      if (params.name) {
        onDataPointClick(params.name);
      }
    };

    chart.on("click", handler);
    return () => {
      chart.off("click", handler);
    };
  }, [onDataPointClick]);
}
