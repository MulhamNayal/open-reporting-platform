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

function TestComponentWithClick({
  option, onDataPointClick,
}: { option: echarts.EChartsOption | null; onDataPointClick: (categoryValue: string) => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useECharts(ref, option, onDataPointClick);
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

  it("wires an onDataPointClick callback to the chart's native click event, receiving the clicked category value", () => {
    const clickHandlers: Record<string, (params: { name: string }) => void> = {};
    vi.spyOn(echarts, "init").mockReturnValue({
      setOption: vi.fn(),
      dispose: vi.fn(),
      on: vi.fn((event: string, handler: (params: { name: string }) => void) => { clickHandlers[event] = handler; }),
      off: vi.fn(),
    } as unknown as echarts.ECharts);

    const onDataPointClick = vi.fn();
    render(<TestComponentWithClick option={{ series: [] }} onDataPointClick={onDataPointClick} />);

    clickHandlers["click"]({ name: "North" });

    expect(onDataPointClick).toHaveBeenCalledWith("North");
  });
});
