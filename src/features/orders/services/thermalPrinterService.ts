import type { Order } from '@/types';

export interface ThermalKOTData {
  orderId: string;
  shortCode: string;
  orderType: string;
  tableNumber?: string;
  branchName: string;
  createdAtFormatted: string;
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

export function formatOrderForKOT(order: Order): ThermalKOTData {
  let rawShortCode =
    (order as any).shortCode ||
    (order as any).orderNumber;

  if (!rawShortCode) {
    // If order.id contains underscore (e.g. ord_detail_8841), take the last segment
    const parts = order.id.split('_');
    rawShortCode = parts[parts.length - 1].toUpperCase();
  }

  const orderDate = order.createdAt?.toDate
    ? order.createdAt.toDate()
    : new Date((order.createdAt as any) || Date.now());

  const createdAtFormatted = orderDate.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const items = (order.items || []).map((item) => {
    const modifiers: string[] = [];
    if ((item as any).modifiers && Array.isArray((item as any).modifiers)) {
      modifiers.push(...(item as any).modifiers);
    }
    if ((item as any).addons && Array.isArray((item as any).addons)) {
      modifiers.push(...(item as any).addons);
    }

    return {
      name: item.name,
      quantity: item.quantity,
      price: item.price,
      modifiers: modifiers.length > 0 ? modifiers : undefined,
      specialInstructions: (item as any).specialInstructions || (item as any).notes,
    };
  });

  return {
    orderId: order.id,
    shortCode: rawShortCode.startsWith('#') ? rawShortCode : `#${rawShortCode}`,
    orderType: order.orderType.toUpperCase(),
    tableNumber: order.tableNumber,
    branchName: order.branchName || 'Burgonomics Store',
    createdAtFormatted,
    items,
    subtotal: order.subtotal || order.total,
    tax: order.tax || 0,
    total: order.total,
    specialNotes: (order as any).specialInstructions || (order as any).customerNotes,
  };
}

/**
 * Generate 80mm Monospace Thermal KOT ASCII Text representation
 */
export function generateASCIIReceipt(kot: ThermalKOTData): string {
  const divider = '========================================';
  const subDivider = '----------------------------------------';

  let text = '';
  text += `${divider}\n`;
  text += `           BURGONOMICS KOT\n`;
  text += `        ${kot.branchName}\n`;
  text += `${divider}\n`;
  text += `Order #: ${kot.shortCode}\n`;
  text += `Type:    ${kot.orderType}${kot.tableNumber ? ` (Table: ${kot.tableNumber})` : ''}\n`;
  text += `Date:    ${kot.createdAtFormatted}\n`;
  text += `${subDivider}\n`;
  text += `Qty  Item                       Amount\n`;
  text += `${subDivider}\n`;

  kot.items.forEach((item) => {
    const itemTotal = item.quantity * item.price;
    text += `${item.quantity}x   ${item.name}\n`;
    text += `     Price: ₹${itemTotal} (₹${item.price} ea)\n`;

    if (item.modifiers && item.modifiers.length > 0) {
      item.modifiers.forEach((mod) => {
        text += `     - ${mod}\n`;
      });
    }

    if (item.specialInstructions) {
      text += `     * Note: ${item.specialInstructions}\n`;
    }
  });

  text += `${subDivider}\n`;
  if (kot.specialNotes) {
    text += `Special Note: ${kot.specialNotes}\n`;
    text += `${subDivider}\n`;
  }
  text += `Total Amount: ₹${kot.total}\n`;
  text += `${divider}\n`;
  text += `      *** KITCHEN COPY ***\n`;
  text += `${divider}\n`;

  return text;
}
