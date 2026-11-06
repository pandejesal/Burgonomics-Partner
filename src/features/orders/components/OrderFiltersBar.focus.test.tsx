/** @vitest-environment jsdom */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderFiltersBar } from './OrderFiltersBar';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let host: HTMLDivElement;
let root: Root;
const changed = vi.fn();
function rect(left: number, width: number): DOMRect {
  return { x: left, y: 200, top: 200, bottom: 228, left, right: left + width, width, height: 28, toJSON: () => ({}) };
}
beforeEach(async () => {
  changed.mockClear();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<OrderFiltersBar
    channelFilter="all" onChannelChange={changed} paymentFilter="all" onPaymentChange={changed}
    statusFilter="all" onStatusChange={changed} dateRange="today" onDateRangeChange={changed}
    searchQuery="" onSearchChange={changed} onOpenCreateModal={changed}
    canCreateWalkInOrder={false} totalCount={3} filteredCount={3}
  />));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

function prepare(label: string, left: number, width: number) {
  const button = [...host.querySelectorAll('button')].find(b => b.textContent?.trim() === label)!;
  expect(button).toBeDefined();
  const strip = button.parentElement!;
  expect(strip.className).toContain('overflow-x-auto');
  Object.defineProperties(strip, {
    clientWidth: { configurable: true, value: 100 },
    clientLeft: { configurable: true, value: 1 },
    scrollWidth: { configurable: true, value: 400 },
  });
  strip.getBoundingClientRect = () => rect(16, 102);
  button.getBoundingClientRect = () => rect(left, width);
  strip.scrollLeft = 40;
  return { button, strip };
}

describe('keyboard focus reveals filter controls inside their own horizontal strip', () => {
  it.each(['Delivery', 'Unpaid', 'Cancelled'])('reveals the right-clipped %s control without changing filters', async label => {
    const { button, strip } = prepare(label, 110, 90);
    await act(async () => button.focus());
    expect(document.activeElement).toBe(button);
    expect(strip.scrollLeft).toBe(127); // right edge200 -> inner right117 minus4px gap
    expect(changed).not.toHaveBeenCalled();
  });
  it('reveals a left-clipped control on reverse traversal', async () => {
    const { button, strip } = prepare('Delivery', 10, 70);
    await act(async () => button.focus());
    expect(strip.scrollLeft).toBe(29);
    expect(changed).not.toHaveBeenCalled();
  });
  it('does not move a fully visible control', async () => {
    const { button, strip } = prepare('Delivery', 25, 50);
    await act(async () => button.focus());
    expect(strip.scrollLeft).toBe(40);
  });
  it('shows the leading edge if a control is wider than the available strip', async () => {
    const { button, strip } = prepare('Delivery', 10, 140);
    await act(async () => button.focus());
    expect(strip.scrollLeft).toBe(29);
  });
});
