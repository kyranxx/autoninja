import { describe, expect, it } from "vitest";
import {
  getVisibleBrandRefinementOptions,
  mergePersistentRefinementOptions,
} from "./FilterSidebar";

describe("mergePersistentRefinementOptions", () => {
  it("keeps previously seen brand options visible after one brand is selected", () => {
    const persistedItems = [
      { value: "Audi", label: "Audi", count: 24, isRefined: false },
      { value: "BMW", label: "BMW", count: 18, isRefined: false },
      { value: "Skoda", label: "Skoda", count: 31, isRefined: false },
    ];
    const liveItems = [{ value: "Audi", label: "Audi", count: 24, isRefined: true }];

    expect(
      mergePersistentRefinementOptions(persistedItems, liveItems, ["Audi"]),
    ).toEqual([
      { value: "Audi", label: "Audi", count: 24, isRefined: true },
      { value: "Skoda", label: "Skoda", count: 31, isRefined: false },
      { value: "BMW", label: "BMW", count: 18, isRefined: false },
    ]);
  });

  it("injects selected brands that are temporarily missing from live facet values", () => {
    const persistedItems = [{ value: "BMW", label: "BMW", count: 18, isRefined: false }];

    expect(
      mergePersistentRefinementOptions(persistedItems, [], ["Volvo"]),
    ).toEqual([
      { value: "Volvo", label: "Volvo", count: 0, isRefined: true },
      { value: "BMW", label: "BMW", count: 18, isRefined: false },
    ]);
  });
});

describe("getVisibleBrandRefinementOptions", () => {
  const catalog = [
    { value: "Audi", label: "Audi", count: 0, isRefined: false },
    { value: "BMW", label: "BMW", count: 0, isRefined: false },
    { value: "Volkswagen", label: "Volkswagen", count: 0, isRefined: false },
  ];
  const live = [
    { value: "Volkswagen", label: "Volkswagen", count: 1, isRefined: false },
  ];

  it("shows only available or selected brands before the user searches", () => {
    expect(getVisibleBrandRefinementOptions(catalog, live, ["BMW"], "")).toEqual([
      { value: "BMW", label: "BMW", count: 0, isRefined: true },
      { value: "Volkswagen", label: "Volkswagen", count: 1, isRefined: false },
    ]);
  });

  it("searches the complete taxonomy on demand", () => {
    expect(getVisibleBrandRefinementOptions(catalog, live, [], "aud")).toEqual([
      { value: "Audi", label: "Audi", count: 0, isRefined: false },
    ]);
  });
});
