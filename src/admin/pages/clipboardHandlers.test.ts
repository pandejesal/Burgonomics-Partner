import { describe, expect, it, vi } from "vitest";
import storesSource from "./AdminStoresPage.tsx?raw";
import webhooksSource from "./petpooja/PetpoojaWebhooksPage.tsx?raw";

// The repo runs in Node without a DOM/testing-library dependency. Execute the
// actual page-local handler, injecting only its browser/UI boundaries. The
// extraction ends at the declaration's indentation; only string parameter
// annotations need removing to execute these small handlers as JavaScript.
function loadHandler(source: string, name: string) {
  const initializer = source.match(new RegExp(`  const ${name} = ([\\s\\S]*?\\n  });`))?.[1];
  if (!initializer) throw new Error(`Missing clipboard handler: ${name}`);
  const javascript = initializer.replace(/: string\b/g, "");
  return new Function(
    "navigator", "toast", "setCopiedId", "setTimeout",
    `return ${javascript}`,
  ) as (
    navigator: { clipboard?: { writeText: (text: string) => Promise<void> } },
    toast: { success: (message: string) => void; error: (message: string) => void },
    setCopiedId: (value: string | null) => void,
    setTimeout: (callback: () => void, delay: number) => void,
  ) => (text: string, label: string) => Promise<void>;
}

const cases = [
  {
    page: "AdminStoresPage",
    source: storesSource,
    handler: "handleCopyText",
    success: "Store ID copied to clipboard!",
    error: "Could not copy Store ID to clipboard. Please try again.",
    hasCopiedState: false,
  },
  {
    page: "PetpoojaWebhooksPage",
    source: webhooksSource,
    handler: "handleCopy",
    success: "Payload copied to clipboard.",
    error: "Could not copy payload to clipboard. Please try again.",
    hasCopiedState: true,
  },
] as const;

describe.each(cases)("$page clipboard feedback", (testCase) => {
  const createHandler = loadHandler(testCase.source, testCase.handler);

  function setup(clipboard?: { writeText: (text: string) => Promise<void> }) {
    const toast = { success: vi.fn(), error: vi.fn() };
    const setCopiedId = vi.fn();
    const scheduleReset = vi.fn<(callback: () => void, delay: number) => void>();
    const handleCopy = createHandler({ clipboard }, toast, setCopiedId, scheduleReset);
    return { handleCopy, toast, setCopiedId, scheduleReset };
  }

  it("reports success and copied state only after the clipboard resolves", async () => {
    let resolveCopy!: () => void;
    const writeText = vi.fn(() => new Promise<void>((resolve) => { resolveCopy = resolve; }));
    const { handleCopy, toast, setCopiedId, scheduleReset } = setup({ writeText });
    const pending = handleCopy("payload", "Store ID");
    expect(writeText).toHaveBeenCalledWith("payload");
    expect(toast.success).not.toHaveBeenCalled();
    expect(setCopiedId).not.toHaveBeenCalled();
    expect(scheduleReset).not.toHaveBeenCalled();

    resolveCopy();
    await expect(pending).resolves.toBeUndefined();
    expect(toast.success).toHaveBeenCalledExactlyOnceWith(testCase.success);
    expect(toast.error).not.toHaveBeenCalled();
    if (testCase.hasCopiedState) {
      expect(setCopiedId).toHaveBeenCalledExactlyOnceWith("copied");
      expect(scheduleReset).toHaveBeenCalledWith(expect.any(Function), 2000);
      scheduleReset.mock.calls[0][0]();
      expect(setCopiedId).toHaveBeenLastCalledWith(null);
    } else {
      expect(setCopiedId).not.toHaveBeenCalled();
      expect(scheduleReset).not.toHaveBeenCalled();
    }
  });

  it("handles rejection with an error, never success or copied state", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("Permission denied"));
    const { handleCopy, toast, setCopiedId, scheduleReset } = setup({ writeText });
    await expect(handleCopy("payload", "Store ID")).resolves.toBeUndefined();
    expect(toast.error).toHaveBeenCalledExactlyOnceWith(testCase.error);
    expect(toast.success).not.toHaveBeenCalled();
    expect(setCopiedId).not.toHaveBeenCalled();
    expect(scheduleReset).not.toHaveBeenCalled();
  });

  it("handles an absent Clipboard API without throwing or claiming success", async () => {
    const { handleCopy, toast, setCopiedId, scheduleReset } = setup();
    await expect(handleCopy("payload", "Store ID")).resolves.toBeUndefined();
    expect(toast.error).toHaveBeenCalledExactlyOnceWith(testCase.error);
    expect(toast.success).not.toHaveBeenCalled();
    expect(setCopiedId).not.toHaveBeenCalled();
    expect(scheduleReset).not.toHaveBeenCalled();
  });
});
