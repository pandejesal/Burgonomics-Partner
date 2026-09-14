import { describe, it, expect } from 'vitest';

/**
 * Razorpay Route Split Calculator (95% Branch Account, 5% Brand HQ Royalty)
 */
export function calculateRouteSplit(
  orderId: string,
  grossAmountInRupees: number,
  royaltyRate: number = 0.05
) {
  const grossPaisa = Math.round(grossAmountInRupees * 100);
  const brandRoyaltyPaisa = Math.round(grossPaisa * royaltyRate);
  const branchTransferPaisa = grossPaisa - brandRoyaltyPaisa;

  return {
    orderId,
    grossPaisa,
    brandRoyaltyPaisa,
    branchTransferPaisa,
  };
}

/**
 * KDS Bump Bar State Transition Machine
 */
export type KdsOrderStatus = 'pending' | 'preparing' | 'ready' | 'dispatched' | 'delivered';

export function bumpKdsOrder(currentStatus: KdsOrderStatus): KdsOrderStatus {
  switch (currentStatus) {
    case 'pending':
      return 'preparing';
    case 'preparing':
      return 'ready';
    case 'ready':
      return 'dispatched';
    case 'dispatched':
      return 'delivered';
    default:
      return currentStatus;
  }
}

/**
 * Inactive Ticket Escalation Rule (Escalate after 60m of inactivity)
 */
export function shouldEscalateTicket(
  ticket: { priority: string; lastActivityMinutesAgo: number; status: string }
): boolean {
  if (ticket.status === 'resolved' || ticket.status === 'closed') {
    return false;
  }
  return ticket.lastActivityMinutesAgo >= 60 && ticket.priority === 'normal';
}

/**
 * Multi-Tier Ticket Escalation Checker
 */
export function checkTicketInactivityEscalation(
  createdAtTimestamp: number,
  status: string,
  currentTier: number,
  now: number = Date.now()
): { shouldEscalate: boolean; targetTier: number; reason?: string } {
  if (status === 'resolved' || status === 'closed') {
    return { shouldEscalate: false, targetTier: currentTier };
  }

  const elapsedMs = now - createdAtTimestamp;

  if (currentTier === 1 && elapsedMs >= 60 * 60 * 1000) {
    return {
      shouldEscalate: true,
      targetTier: 2,
      reason: '>60m SLA exceeded: escalating from Branch to Brand Support',
    };
  }

  if (currentTier === 2 && elapsedMs >= 180 * 60 * 1000) {
    return {
      shouldEscalate: true,
      targetTier: 3,
      reason: '>180m SLA exceeded: escalating from Brand Support to Developer Team',
    };
  }

  return { shouldEscalate: false, targetTier: currentTier };
}

describe('Partner Operations Core — KDS & Razorpay Route Royalty Benchmarks', () => {
  it('correctly calculates 5% Razorpay Route Brand Royalty split with exact paisa precision', () => {
    const grossRupees = 499; // ₹499 -> 49,900 paise
    const split = calculateRouteSplit('ord_101', grossRupees, 0.05);

    expect(split.grossPaisa).toBe(49900);
    expect(split.brandRoyaltyPaisa).toBe(2495); // 5% of 49,900 paise = 2,495 paise (₹24.95)
    expect(split.branchTransferPaisa).toBe(47405); // 95% = 47,405 paise (₹474.05)
    expect(split.brandRoyaltyPaisa + split.branchTransferPaisa).toBe(split.grossPaisa);
  });

  it('handles irregular odd-paise amounts without floating point leak', () => {
    const grossRupees = 333.33; // 33,333 paise
    const split = calculateRouteSplit('ord_odd', grossRupees, 0.05);

    expect(split.grossPaisa).toBe(33333);
    expect(split.brandRoyaltyPaisa).toBe(1667); // Math.round(33333 * 0.05) = 1666.65 -> 1667
    expect(split.branchTransferPaisa).toBe(31666); // 33333 - 1667 = 31666
    expect(split.brandRoyaltyPaisa + split.branchTransferPaisa).toBe(33333);
  });

  it('correctly advances KDS bump state lifecycle', () => {
    let status: KdsOrderStatus = 'pending';
    status = bumpKdsOrder(status);
    expect(status).toBe('preparing');

    status = bumpKdsOrder(status);
    expect(status).toBe('ready');

    status = bumpKdsOrder(status);
    expect(status).toBe('dispatched');

    status = bumpKdsOrder(status);
    expect(status).toBe('delivered');
  });

  it('correctly detects >60m ticket inactivity for Tier 1 -> Tier 2 escalation', () => {
    const activeTicket = {
      priority: 'normal',
      lastActivityMinutesAgo: 45,
      status: 'open',
    };
    expect(shouldEscalateTicket(activeTicket)).toBe(false);

    const inactiveTicket = {
      priority: 'normal',
      lastActivityMinutesAgo: 65,
      status: 'open',
    };
    expect(shouldEscalateTicket(inactiveTicket)).toBe(true);

    const resolvedTicket = {
      priority: 'normal',
      lastActivityMinutesAgo: 120,
      status: 'resolved',
    };
    expect(shouldEscalateTicket(resolvedTicket)).toBe(false);
  });

  it('STRESS BENCHMARK: reconciles 1,000 Razorpay Route splits and KDS bumps in under 100ms', () => {
    // Warmup JIT
    for (let w = 0; w < 50; w++) {
      calculateRouteSplit(`ord_warmup_${w}`, 250, 0.05);
      bumpKdsOrder('pending');
    }

    const startTime = performance.now();
    const iterations = 1000;
    let totalRoyaltyPaisa = 0;
    let lastKdsState: KdsOrderStatus = 'pending';

    for (let i = 0; i < iterations; i++) {
      const gross = 100 + (i % 900) + 0.5;
      const split = calculateRouteSplit(`ord_test_${i}`, gross, 0.05);
      totalRoyaltyPaisa += split.brandRoyaltyPaisa;
      lastKdsState = bumpKdsOrder('preparing');
    }

    const duration = performance.now() - startTime;
    const avgPerOpMs = duration / iterations;

    console.log(
      `[Benchmark: Partner Route Royalty & KDS] Executed ${iterations} reconciliations in ${duration.toFixed(
        2
      )}ms (Throughput: ${(1000 / avgPerOpMs).toFixed(0)} ops/sec, Avg: ${avgPerOpMs.toFixed(4)}ms/op)`
    );

    expect(lastKdsState).toBe('ready');
    expect(totalRoyaltyPaisa).toBeGreaterThan(0);
    expect(duration).toBeLessThan(100);
  });
});
