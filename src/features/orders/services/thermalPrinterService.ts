import type { Order } from '@/types';
import { modifierLabelsFrom } from '@/utils/orderContract';

export interface ThermalKOTData {
  orderId: string;
  shortCode: string;
  orderType: string;
  tableNumber?: string;
  branchName: string;
  createdAtFormatted: string;
  customerName?: string;
  customerPhone?: string;
  /** Resolved delivery address (delivery orders only — empty otherwise). */
  deliveryAddress?: string;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
    modifiers?: string[];
    specialInstructions?: string;
  }>;
  subtotal: number;
  tax: number;
  total: number;
  specialNotes?: string;
}

/** Resolve the delivery address from the many shapes customer docs carry. */
function resolveDeliveryAddress(order: Order): string | undefined {
  const addr = (order as any).deliveryAddress;
  if (!addr) return undefined;
  const text =
    addr.full ||
    [addr.line1, addr.line2, addr.landmark, addr.city, addr.pincode].filter(Boolean).join(', ') ||
    addr.street ||
    addr.address ||
    addr.label;
  return text ? String(text) : undefined;
}

/**
 * Crash-proof: a KOT must ALWAYS print something — a malformed customer doc
 * (missing orderType/createdAt/id) used to throw `toUpperCase of undefined`
 * and white-screen the order page instead of slipping the kitchen.
 */
export function formatOrderForKOT(order: Order): ThermalKOTData {
  const raw = order as any;

  let rawShortCode = raw.shortCode || raw.orderNumber;
  if (!rawShortCode && typeof order.id === 'string' && order.id.length > 0) {
    // If order.id contains underscore (e.g. ord_detail_8841), take the last segment
    const parts = order.id.split('_');
    rawShortCode = parts[parts.length - 1].toUpperCase();
  }
  if (!rawShortCode) rawShortCode = 'NA';

  let orderDate = new Date();
  try {
    orderDate = order.createdAt?.toDate
      ? order.createdAt.toDate()
      : new Date(raw.createdAt || Date.now());
    if (Number.isNaN(orderDate.getTime())) orderDate = new Date();
  } catch {
    orderDate = new Date();
  }

  const createdAtFormatted = orderDate.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const items = (Array.isArray(order.items) ? order.items : []).map((item) => {
    // Modifiers arrive as strings OR `{ name }`/`{ label }` objects depending
    // on which app wrote the doc. Collapse every entry to a label so a KOT
    // never prints "[object Object]" (or throws) on the printer path.
    const modifiers = modifierLabelsFrom(item);

    return {
      name: String((item as any)?.name ?? 'Item'),
      quantity: Number((item as any)?.quantity) || 1,
      price: Number((item as any)?.price) || 0,
      modifiers: modifiers.length > 0 ? modifiers : undefined,
      specialInstructions: (item as any).specialInstructions || (item as any).notes,
    };
  });

  // Fulfillment: Delivery docs may carry `fulfillment` instead of orderType.
  const orderType = String(raw.orderType || raw.fulfillment || 'PICKUP').toUpperCase();
  const isDelivery = orderType === 'DELIVERY' || raw.fulfillment === 'delivery';

  return {
    orderId: typeof order.id === 'string' ? order.id : String(rawShortCode),
    shortCode: String(rawShortCode).startsWith('#') ? String(rawShortCode) : `#${rawShortCode}`,
    orderType,
    tableNumber: raw.tableNumber ? String(raw.tableNumber) : undefined,
    branchName: order.branchName || 'Burgonomics Store',
    createdAtFormatted,
    customerName: raw.customerName ? String(raw.customerName) : undefined,
    customerPhone: raw.customerPhone ? String(raw.customerPhone) : undefined,
    deliveryAddress: isDelivery ? resolveDeliveryAddress(order) : undefined,
    items,
    subtotal: Number(order.subtotal) || Number(order.total) || 0,
    tax: Number(order.tax) || 0,
    total: Number(order.total) || 0,
    specialNotes: raw.specialInstructions || raw.customerNotes,
  };
}

/**
 * Generate Monospace Thermal KOT ASCII Text representation.
 *
 * @param columns Printable character width. 48 = standard 80mm Font A,
 *                32 = 58mm. Defaults to 48.
 */
