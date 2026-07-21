import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as datasetsApi from "../api/datasets";
import { useDatasetExecute } from "./useDatasetExecute";

describe("useDatasetExecute", () => {
  it("returns null data and no fetch when datasetId is null", () => {
    const { result } = renderHook(() => useDatasetExecute(null));

    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("fetches and returns the result for a given datasetId", async () => {
    const fakeResult = { columns: [{ name: "Id", nativeType: "int" }], rows: [[1]] };
    vi.spyOn(datasetsApi, "executeDataset").mockResolvedValue(fakeResult);

    const { result } = renderHook(() => useDatasetExecute(1));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual(fakeResult);
    expect(result.current.error).toBeNull();
  });

  it("surfaces a friendly error when the fetch fails", async () => {
    vi.spyOn(datasetsApi, "executeDataset").mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() => useDatasetExecute(1));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBeNull();
    expect(result.current.error).not.toBeNull();
  });
});
