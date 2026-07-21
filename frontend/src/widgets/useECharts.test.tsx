import { render } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import * as echarts from "echarts";
import { useECharts } from "./useECharts";

function TestComponent({ option }: { option: echarts.EChartsOption | null }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useECharts(ref, option);
  return <div ref={ref} />;
}

describe("useECharts", () => {
  it("initializes and disposes the chart with the container's lifecycle", () => {
    const disposeSpy = vi.fn();
    const setOptionSpy = vi.fn();
    vi.spyOn(echarts, "init").mockReturnValue({
      setOption: setOptionSpy,
      dispose: disposeSpy,
    } as unknown as echarts.ECharts);

    const { unmount } = render(<TestComponent option={{ series: [] }} />);

    expect(echarts.init).toHaveBeenCalledTimes(1);
    expect(setOptionSpy).toHaveBeenCalledWith({ series: [] });

    unmount();

    expect(disposeSpy).toHaveBeenCalledTimes(1);
  });
});
