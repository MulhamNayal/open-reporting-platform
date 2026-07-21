import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import type { EChartsOption } from "echarts";

export function useECharts(containerRef: React.RefObject<HTMLDivElement | null>, option: EChartsOption | null) {
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
      chartRef.current.setOption(option);
    }
  }, [option]);
}