export function generateASCIIReceipt(kot: ThermalKOTData, columns = 48): string {
  const width = Math.max(1, Math.floor(columns));
  const divider = '='.repeat(width);
  const subDivider = '-'.repeat(width);

  /** Horizontally center a header line within the paper width. */
  const center = (line: string): string => {
    if (line.length >= width) return line;
    const pad = Math.floor((width - line.length) / 2);
    return `${' '.repeat(pad)}${line}`;
  };

  /**
   * Reflow a line that overflows the paper width — a 60-char modifier on
   * 58mm (32-col) paper used to run off the roll (or wrap mid-token on
   * printers that hard-wrap), mangling kitchen notes. Continuation lines
   * carry the supplied indent so kitchen notes stay visually attached.
   */
  const wrap = (line: string, indent = ''): string[] => {
    if (line.length <= width) return [line];
    const out: string[] = [];
    let current = line;
    while (current.length > width) {
      let breakAt = current.lastIndexOf(' ', width);
      if (breakAt <= 0) breakAt = width;
      out.push(current.slice(0, breakAt));
      current = indent + current.slice(breakAt).replace(/^\s+/, '');
    }
    out.push(current);
    return out;
  };
  const emit = (line: string, indent = ''): string => {
    const lines = wrap(line, indent);
    return lines.length > 0 ? `${lines.join('\n')}\n` : '';
  };

  let text = '';
  text += `${divider}\n`;
  text += `${center('BURGONOMICS KOT')}\n`;
  text += `${center(kot.branchName)}\n`;
  text += `${center('*** KITCHEN COPY ***')}\n`;
  text += `${divider}\n`;
  text += emit(`Order #: ${kot.shortCode}`);
  text += emit(`Type:    ${kot.orderType}${kot.tableNumber ? ` (Table: ${kot.tableNumber})` : ''}`);
  text += emit(`Date:    ${kot.createdAtFormatted}`);
  text += `${subDivider}\n`;
  // Column header sized to the paper (the old fixed 45-char row overflowed
  // 58mm/32-col rolls and clipped the "Amount" label).
  text += `${'Qty'.padEnd(5)}${'Item'.padEnd(Math.max(6, width - 17))}Amount\n`;
  text += `${subDivider}\n`;

  kot.items.forEach((item) => {
    const itemTotal = item.quantity * item.price;
    text += emit(`${item.quantity}x   ${item.name}`);
    text += `     Price: ₹${itemTotal} (₹${item.price} ea)\n`;

    if (item.modifiers && item.modifiers.length > 0) {
      item.modifiers.forEach((mod) => {
        text += emit(`     - ${mod}`, '       ');
      });
    }

    if (item.specialInstructions) {
      text += emit(`     * Note: ${item.specialInstructions}`, '       ');
    }
  });

  text += `${subDivider}\n`;
  if (kot.specialNotes) {
    text += emit(`Special Note: ${kot.specialNotes}`, '              ');
    text += `${subDivider}\n`;
  }
  text += `${divider}\n`;
  // Footer: customer contact, delivery address (delivery only) and table
  // number (dine-in only) — the rider/handover details every KOT needs.
  if (kot.customerName || kot.customerPhone) {
    text += emit(
      `Customer: ${kot.customerName || '—'}${kot.customerPhone ? `  Ph: ${kot.customerPhone}` : ''}`
    );
  }
  if (kot.deliveryAddress) {
    text += emit(`Address:  ${kot.deliveryAddress}`, '          ');
  }
  if (kot.tableNumber) {
    text += emit(`Table:    ${kot.tableNumber}`);
  }
  if (kot.customerName || kot.customerPhone || kot.deliveryAddress || kot.tableNumber) {
    text += `${subDivider}\n`;
  }
  text += `Total Amount: ₹${kot.total}\n`;
  text += `${divider}\n`;
  text += `${center('*** KITCHEN COPY ***')}\n`;
  text += `${divider}\n`;

  return text;
}

/**
 * ESC/POS QR-code block (GS ( k model-2, cell size 7, EC level C) encoding
 * `data` — scanned by riders/managers to pull up the order without typing
 * the short code. Returns an empty array if encoding fails (printers that
 * don't understand QR still get the full text slip).
 */
export function generateQRCodeBlock(data: string): Uint8Array {
  try {
    const GS = 0x1d;
    const bytes = new TextEncoder().encode(data);
    if (bytes.length === 0 || bytes.length > 7000) return new Uint8Array(0);
    const storeLen = bytes.length + 3;
    const parts: number[] = [
      GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00, // function 165: model 2
      GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x07, // function 167: cell size 7
      GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x43, // function 167b: EC level C
      GS, 0x28, 0x6b, storeLen & 0xff, (storeLen >> 8) & 0xff, 0x31, 0x50, 0x30, // function 169: store
      ...bytes,
      GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x00, // function 181: print
    ];
    return new Uint8Array(parts);
  } catch {
    return new Uint8Array(0);
  }
}

/**
 * Build a binary ESC/POS command buffer for direct thermal printer output.
 *
 * Command sequence: ESC @ (init) -> ESC a 1 (center, kept for legacy
 * printers that expect it) -> ESC a 0 (left-align body — the ASCII slip
 * centers its own headers with padding spaces, so the itemized body must
 * print left-aligned) -> ASCII payload -> QR code of the order id ->
 * GS V 65 0 (partial cut).
 *
 * @param columns Paper width: 48 = 80mm (default), 32 = 58mm.
 * @param includeQR Append a scannable QR of the order id (default true).
 */
export function generateESCPOSBuffer(
  kot: ThermalKOTData,
  columns = 48,
  includeQR = true
): Uint8Array {
  const ESC = 0x1b;
  const GS = 0x1d;

  const init = new Uint8Array([ESC, 0x40]); // ESC @
  const centerAlign = new Uint8Array([ESC, 0x61, 0x01]); // ESC a 1
  const leftAlign = new Uint8Array([ESC, 0x61, 0x00]); // ESC a 0
  const payload = new TextEncoder().encode(generateASCIIReceipt(kot, columns));
  const qr = includeQR ? generateQRCodeBlock(kot.orderId || kot.shortCode) : new Uint8Array(0);
  const cut = new Uint8Array([GS, 0x56, 0x41, 0x00]); // GS V 65 0

  const buffer = new Uint8Array(
    init.length + centerAlign.length + leftAlign.length + payload.length + qr.length + cut.length
  );

  let offset = 0;
  for (const chunk of [init, centerAlign, leftAlign, payload, qr, cut]) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }

  return buffer;
}
